#!/usr/bin/env tsx
/**
 * Daily budget snapshot — estimated LLM + infra spend.
 *
 * Runs as a script (not an agent). Estimates monthly spend from article
 * generation volume × per-article token estimate × published rates.
 *
 * True-up requires billing-API integration (DeepSeek, OpenRouter, Kimi,
 * VPS provider). This v1 gets us to "watching the trendline" today;
 * billing API integration is a future enhancement.
 *
 * Alerts Telegram when estimated monthly spend exceeds MONTHLY_BUDGET_USD
 * threshold (default $50/mo — adjust via env).
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";

// ── Config ─────────────────────────────────────────────────────────────────

// Per-article cost estimates (USD). Tune as real billing data comes in.
// Based on: article ~3000 output tokens + ~500 input; translation ~2000 output.
const COST_PER_ARTICLE_USD = {
  deepseek: 0.01, // cheap
  kimi: 0.02, // translation
  openrouter_free: 0.0, // rate-limited free tier
  estimated_blended: 0.03, // typical case: 1 EN via deepseek + 1 ZH via kimi
};

const VPS_COST_PER_DAY_USD = 0.25; // Evoxt Malaysia 2GB ≈ $7/mo
const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_BUDGET_USD ?? "50");

// ── CLI args ──────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ───────────────────────────────────────────────────────────────

function countArticlesInMonth(): number {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startMs = start.getTime();

  const dirs = ["content/en/posts", "content/en/threat-intel"];
  let count = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mdx"))) {
      try {
        const { data } = matter(fs.readFileSync(path.join(dir, f), "utf-8"));
        const iso = String(data.date ?? "");
        const effective = /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? iso + "T23:59:59Z"
          : iso;
        const t = new Date(effective).getTime();
        if (Number.isFinite(t) && t >= startMs) count++;
      } catch {
        // skip
      }
    }
  }
  return count;
}

function daysElapsedThisMonth(): number {
  const now = new Date();
  return now.getUTCDate();
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

async function sendTelegramAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const params = new URLSearchParams({
    chat_id: chatId,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
    text,
  });
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const articlesThisMonth = countArticlesInMonth();
  const daysElapsed = daysElapsedThisMonth();
  const daysInMonth = daysInCurrentMonth();

  // LLM estimate (EN + ZH per published article)
  const llmCostSoFar =
    articlesThisMonth * COST_PER_ARTICLE_USD.estimated_blended;

  // Linear projection to end of month
  const dailyRate = articlesThisMonth / Math.max(daysElapsed, 1);
  const projectedArticles = Math.round(dailyRate * daysInMonth);
  const projectedLlmCost =
    projectedArticles * COST_PER_ARTICLE_USD.estimated_blended;

  // VPS cost
  const vpsCostSoFar = daysElapsed * VPS_COST_PER_DAY_USD;
  const projectedVpsCost = daysInMonth * VPS_COST_PER_DAY_USD;

  const totalSoFar = llmCostSoFar + vpsCostSoFar;
  const projectedTotal = projectedLlmCost + projectedVpsCost;
  // Budget guard (2026-04-19): if MONTHLY_BUDGET_USD is 0 or negative,
  // percent-of-budget is meaningless — division produced `Infinity`
  // which then triggered the `>= 80` alert threshold, sending a noisy
  // "% of $0 budget: Infinity%" Telegram message. Treat unconfigured
  // budget as null; skip percent-based alerting.
  const budgetConfigured = MONTHLY_BUDGET_USD > 0;
  const percentOfBudget: number | null = budgetConfigured
    ? (projectedTotal / MONTHLY_BUDGET_USD) * 100
    : null;

  const snapshot = {
    event: "budget_daily",
    timestamp: new Date().toISOString(),
    month_to_date: {
      articles_published: articlesThisMonth,
      days_elapsed: daysElapsed,
      llm_cost_usd: Number(llmCostSoFar.toFixed(2)),
      vps_cost_usd: Number(vpsCostSoFar.toFixed(2)),
      total_cost_usd: Number(totalSoFar.toFixed(2)),
      cost_per_article_usd:
        articlesThisMonth > 0
          ? Number((totalSoFar / articlesThisMonth).toFixed(3))
          : 0,
    },
    projection_full_month: {
      articles: projectedArticles,
      llm_cost_usd: Number(projectedLlmCost.toFixed(2)),
      vps_cost_usd: Number(projectedVpsCost.toFixed(2)),
      total_cost_usd: Number(projectedTotal.toFixed(2)),
      percent_of_budget:
        percentOfBudget !== null ? Number(percentOfBudget.toFixed(1)) : null,
    },
    budget_usd: MONTHLY_BUDGET_USD,
    alert_triggered: percentOfBudget !== null && percentOfBudget >= 80,
  };

  console.log(JSON.stringify(snapshot));

  if (!DRY_RUN) {
    fs.mkdirSync("data", { recursive: true });
    const file = "data/budget-daily.json";
    let history: unknown[] = [];
    if (fs.existsSync(file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (Array.isArray(raw)) history = raw;
      } catch {
        // start fresh
      }
    }
    history.push(snapshot);
    fs.writeFileSync(file, JSON.stringify(history.slice(-90), null, 2));
  }

  if (snapshot.alert_triggered && !DRY_RUN) {
    // Guaranteed non-null inside this branch because alert_triggered
    // can only be true when percentOfBudget !== null (see snapshot
    // computation above). TypeScript narrowing doesn't pick that up
    // through the snapshot object, so we assert here.
    const pct = percentOfBudget as number;
    const alert = [
      "⚠️ <b>ZCyberNews budget alert</b>",
      "",
      `<b>Month-to-date</b>`,
      `• Articles: ${articlesThisMonth} (${daysElapsed}/${daysInMonth} days)`,
      `• Cost so far: $${totalSoFar.toFixed(2)}`,
      `• Cost per article: $${snapshot.month_to_date.cost_per_article_usd}`,
      "",
      `<b>Projected full month</b>`,
      `• Articles: ${projectedArticles}`,
      `• Total cost: $${projectedTotal.toFixed(2)}`,
      `• % of $${MONTHLY_BUDGET_USD} budget: ${pct.toFixed(1)}%`,
      "",
      "<i>Run /budget-optimize with Eric to review.</i>",
    ].join("\n");
    await sendTelegramAlert(alert);
    console.log("[budget] Alert sent to Telegram");
  }
}

main().catch((e) => {
  console.error("[budget] failed:", e);
  process.exit(1);
});
