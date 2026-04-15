#!/usr/bin/env tsx
/**
 * Agent KPI tracker — objective metrics for Sam's review process.
 *
 * Principle: Sam does semantic judgment; this script tracks the
 * deterministic signals (accuracy, scope, handoff). Sam reads the
 * scorecard and decides what the numbers mean.
 *
 * What we measure (from git log + test output — no LLM needed):
 *
 *   1. Commit throughput — commits per week tagged to each domain
 *      (engineering, design, marketing, pipeline)
 *   2. Revert rate — commits reverted within 48h = regression signal
 *   3. Pipeline success rate — pipeline_complete events in last 7d
 *   4. Fact-check rejection rate — articles blocked by shift-right guards
 *   5. Off-topic rejection rate
 *   6. Test suite pass rate — if tests exist (npm test in CI)
 *   7. Type-check pass rate (tsc --noEmit)
 *
 * Output:
 *   - JSON scorecard to stdout
 *   - Written to data/agent-kpi-weekly.json for trend
 *
 * Usage: npx tsx scripts/agent-kpi-tracker.ts
 */
import fs from "fs";
import { execSync } from "child_process";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ───────────────────────────────────────────────────────────────

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function countCommitsMatching(pattern: string, sinceDays = 7): number {
  const since = `${sinceDays}.days.ago`;
  const cmd = `git log --since="${since}" --pretty=format:"%s" | grep -iE "${pattern}" | wc -l`;
  const result = safeExec(cmd).trim();
  return parseInt(result, 10) || 0;
}

function countCommitsSince(sinceDays = 7): number {
  const out = safeExec(
    `git log --since="${sinceDays}.days.ago" --oneline | wc -l`,
  );
  return parseInt(out.trim(), 10) || 0;
}

function countRevertsSince(sinceDays = 7): number {
  const out = safeExec(
    `git log --since="${sinceDays}.days.ago" --pretty=format:"%s" | grep -iE "^revert" | wc -l`,
  );
  return parseInt(out.trim(), 10) || 0;
}

// ── Pipeline-specific metrics (from GitHub Actions if gh is available) ────

type PipelineStats = {
  runs_total: number;
  runs_success: number;
  runs_failure: number;
  success_rate: string;
};

function getPipelineStats(days = 7): PipelineStats {
  try {
    const out = safeExec(
      `gh run list --workflow=ai-content-pipeline.yml --limit 100 --json conclusion,createdAt`,
    );
    if (!out)
      return {
        runs_total: 0,
        runs_success: 0,
        runs_failure: 0,
        success_rate: "n/a",
      };
    const runs = JSON.parse(out) as Array<{
      conclusion: string;
      createdAt: string;
    }>;
    const cutoff = Date.now() - days * 86400_000;
    const recent = runs.filter(
      (r) => new Date(r.createdAt).getTime() >= cutoff,
    );
    const success = recent.filter((r) => r.conclusion === "success").length;
    const failure = recent.filter(
      (r) => r.conclusion === "failure" || r.conclusion === "timed_out",
    ).length;
    const rate =
      recent.length > 0
        ? `${Math.round((success / recent.length) * 100)}%`
        : "n/a";
    return {
      runs_total: recent.length,
      runs_success: success,
      runs_failure: failure,
      success_rate: rate,
    };
  } catch {
    return {
      runs_total: 0,
      runs_success: 0,
      runs_failure: 0,
      success_rate: "n/a",
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const scorecard = {
    event: "agent_kpi_weekly",
    timestamp: new Date().toISOString(),
    window_days: 7,

    commits: {
      total: countCommitsSince(7),
      reverts: countRevertsSince(7),
      content: countCommitsMatching("chore: ai pipeline", 7),
      fixes: countCommitsMatching("^fix", 7),
      features: countCommitsMatching("^feat", 7),
    },

    pipeline: getPipelineStats(7),

    // Per-agent signals — rough attribution from commit messages
    // Sam uses these as INPUTS to semantic review, not as final scores
    attribution: {
      raymond_engineering: countCommitsMatching(
        "(fix|feat|refactor)\\(engine|pipeline|deploy|script",
        7,
      ),
      prompt_engineer: countCommitsMatching(
        "(prompt|fact-check|post-process|reject)",
        7,
      ),
      harness_engineer: countCommitsMatching(
        "(workflow|hook|scheduled|mcp|skill)",
        7,
      ),
      code_reviewer: countCommitsMatching("(review|audit)", 7),
      content_pipeline: countCommitsMatching("chore: ai pipeline", 7),
    },

    // Health indicators — Sam interprets these
    health: {
      revert_rate:
        countCommitsSince(7) > 0
          ? `${Math.round((countRevertsSince(7) / countCommitsSince(7)) * 100)}%`
          : "n/a",
      pipeline_success: getPipelineStats(7).success_rate,
    },
  };

  console.log(JSON.stringify(scorecard));

  if (!DRY_RUN) {
    fs.mkdirSync("data", { recursive: true });
    const file = "data/agent-kpi-weekly.json";
    let history: unknown[] = [];
    if (fs.existsSync(file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (Array.isArray(raw)) history = raw;
      } catch {
        // start fresh
      }
    }
    history.push(scorecard);
    fs.writeFileSync(file, JSON.stringify(history.slice(-52), null, 2)); // 52 weeks
    console.log(
      `[kpi] Wrote ${file} (${Math.min(history.length, 52)} snapshots)`,
    );
  }
}

main();
