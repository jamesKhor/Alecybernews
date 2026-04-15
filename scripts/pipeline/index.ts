#!/usr/bin/env node
/**
 * ZCyberNews AI Content Pipeline
 * Usage: npx tsx scripts/pipeline/index.ts [--max-articles=5] [--dry-run]
 *
 * Required env vars:
 *   DEEPSEEK_API_KEY  — article generation
 *   KIMI_API_KEY      — Chinese translation
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { ingestFeeds } from "./ingest-rss.js";
import { generateArticle } from "./generate-article.js";
import { translateArticle } from "./translate-article.js";
import { writeArticlePair, DuplicateArticleError } from "./write-mdx.js";
import { postProcessArticle } from "./post-process.js";
import { factCheckArticle, formatFactCheckLog } from "./fact-check.js";
import { notifyDiscord } from "./notify-discord.js";
import { markProcessedBatch } from "../utils/cache.js";
import { limit } from "../utils/rate-limit.js";

// ── Recent titles loader (for prompt dedup context) ────────────────────────

/**
 * Return the titles of all EN articles published in the last `windowHours`.
 * Passed to the AI prompt so it can detect already-covered stories before
 * spending tokens on a full generation.
 *
 * Uses the same end-of-day UTC trick as daily-ops-digest to avoid the
 * midnight-parsing edge case where YYYY-MM-DD strings fall just outside the
 * cutoff window due to GitHub scheduling lag.
 */
function getRecentPublishedTitles(windowHours = 48): string[] {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const dirs = ["content/en/posts", "content/en/threat-intel"];
  const titles: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mdx"))) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const { data } = matter(raw);
        const iso = String(data.date ?? "");
        const effective = /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? iso + "T23:59:59Z"
          : iso;
        const t = new Date(effective).getTime();
        if (Number.isFinite(t) && t >= cutoff) {
          const title = String(data.title ?? "");
          if (title) titles.push(title);
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return titles;
}

// ── Content relevance filter ────────────────────────────────────────────────

const CYBER_KEYWORDS = [
  "security",
  "cyber",
  "vulnerability",
  "cve",
  "malware",
  "ransomware",
  "phishing",
  "exploit",
  "breach",
  "hack",
  "threat",
  "attack",
  "apt",
  "zero-day",
  "0day",
  "backdoor",
  "trojan",
  "botnet",
  "ddos",
  "firewall",
  "encryption",
  "authentication",
  "patch",
  "advisory",
  "incident",
  "credential",
  "data leak",
  "infosec",
  "siem",
  "edr",
  "soc",
  "pentest",
  "forensic",
  "compliance",
  "gdpr",
  "privacy",
  "surveillance",
  "nist",
  "cryptograph",
  "regulation",
  "governance",
  "spyware",
  "worm",
  "rootkit",
  "keylogger",
  "mitigation",
  "detection",
  "intrusion",
  "endpoint",
  "network security",
  "access control",
  "identity",
];

function isCyberSecurityRelevant(title: string, category: string): boolean {
  // threat-intel, vulnerabilities, malware categories are always relevant
  if (["threat-intel", "vulnerabilities", "malware"].includes(category))
    return true;
  const lower = title.toLowerCase();
  return CYBER_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MAX_ARTICLES = parseInt(
  args.find((a) => a.startsWith("--max-articles="))?.split("=")[1] ?? "5",
  10,
);
const DRY_RUN = args.includes("--dry-run");

// ── Validation ────────────────────────────────────────────────────────────────

function assertEnv(key: string) {
  if (!process.env[key]) {
    console.error(`[pipeline] ❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

if (!DRY_RUN) {
  // Need at least one AI provider — OpenRouter (free) or DeepSeek/Kimi (paid)
  if (
    !process.env.OPENROUTER_API_KEY &&
    !process.env.DEEPSEEK_API_KEY &&
    !process.env.KIMI_API_KEY
  ) {
    console.error(
      "[pipeline] ❌ No AI provider configured. Set OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY.",
    );
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n🚀 ZCyberNews AI Pipeline — max=${MAX_ARTICLES}${DRY_RUN ? " [DRY RUN]" : ""}\n`,
  );

  // 1. Ingest fresh stories from RSS
  const stories = await ingestFeeds(MAX_ARTICLES * 3);

  if (stories.length === 0) {
    console.log("[pipeline] No new stories to process. Exiting.");
    return;
  }

  // 2. Group stories into batches of 1-3 per article
  //    (single high-value stories get their own article; related ones get merged)
  const batches: (typeof stories)[] = [];
  const remaining = [...stories];
  while (remaining.length > 0 && batches.length < MAX_ARTICLES) {
    // Take 1 story per article for now (safest for quality)
    batches.push([remaining.shift()!]);
  }

  console.log(`[pipeline] Will generate ${batches.length} articles\n`);

  if (DRY_RUN) {
    console.log("[pipeline] Dry run — stories that would be processed:");
    batches.forEach((batch, i) => {
      console.log(`  ${i + 1}. ${batch[0]?.title} (${batch[0]?.sourceName})`);
    });
    return;
  }

  // 3. Generate + translate + write — p-limit(3) concurrency
  let skippedOffTopic = 0;
  let skippedDuplicate = 0;
  let skippedFactCheck = 0;
  let translationWarnings = 0;

  // Load titles published in the last 48h to pass as context to the AI prompt.
  // The AI uses this list to self-reject stories it has already covered (e.g.
  // the same Patch Tuesday event from a different RSS source).
  const recentTitles = getRecentPublishedTitles(48);
  console.log(
    `[pipeline] Loaded ${recentTitles.length} recent titles for prompt dedup context`,
  );

  const results = await Promise.allSettled(
    batches.map((batch) =>
      limit(async () => {
        const storyUrls = batch.map((s) => s.url).filter(Boolean);
        const startTime = Date.now();
        console.log(`[pipeline] Generating: "${batch[0]?.title}"…`);

        // Generate EN article — pass recent titles so the AI can self-reject
        // stories that are off-topic or already covered (prompt-level guard).
        const result = await generateArticle(batch, recentTitles);
        if (result === null) {
          console.warn("[pipeline] ⚠️  Generation failed, skipping.");
          return null;
        }
        if (result === "reject") {
          // AI determined off-topic or already covered — counts as off-topic
          skippedOffTopic++;
          markProcessedBatch(storyUrls);
          return null;
        }
        const article = result;

        // Post-generation content relevance filter — belt-and-suspenders check
        // in case the AI didn't reject but still produced off-topic output.
        if (!isCyberSecurityRelevant(article.title, article.category)) {
          console.warn(
            `[pipeline] ⚠️  Off-topic article rejected: "${article.title}" (category: ${article.category})`,
          );
          skippedOffTopic++;
          markProcessedBatch(storyUrls); // Still mark as processed to avoid retrying
          return null;
        }

        // Post-process — script overrides LLM output for structured fields
        // (slug, date, cve_ids, iocs). Script-derived = deterministic = no
        // hallucination possible on these fields. "LLM writes prose, script
        // extracts structured data."
        postProcessArticle(article, batch);

        // Fact-check — regex-based cross-validation of claims against source
        // material. HIGH severity issues block publish. MEDIUM/LOW logged
        // but allowed through. Runs after post-process because post-process
        // may have fixed some issues by filtering invented CVEs.
        const fc = await factCheckArticle(article, batch);
        console.log(`[pipeline] ${formatFactCheckLog(fc)}`);
        if (!fc.passed) {
          console.warn(
            `[pipeline] ❌ Fact-check rejected "${article.title}" — ${fc.issues.filter((i) => i.severity === "high").length} high-severity issues`,
          );
          skippedFactCheck++;
          markProcessedBatch(storyUrls);
          return null;
        }

        // Translate to ZH
        console.log(`[pipeline] Translating: "${article.title}"…`);
        let zhMeta = await translateArticle(article);

        // Translation quality gate
        if (zhMeta) {
          const bodyRatio = zhMeta.body.length / article.body.length;
          const hasMainlyChinese = /[\u4e00-\u9fff]/.test(zhMeta.body);
          const tooShort = zhMeta.body.length < 100;

          if (tooShort || !hasMainlyChinese || bodyRatio < 0.3) {
            console.warn(
              `[pipeline] ⚠️  Translation quality check failed (ratio=${bodyRatio.toFixed(2)}, chinese=${hasMainlyChinese}, len=${zhMeta.body.length}). Publishing EN only.`,
            );
            zhMeta = null;
            translationWarnings++;
          }
        }

        // Write MDX files (with shift-right duplicate check)
        let paths: { en: string; zh: string | null };
        try {
          paths = writeArticlePair(article, zhMeta, storyUrls);
        } catch (err) {
          if (err instanceof DuplicateArticleError) {
            // SHIFT-RIGHT TRIPPED: article passed RSS-side dedup but the
            // generated output matches an existing article on disk. Skip
            // write, mark sources as processed (so we don't retry next
            // run), and emit a structured log so we can monitor frequency.
            console.warn(
              `[pipeline] 🛡️  DUPLICATE BLOCKED: "${article.title}" — ${err.message}`,
            );
            console.log(
              JSON.stringify({
                event: "article_blocked_duplicate",
                attempted_slug: err.attemptedSlug,
                attempted_title: err.attemptedTitle,
                matched_slug: err.duplicate.matchedSlug,
                matched_title: err.duplicate.matchedTitle,
                match_type: err.duplicate.matchType,
                similarity: err.duplicate.similarity,
              }),
            );
            skippedDuplicate++;
            markProcessedBatch(storyUrls);
            return null;
          }
          throw err;
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        // Structured log line
        console.log(
          JSON.stringify({
            event: "article_written",
            slug: article.slug,
            category: article.category,
            locale: zhMeta ? "en+zh" : "en",
            duration_s: duration,
            word_count: article.body.split(/\s+/).length,
          }),
        );

        console.log(`[pipeline] ✅  Written: ${paths.en} (${duration}s)`);
        if (paths.zh) console.log(`[pipeline] ✅  Written: ${paths.zh}`);

        // Discord notification — fire-and-forget. Posts to #en-news-feed
        // (and #zh-news-feed if ZH translation shipped). Silent skip if
        // DISCORD_WEBHOOK_{EN,ZH} env vars aren't set. Never blocks or
        // fails the pipeline on Discord errors.
        const section: "posts" | "threat-intel" =
          article.category === "threat-intel" ? "threat-intel" : "posts";
        notifyDiscord(article, "en", section).catch((e) =>
          console.warn("[discord] en unexpected error:", e),
        );
        if (zhMeta && paths.zh) {
          // Build a ZH-titled version for the ZH channel
          const zhArticle = {
            ...article,
            title: zhMeta.title || article.title,
            excerpt: zhMeta.excerpt || article.excerpt,
          };
          notifyDiscord(zhArticle, "zh", section).catch((e) =>
            console.warn("[discord] zh unexpected error:", e),
          );
        }

        // Mark source URLs as processed
        markProcessedBatch(storyUrls);

        return { article, paths };
      }),
    ),
  );

  // 4. Summary
  const succeeded = results.filter(
    (r) => r.status === "fulfilled" && r.value,
  ).length;
  const failed =
    results.length -
    succeeded -
    skippedOffTopic -
    skippedDuplicate -
    skippedFactCheck;

  console.log(
    `\n📊 Pipeline complete: ${succeeded} written, ${skippedDuplicate} duplicates blocked, ${skippedOffTopic} off-topic rejected, ${skippedFactCheck} fact-check rejected, ${translationWarnings} translation warnings, ${failed} failed\n`,
  );

  // Write run summary as JSON
  console.log(
    JSON.stringify({
      event: "pipeline_complete",
      timestamp:
        new Date().toLocaleString("en-GB", { timeZone: "Asia/Singapore" }) +
        " SGT",
      articles_written: succeeded,
      duplicates_blocked: skippedDuplicate,
      off_topic_rejected: skippedOffTopic,
      fact_check_rejected: skippedFactCheck,
      translation_warnings: translationWarnings,
      failed,
    }),
  );

  if (failed > 0) process.exit(1);
}

main()
  .then(() => {
    // Force exit even if pending async handles (e.g., undici keep-alive
    // sockets from failed OpenRouter retries) would otherwise keep the
    // Node event loop alive. Without this, the pipeline process hangs
    // after logging "pipeline_complete" because ~30+ HTTP connections
    // to rate-limited free models remain in the connection pool.
    // GitHub Actions doesn't progress to the next step until tsx exits.
    process.exit(0);
  })
  .catch((err) => {
    console.error("[pipeline] Fatal error:", err);
    process.exit(1);
  });
