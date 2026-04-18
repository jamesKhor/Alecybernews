/**
 * One-off: hyphenate space-containing tags in existing MDX frontmatter.
 *
 * Triggered by Google Search Console 2026-04-18 showing `/en/tags/vulnerability
 * management` as a 404 — the tag was stored with a space in frontmatter, then
 * the URL version percent-encoded the space, and the route handler couldn't
 * match because listing indexes hyphenated slugs.
 *
 * Scans content/en/posts, content/en/threat-intel, content/zh/posts,
 * content/zh/threat-intel. Only rewrites the YAML `tags:` array inside
 * frontmatter — never touches body content.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: npx tsx scripts/fix-space-tags.ts
 */
import fs from "node:fs";
import path from "node:path";

const DIRS = [
  "content/en/posts",
  "content/en/threat-intel",
  "content/zh/posts",
  "content/zh/threat-intel",
];

function fixFile(filePath: string): { changed: boolean; diff?: string } {
  const raw = fs.readFileSync(filePath, "utf-8");
  // Match frontmatter — between first pair of --- lines.
  // Support both LF and CRLF line endings (Windows commits in this repo
  // are CRLF; CI on Linux is LF).
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return { changed: false };

  const block = fmMatch[1];
  // Match a YAML `tags:` block: the line `tags:` followed by one or more
  // `  - value` lines.
  const tagsRe = /(^tags:\r?\n(?:[ \t]+- [^\r\n]+\r?\n)+)/m;
  const tagsMatch = block.match(tagsRe);
  if (!tagsMatch) return { changed: false };

  const oldTagsBlock = tagsMatch[1];
  // Per-line: hyphenate spaces inside tag value. Preserve indentation
  // AND the original line ending (CRLF vs LF).
  const newTagsBlock = oldTagsBlock.replace(
    /^([ \t]+- )([^\r\n]+)(\r?\n)/gm,
    (_m, prefix: string, value: string, eol: string) => {
      const fixed = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
      return prefix + fixed + eol;
    },
  );

  if (oldTagsBlock === newTagsBlock) return { changed: false };

  const newRaw = raw.replace(oldTagsBlock, newTagsBlock);
  fs.writeFileSync(filePath, newRaw);
  return {
    changed: true,
    diff: `  OLD:\n${oldTagsBlock.trimEnd().replace(/^/gm, "    ")}\n  NEW:\n${newTagsBlock.trimEnd().replace(/^/gm, "    ")}`,
  };
}

function main() {
  let scanned = 0;
  let fixed = 0;
  const samples: string[] = [];

  for (const dir of DIRS) {
    const abs = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith(".mdx")) continue;
      scanned++;
      const full = path.join(abs, f);
      const result = fixFile(full);
      if (result.changed) {
        fixed++;
        if (samples.length < 3) {
          samples.push(`${dir}/${f}\n${result.diff}`);
        }
      }
    }
  }

  console.log(`Scanned ${scanned} MDX files, fixed ${fixed}.`);
  if (samples.length > 0) {
    console.log(`\n--- Sample diffs (first 3) ---`);
    for (const s of samples) console.log(s + "\n");
  }
}

main();
