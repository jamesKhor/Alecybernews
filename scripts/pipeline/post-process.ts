/**
 * Post-process — runs AFTER article generation, BEFORE fact-check + write.
 *
 * Implements the core principle: "LLM writes prose, script extracts
 * structured data." Instead of trusting the LLM to fill structured fields
 * (slug, date, cve_ids, iocs) correctly, we derive them deterministically
 * from the generated body + source material.
 *
 * This prevents:
 *   - Hallucinated CVE IDs (LLM invents CVE-2026-XXXXX)
 *   - Slug drift (LLM generates slug that doesn't match title)
 *   - Wrong dates (LLM puts source article's date instead of today)
 *   - Duplicate or non-normalized tags
 *
 * Idempotent — safe to run multiple times.
 */
import type { GeneratedArticle } from "../ai/schemas/article-schema.js";
import type { Story } from "../utils/dedup.js";

// ── Regex (shared with fact-check) ────────────────────────────────────────

const CVE_REGEX = /CVE-\d{4}-\d{4,}/g;
const MD5_REGEX = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_REGEX = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_REGEX = /\b[a-fA-F0-9]{64}\b/g;
const IPV4_REGEX =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a title string.
 *
 * Rules (chosen to match what the pipeline has historically produced so
 * existing links don't break):
 *   - lowercase
 *   - strip non-ASCII (prevents Chinese titles producing unicode slugs)
 *   - collapse whitespace + punctuation to a single hyphen
 *   - trim leading/trailing hyphens
 *   - truncate to 80 chars at a word boundary
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\x20-\x7e]/g, "") // strip non-ASCII
    .replace(/['']/g, "") // strip apostrophes
    .replace(/[^a-z0-9]+/g, "-") // non-alphanum → hyphen
    .replace(/^-+|-+$/g, "") // trim hyphens
    .slice(0, 80)
    .replace(/-+$/, ""); // re-trim after slice
}

function uniqueMatches(str: string, re: RegExp): string[] {
  const m = str.match(re) ?? [];
  return Array.from(new Set(m));
}

function normalizedIncludes(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase().replace(/\s+/g, " ");
  const n = needle.toLowerCase().replace(/\s+/g, " ");
  return h.includes(n);
}

function buildSourceCorpus(sources: Story[]): string {
  return sources.map((s) => `${s.title} ${s.excerpt ?? ""}`).join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Post-process a generated article. Mutates and returns the same object.
 *
 * Overrides LLM output for structured fields where a deterministic value
 * is safer than a generated one.
 *
 * Note: the article's `date` is set inside write-mdx.ts (not part of
 * GeneratedArticleSchema) so we don't touch it here.
 */
export function postProcessArticle(
  article: GeneratedArticle,
  sources: Story[],
): GeneratedArticle {
  const sourceText = buildSourceCorpus(sources);

  // ── 1. Slug — always derived from title ────────────────────────────────
  // Reason: LLM sometimes drops words or adds date prefix or typos.
  article.slug = slugify(article.title);

  // ── 2. cve_ids — rebuild from body + cross-check with sources ──────────
  // Only keep CVEs that appear BOTH in the article body AND in source
  // material. This prevents the LLM from inventing a plausible-looking
  // CVE ID that doesn't exist in the real reporting.
  const bodyCves = uniqueMatches(article.body, CVE_REGEX);
  const sourceCves = uniqueMatches(sourceText.toUpperCase(), CVE_REGEX);
  article.cve_ids = bodyCves.filter((c) => sourceCves.includes(c));

  // ── 4. IOCs — rebuild from body + cross-check with sources ─────────────
  // Only include hashes/IPs that appear in the body AND in source text.
  // Domains are harder to regex cleanly — we leave those to the LLM for
  // now but could add a TLD-bound regex later.
  const bodyHashes = [
    ...uniqueMatches(article.body, MD5_REGEX).map((h) => ({
      type: "hash_md5" as const,
      value: h,
    })),
    ...uniqueMatches(article.body, SHA1_REGEX).map((h) => ({
      type: "hash_sha1" as const,
      value: h,
    })),
    ...uniqueMatches(article.body, SHA256_REGEX).map((h) => ({
      type: "hash_sha256" as const,
      value: h,
    })),
  ];
  const bodyIps = uniqueMatches(article.body, IPV4_REGEX)
    .filter(
      (ip) =>
        !ip.startsWith("192.168.") &&
        !ip.startsWith("10.") &&
        ip !== "127.0.0.1",
    )
    .map((ip) => ({ type: "ip" as const, value: ip }));

  const verifiedIocs: typeof article.iocs = [];
  for (const ioc of [...bodyHashes, ...bodyIps]) {
    if (normalizedIncludes(sourceText, ioc.value)) {
      verifiedIocs.push({
        type: ioc.type,
        value: ioc.value,
        description: "Extracted from source material",
        confidence: "high",
      });
    }
  }
  // Preserve any LLM-provided IOCs that were domains/emails (types we don't regex)
  const nonRegexedIocs = (article.iocs ?? []).filter(
    (i) =>
      i.type !== "hash_md5" &&
      i.type !== "hash_sha1" &&
      i.type !== "hash_sha256" &&
      i.type !== "ip",
  );
  article.iocs = [...verifiedIocs, ...nonRegexedIocs];

  // ── 5. Tags — normalize (lowercase, dedup, strip whitespace) ──────────
  if (Array.isArray(article.tags)) {
    const cleaned = article.tags
      .map((t) => String(t).toLowerCase().trim())
      .filter((t) => t.length > 0 && t.length < 40);
    article.tags = Array.from(new Set(cleaned));
  }

  // ── 6. Title — hard truncate to 80 chars (we said so in the prompt) ────
  if (article.title.length > 80) {
    // Truncate at last space before 80 chars
    const cut = article.title.slice(0, 80).replace(/\s+\S*$/, "");
    article.title = cut || article.title.slice(0, 80);
  }

  return article;
}
