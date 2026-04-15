#!/usr/bin/env tsx
/**
 * Daily analytics snapshot — content-layer metrics from the filesystem.
 *
 * Runs as a script (not an agent) per the core principle: deterministic
 * counting belongs in a script, not in LLM tokens.
 *
 * What it tracks (that doesn't require a paid analytics service):
 *   - Article count by locale + category
 *   - Articles published in last 24h / 7d
 *   - EN/ZH translation parity (missing ZH counterparts)
 *   - Distribution by severity (threat-intel breakdown)
 *   - Top tags by frequency
 *
 * What it does NOT track (needs Vercel Analytics / Nginx logs):
 *   - Bounce rate, pageviews, referrers — TODO once logging is set up
 *
 * Output:
 *   - Structured JSON to stdout (for workflow log)
 *   - Writes data/analytics-daily.json (for historical trend)
 *   - If TELEGRAM_BOT_TOKEN set: sends weekly summary on Sundays only
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// ── Helpers ────────────────────────────────────────────────────────────────

type ArticleMeta = {
  locale: "en" | "zh";
  section: "posts" | "threat-intel";
  file: string;
  date: string;
  category: string;
  tags: string[];
  severity?: string;
  title: string;
};

function loadAllArticles(): ArticleMeta[] {
  const out: ArticleMeta[] = [];
  const roots = [
    {
      locale: "en" as const,
      section: "posts" as const,
      dir: "content/en/posts",
    },
    {
      locale: "en" as const,
      section: "threat-intel" as const,
      dir: "content/en/threat-intel",
    },
    {
      locale: "zh" as const,
      section: "posts" as const,
      dir: "content/zh/posts",
    },
    {
      locale: "zh" as const,
      section: "threat-intel" as const,
      dir: "content/zh/threat-intel",
    },
  ];
  for (const { locale, section, dir } of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mdx"))) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const { data } = matter(raw);
        out.push({
          locale,
          section,
          file: f,
          date: String(data.date ?? ""),
          category: String(data.category ?? "uncategorized"),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          severity: data.severity ? String(data.severity) : undefined,
          title: String(data.title ?? ""),
        });
      } catch {
        // skip
      }
    }
  }
  return out;
}

function parseDate(iso: string): number {
  // Handle YYYY-MM-DD as end-of-day UTC (same trick as daily-ops-digest)
  const s = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T23:59:59Z" : iso;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

function countInWindow(articles: ArticleMeta[], hours: number): number {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return articles.filter((a) => parseDate(a.date) >= cutoff).length;
}

function topN<T extends string>(
  items: T[],
  n: number,
): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log("[analytics] Loading articles…");
  const all = loadAllArticles();
  console.log(`[analytics] Loaded ${all.length} articles`);

  const en = all.filter((a) => a.locale === "en");
  const zh = all.filter((a) => a.locale === "zh");

  // Translation parity
  const enFiles = new Set(en.map((a) => a.file));
  const zhFiles = new Set(zh.map((a) => a.file));
  const missingZh = [...enFiles].filter((f) => !zhFiles.has(f));
  const missingEn = [...zhFiles].filter((f) => !enFiles.has(f));

  const snapshot = {
    event: "analytics_daily",
    timestamp: new Date().toISOString(),
    totals: {
      en_posts: en.filter((a) => a.section === "posts").length,
      en_threat_intel: en.filter((a) => a.section === "threat-intel").length,
      zh_posts: zh.filter((a) => a.section === "posts").length,
      zh_threat_intel: zh.filter((a) => a.section === "threat-intel").length,
      total: all.length,
    },
    published_in_last: {
      "24h": countInWindow(en, 24),
      "7d": countInWindow(en, 24 * 7),
      "30d": countInWindow(en, 24 * 30),
    },
    translation_parity: {
      missing_zh: missingZh.length,
      missing_en: missingEn.length,
      parity_ratio:
        enFiles.size > 0 ? (zhFiles.size / enFiles.size).toFixed(3) : "0",
    },
    top_categories: topN(
      en.map((a) => a.category),
      10,
    ),
    top_tags: topN(
      en.flatMap((a) => a.tags),
      15,
    ),
    severity_breakdown: topN(
      en.filter((a) => a.severity).map((a) => a.severity!),
      10,
    ),
  };

  // Write to disk for historical trend
  if (!DRY_RUN) {
    fs.mkdirSync("data", { recursive: true });
    const dailyFile = "data/analytics-daily.json";
    // Append to history if file exists
    let history: unknown[] = [];
    if (fs.existsSync(dailyFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(dailyFile, "utf-8"));
        if (Array.isArray(raw)) history = raw;
      } catch {
        // start fresh
      }
    }
    history.push(snapshot);
    // Keep last 90 snapshots (about 3 months)
    const trimmed = history.slice(-90);
    fs.writeFileSync(dailyFile, JSON.stringify(trimmed, null, 2));
    console.log(
      `[analytics] Wrote ${dailyFile} (${trimmed.length} snapshots retained)`,
    );
  }

  // Structured JSON to stdout
  console.log(JSON.stringify(snapshot));

  // Telegram summary — only on Sundays (reduces noise)
  const today = new Date();
  const isSunday = today.getUTCDay() === 0;
  if (
    isSunday &&
    !DRY_RUN &&
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_CHAT_ID
  ) {
    sendTelegramWeekly(snapshot).catch((e) =>
      console.error("[analytics] Telegram send failed:", e),
    );
  }
}

type Snapshot = {
  totals: Record<string, number>;
  published_in_last: Record<string, number>;
  translation_parity: {
    missing_zh: number;
    missing_en: number;
    parity_ratio: string;
  };
  top_categories: { value: string; count: number }[];
  top_tags: { value: string; count: number }[];
  severity_breakdown: { value: string; count: number }[];
};

async function sendTelegramWeekly(snap: Snapshot): Promise<void> {
  const t = snap.totals;
  const w = snap.published_in_last;
  const lines = [
    "📊 <b>ZCyberNews weekly analytics</b>",
    "",
    `<b>Totals</b>`,
    `• EN: ${t.en_posts} posts · ${t.en_threat_intel} threat-intel`,
    `• ZH: ${t.zh_posts} posts · ${t.zh_threat_intel} threat-intel`,
    `• Grand total: ${t.total}`,
    "",
    `<b>This period</b>`,
    `• Last 24h: ${w["24h"]}`,
    `• Last 7d: ${w["7d"]}`,
    `• Last 30d: ${w["30d"]}`,
    "",
    `<b>Translation parity</b>`,
    `• Ratio: ${snap.translation_parity.parity_ratio}`,
    `• Missing ZH: ${snap.translation_parity.missing_zh}`,
    "",
    `<b>Top categories</b>`,
    ...snap.top_categories.slice(0, 5).map((c) => `• ${c.value}: ${c.count}`),
  ];
  const params = new URLSearchParams({
    chat_id: process.env.TELEGRAM_CHAT_ID!,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
    text: lines.join("\n"),
  });
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
  console.log("[analytics] Weekly Telegram summary sent");
}

main();
