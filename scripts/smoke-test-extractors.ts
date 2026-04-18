/**
 * Smoke test — Phase P-A extractors (post-process.ts).
 *
 * Reads every EN article MDX, splits frontmatter/body, and reports:
 *   - How many articles would have cvss_score populated by the script
 *     (vs what's currently in frontmatter)
 *   - How many would have threat_actor populated
 *   - A handful of concrete before/after examples
 *
 * Run: npx tsx scripts/smoke-test-extractors.ts
 *
 * No files are written. This just measures the uplift we'd get if the
 * extractors had run against existing articles.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  extractCvssScore,
  extractThreatActor,
} from "./pipeline/post-process.js";

const POSTS_DIR = path.resolve(process.cwd(), "content/en/posts");

type Row = {
  slug: string;
  title: string;
  fmCvss: number | null;
  scriptCvss: number | null;
  fmActor: string | null;
  scriptActor: string | null;
};

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  const rows: Row[] = [];

  for (const file of files) {
    const full = path.join(POSTS_DIR, file);
    const raw = fs.readFileSync(full, "utf-8");
    const { data, content } = matter(raw);
    // Source corpus proxy — use body itself. In the real pipeline we have
    // `sources` (RSS stories) but for a smoke test over historical articles
    // we cross-check body against itself. This is lenient (won't catch
    // hallucinations that slipped in) but sufficient to measure extractor
    // RECALL — i.e. how often we'd now populate a field that's currently
    // empty.
    const scriptCvss = extractCvssScore(content, content);
    const scriptActor = extractThreatActor(content);

    rows.push({
      slug: data.slug ?? file.replace(/\.mdx$/, ""),
      title: data.title ?? "",
      fmCvss: typeof data.cvss_score === "number" ? data.cvss_score : null,
      scriptCvss,
      fmActor: data.threat_actor ?? null,
      scriptActor,
    });
  }

  const n = rows.length;
  const fmCvssCount = rows.filter((r) => r.fmCvss !== null).length;
  const scriptCvssCount = rows.filter((r) => r.scriptCvss !== null).length;
  const fmActorCount = rows.filter((r) => r.fmActor !== null).length;
  const scriptActorCount = rows.filter((r) => r.scriptActor !== null).length;

  const wouldFillCvss = rows.filter(
    (r) => r.fmCvss === null && r.scriptCvss !== null,
  );
  const wouldFillActor = rows.filter(
    (r) => r.fmActor === null && r.scriptActor !== null,
  );

  console.log(
    `\n=== Smoke test: Phase P-A extractors on ${n} EN articles ===\n`,
  );

  console.log(`CVSS score coverage:`);
  console.log(
    `  Frontmatter (today):    ${fmCvssCount}/${n}  (${pct(fmCvssCount, n)}%)`,
  );
  console.log(
    `  Script-derived:         ${scriptCvssCount}/${n}  (${pct(scriptCvssCount, n)}%)`,
  );
  console.log(`  Would-fill empty:       ${wouldFillCvss.length} articles\n`);

  console.log(`threat_actor coverage:`);
  console.log(
    `  Frontmatter (today):    ${fmActorCount}/${n}  (${pct(fmActorCount, n)}%)`,
  );
  console.log(
    `  Script-derived:         ${scriptActorCount}/${n}  (${pct(scriptActorCount, n)}%)`,
  );
  console.log(`  Would-fill empty:       ${wouldFillActor.length} articles\n`);

  console.log(`— Sample: CVSS fills (up to 10) —`);
  for (const r of wouldFillCvss.slice(0, 10)) {
    console.log(`  [${r.scriptCvss}]  ${truncate(r.title, 70)}`);
  }

  console.log(`\n— Sample: threat_actor fills (up to 10) —`);
  for (const r of wouldFillActor.slice(0, 10)) {
    console.log(`  [${r.scriptActor}]  ${truncate(r.title, 70)}`);
  }

  // Disagreements — where LLM set a value but script also found a
  // different one. These are worth eyeballing for regressions.
  const disagreeCvss = rows.filter(
    (r) =>
      r.fmCvss !== null && r.scriptCvss !== null && r.fmCvss !== r.scriptCvss,
  );
  const disagreeActor = rows.filter(
    (r) =>
      r.fmActor !== null &&
      r.scriptActor !== null &&
      r.fmActor.toLowerCase() !== r.scriptActor.toLowerCase(),
  );

  console.log(`\n— Disagreements —`);
  console.log(`  CVSS (fm vs script):   ${disagreeCvss.length}`);
  console.log(`  Actor (fm vs script):  ${disagreeActor.length}`);
  for (const r of disagreeCvss.slice(0, 5)) {
    console.log(
      `    cvss  fm=${r.fmCvss}  script=${r.scriptCvss}  ${truncate(r.title, 60)}`,
    );
  }
  for (const r of disagreeActor.slice(0, 5)) {
    console.log(
      `    actor fm="${r.fmActor}"  script="${r.scriptActor}"  ${truncate(r.title, 60)}`,
    );
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

main();
