#!/usr/bin/env tsx
/**
 * Daily Ops Digest — runs once/day at 8am SGT (00:00 UTC).
 *
 * Aggregates the last 24h of AI pipeline activity and posts a single
 * Telegram summary so the operator knows the system is healthy without
 * staring at per-run notifications.
 *
 * Design principles:
 *   1. MUST send even on zero activity. Silence must never be ambiguous —
 *      if the digest doesn't arrive, the DIGEST is broken, not the pipeline.
 *   2. Data sources must already exist. No new persistence layer:
 *        - Articles written → count MDX files with yesterday's date prefix
 *        - Run outcomes      → `gh run list` for ai-content-pipeline.yml
 *        - Per-run counters  → grep the `pipeline_complete` structured log
 *          event out of each successful run's logs
 *   3. Single health indicator: 🟢 / 🟡 / 🔴.
 *   4. Fail loud on its own errors — a digest that silently catches an
 *      exception and sends "all green" is worse than no digest at all.
 *
 * Invoked by .github/workflows/daily-ops-digest.yml. Locally: run with
 * --dry-run to preview the message without sending. Requires `gh` CLI
 * authenticated (automatic in Actions via GITHUB_TOKEN).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import matter from "gray-matter";

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WINDOW_HOURS = Number(
  args.find((a) => a.startsWith("--window-hours="))?.split("=")[1] ?? 24,
);

// ── Types ──────────────────────────────────────────────────────────────────

type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "startup_failure"
  | null;

type PipelineRun = {
  databaseId: number;
  conclusion: RunConclusion;
  status: string;
  createdAt: string;
  url: string;
};

type PipelineCompleteEvent = {
  event: "pipeline_complete";
  timestamp: string;
  articles_written: number;
  duplicates_blocked: number;
  off_topic_rejected: number;
  fact_check_rejected?: number; // Added 2026-04-15 — older events don't have this
  translation_warnings: number;
  failed: number;
  // Added 2026-04-19 — sub-category breakdown of the `failed` bucket.
  // Previously the digest showed an opaque "Per-article failures: 28"
  // with no indication of cause. These three fields split that number
  // into actionable categories. Older events won't have these (?? 0
  // fallback on the aggregation side).
  failed_generation?: number; // LLM returned null — timeout, 5xx, JSON parse, schema reject
  failed_exception?: number; // uncaught throw in article pipeline — post-process, write, translate crash
  failed_unclassified?: number; // residual bucket — forward-compat for new failure modes
};

type Digest = {
  windowHours: number;
  articlesOnDisk: number;
  runs: {
    total: number;
    success: number;
    failure: number;
    other: number;
  };
  counters: {
    articlesWritten: number;
    duplicatesBlocked: number;
    offTopicRejected: number;
    factCheckRejected: number;
    translationWarnings: number;
    failed: number;
    failedGeneration: number;
    failedException: number;
    failedUnclassified: number;
  };
  health: "green" | "yellow" | "red";
  failedRunUrls: string[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[digest] ${msg}`);
}

/**
 * Shell out to `gh` CLI with a read timeout. Returns stdout as string.
 * Throws on non-zero exit — we want loud failures, not silent empty data.
 */
function gh(cmd: string, timeoutMs = 60_000): string {
  try {
    return execSync(`gh ${cmd}`, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 100 * 1024 * 1024, // 100MB — individual run logs can be big
    });
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : (e.stderr?.toString("utf-8") ?? "");
    throw new Error(`gh ${cmd} failed: ${stderr || e.message || "unknown"}`);
  }
}

// ── Article counter (filesystem) ───────────────────────────────────────────

/**
 * Count MDX files whose FRONTMATTER `date` field falls inside the window.
 * We trust the frontmatter date (set to today at write time) over file
 * mtime because clones/checkouts reset mtimes.
 *
 * Counts EN only — ZH is always derived 1:1 from EN in this pipeline, so
 * counting both would double-count.
 */
function countArticlesInWindow(windowHours: number): number {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const roots = ["content/en/posts", "content/en/threat-intel"];
  let count = 0;

  for (const rel of roots) {
    const dir = path.join(process.cwd(), rel);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), "utf-8");
        const { data } = matter(raw);
        const dateRaw = data.date;
        const iso =
          dateRaw instanceof Date
            ? dateRaw.toISOString()
            : typeof dateRaw === "string"
              ? dateRaw
              : null;
        if (!iso) continue;
        // Date-only strings (YYYY-MM-DD) must be treated as END-of-day UTC,
        // not midnight. new Date('2026-04-14') = 2026-04-14T00:00:00Z.
        // The digest cron fires at 00:00 UTC but typically runs at 00:10-00:15
        // UTC (GitHub scheduling lag). The 24h cutoff therefore lands at
        // ~2026-04-14T00:13Z, which is 13 minutes AFTER midnight — meaning
        // every article from yesterday (all parsed as T00:00:00Z) falls outside
        // the window and the count reads zero.  Fix: push date-only strings to
        // the last second of that day (T23:59:59Z) so they're unambiguously
        // inside a window that ends around the following midnight.
        const effective = /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? iso + "T23:59:59Z"
          : iso;
        const t = new Date(effective).getTime();
        if (!Number.isFinite(t)) continue;
        if (t >= cutoff) count++;
      } catch {
        // skip unreadable files
      }
    }
  }
  return count;
}

// ── Run history (GitHub API via gh) ────────────────────────────────────────

function listPipelineRuns(windowHours: number): PipelineRun[] {
  // gh run list returns most recent first. Fetch 50 (more than enough for
  // 24h at hourly cadence) and filter by createdAt.
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const raw = gh(
    `run list --workflow=ai-content-pipeline.yml --limit 50 --json databaseId,conclusion,status,createdAt,url`,
  );
  const parsed = JSON.parse(raw) as PipelineRun[];
  return parsed.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
}

/**
 * Fetch the `pipeline_complete` structured event from a single run's logs.
 * Returns null if the event isn't found (run didn't reach the end — e.g.
 * crashed during generation — which is valid data: we just can't tally
 * its counters, but the run's conclusion already tells us it failed).
 */
function fetchPipelineCompleteEvent(
  runId: number,
): PipelineCompleteEvent | null {
  let logs: string;
  try {
    logs = gh(`run view ${runId} --log`, 90_000);
  } catch (err) {
    log(`  run ${runId}: could not fetch logs (${(err as Error).message})`);
    return null;
  }

  // Scan backwards — the event is the LAST thing the pipeline prints. Older
  // lines may contain other JSON events we don't care about.
  const lines = logs.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    // GitHub prefixes every log line with a timestamp + job/step name; the
    // JSON we emit is at the tail of the line.
    const jsonStart = line.indexOf('{"event":"pipeline_complete"');
    if (jsonStart === -1) continue;
    const jsonStr = line.slice(jsonStart);
    try {
      return JSON.parse(jsonStr) as PipelineCompleteEvent;
    } catch {
      // Malformed — keep scanning in case there's an older clean event
      continue;
    }
  }
  return null;
}

// ── Aggregation ────────────────────────────────────────────────────────────

function buildDigest(windowHours: number): Digest {
  log(`Counting articles in last ${windowHours}h…`);
  const articlesOnDisk = countArticlesInWindow(windowHours);
  log(`  ${articlesOnDisk} article(s) on disk with recent date`);

  log(`Listing pipeline runs in last ${windowHours}h…`);
  const runs = listPipelineRuns(windowHours);
  log(`  ${runs.length} run(s) in window`);

  const success = runs.filter((r) => r.conclusion === "success").length;
  const failure = runs.filter(
    (r) =>
      r.conclusion === "failure" ||
      r.conclusion === "timed_out" ||
      r.conclusion === "startup_failure",
  ).length;
  const other = runs.length - success - failure;

  const failedRunUrls = runs
    .filter(
      (r) =>
        r.conclusion === "failure" ||
        r.conclusion === "timed_out" ||
        r.conclusion === "startup_failure",
    )
    .map((r) => r.url);

  // Aggregate per-run counters from their pipeline_complete events.
  // Only successful runs emit this event; failed runs contribute to
  // `failure` count but not to the counters tally.
  log(`Aggregating counters from successful runs…`);
  let articlesWritten = 0;
  let duplicatesBlocked = 0;
  let offTopicRejected = 0;
  let factCheckRejected = 0;
  let translationWarnings = 0;
  let failedArticlesInRuns = 0;
  let failedGeneration = 0;
  let failedException = 0;
  let failedUnclassified = 0;

  const successfulRuns = runs.filter((r) => r.conclusion === "success");
  for (const run of successfulRuns) {
    const event = fetchPipelineCompleteEvent(run.databaseId);
    if (!event) continue;
    // Use ?? 0 for forward-compat: older pipeline_complete events emitted
    // before the safety filters shipped don't have duplicates_blocked /
    // off_topic_rejected / translation_warnings fields. Treating undefined
    // as NaN propagates through the sum and renders as "NaN" in Telegram.
    articlesWritten += event.articles_written ?? 0;
    duplicatesBlocked += event.duplicates_blocked ?? 0;
    offTopicRejected += event.off_topic_rejected ?? 0;
    factCheckRejected += event.fact_check_rejected ?? 0;
    translationWarnings += event.translation_warnings ?? 0;
    failedArticlesInRuns += event.failed ?? 0;
    failedGeneration += event.failed_generation ?? 0;
    failedException += event.failed_exception ?? 0;
    failedUnclassified += event.failed_unclassified ?? 0;
  }

  // Health stoplight — only REAL problems trigger yellow/red.
  //
  // Safety filters WORKING (off-topic rejected, fact-check rejected,
  // duplicates blocked) are GOOD — they mean the guards caught bad
  // content before it published. These should NOT degrade the health
  // indicator. Showing 🟡 for "5 off-topic rejected" confused the
  // operator on 2026-04-16 — the system was healthy, just filtering.
  //
  // 🔴 red    : any pipeline RUN failed (conclusion=failure/timed_out)
  // 🟡 yellow : runs succeeded, but per-article LLM FAILURES or
  //             translation quality issues (actual quality problems)
  // 🟢 green  : all runs OK + no quality issues
  //
  // NOT triggers: offTopicRejected, factCheckRejected, duplicatesBlocked
  // (these are informational — they appear in the Safety Filters section
  // of the digest but don't change the health emoji)
  let health: Digest["health"];
  if (failure > 0) {
    health = "red";
  } else if (failedArticlesInRuns > 0 || translationWarnings > 0) {
    health = "yellow";
  } else {
    health = "green";
  }

  return {
    windowHours,
    articlesOnDisk,
    runs: { total: runs.length, success, failure, other },
    counters: {
      articlesWritten,
      duplicatesBlocked,
      offTopicRejected,
      factCheckRejected,
      translationWarnings,
      failed: failedArticlesInRuns,
      failedGeneration,
      failedException,
      failedUnclassified,
    },
    health,
    failedRunUrls,
  };
}

// ── Message rendering (Telegram HTML) ──────────────────────────────────────

function renderMessage(d: Digest): string {
  const healthEmoji =
    d.health === "green" ? "🟢" : d.health === "yellow" ? "🟡" : "🔴";
  const headlineStatus =
    d.health === "green"
      ? "All systems green"
      : d.health === "yellow"
        ? "Degraded — warnings"
        : "FAILURES detected";

  // Success rate shown as fraction, not percentage, so you can see the
  // denominator at a glance (e.g. "23/24" instantly tells you how many
  // runs happened and how many passed).
  const successFraction = `${d.runs.success}/${d.runs.total}`;

  // Telegram HTML mode — <b>, newlines via real \n (URL-encoded by curl).
  const lines: string[] = [];
  lines.push(`${healthEmoji} <b>ZCyberNews Daily Ops — ${headlineStatus}</b>`);
  lines.push(`Window: last ${d.windowHours}h`);
  lines.push("");
  lines.push(`<b>Articles</b>`);
  lines.push(`• Written: ${d.counters.articlesWritten}`);
  lines.push(`• On disk (recent date): ${d.articlesOnDisk}`);
  lines.push("");
  lines.push(`<b>Runs</b>`);
  lines.push(`• Success: ${successFraction}`);
  if (d.runs.failure > 0) {
    lines.push(`• Failed: ${d.runs.failure}`);
  }
  if (d.runs.other > 0) {
    lines.push(`• Other (cancelled/skipped): ${d.runs.other}`);
  }
  lines.push("");
  lines.push(`<b>Safety filters</b>`);
  lines.push(`• Duplicates blocked: ${d.counters.duplicatesBlocked}`);
  lines.push(`• Off-topic rejected: ${d.counters.offTopicRejected}`);
  lines.push(`• Fact-check rejected: ${d.counters.factCheckRejected}`);
  lines.push(`• Translation warnings: ${d.counters.translationWarnings}`);
  if (d.counters.failed > 0) {
    // Show breakdown when we have sub-category data (new events from
    // 2026-04-19+). For older aggregated periods where all events
    // predate the split, only the total is meaningful.
    const hasBreakdown =
      d.counters.failedGeneration +
        d.counters.failedException +
        d.counters.failedUnclassified >
      0;
    if (hasBreakdown) {
      const parts: string[] = [];
      if (d.counters.failedGeneration > 0) {
        parts.push(`${d.counters.failedGeneration} LLM/JSON`);
      }
      if (d.counters.failedException > 0) {
        parts.push(`${d.counters.failedException} exception`);
      }
      if (d.counters.failedUnclassified > 0) {
        parts.push(`${d.counters.failedUnclassified} unclassified`);
      }
      lines.push(
        `• Per-article failures: ${d.counters.failed} (${parts.join(", ")})`,
      );
    } else {
      lines.push(`• Per-article failures: ${d.counters.failed}`);
    }
  }

  if (d.failedRunUrls.length > 0) {
    lines.push("");
    lines.push(`<b>Failed runs</b>`);
    // Link up to 3 so the message doesn't balloon
    for (const url of d.failedRunUrls.slice(0, 3)) {
      lines.push(`• ${url}`);
    }
    if (d.failedRunUrls.length > 3) {
      lines.push(`• …and ${d.failedRunUrls.length - 3} more`);
    }
  }

  // Zero-activity edge case — explicit reassurance rather than a silent
  // "all zeros" message that looks broken.
  if (d.runs.total === 0) {
    lines.push("");
    lines.push(
      `<i>⚠️ No pipeline runs in window. Check the schedule cron is enabled.</i>`,
    );
  }

  return lines.join("\n");
}

// ── Telegram send ──────────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (or use --dry-run)",
    );
  }

  const params = new URLSearchParams({
    chat_id: chatId,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
    text,
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
  log(`Telegram sent (${res.status})`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting daily ops digest (window=${WINDOW_HOURS}h, dryRun=${DRY_RUN})`);
  const digest = buildDigest(WINDOW_HOURS);
  const message = renderMessage(digest);

  console.log("\n── Digest preview ──");
  console.log(message);
  console.log("── End preview ──\n");

  // Emit structured JSON too so the workflow log has machine-readable state
  // for future dashboards.
  console.log(
    JSON.stringify({
      event: "ops_digest",
      ...digest,
      timestamp: new Date().toISOString(),
    }),
  );

  if (DRY_RUN) {
    log("DRY RUN — not sending");
    return;
  }

  await sendTelegram(message);
  log("Done.");
}

main().catch((err) => {
  console.error("[digest] 💥 failed:", err);
  process.exit(1);
});
