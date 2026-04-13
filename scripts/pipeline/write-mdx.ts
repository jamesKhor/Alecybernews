import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { GeneratedArticle } from "../ai/schemas/article-schema.js";
import type { TranslatedMeta } from "./translate-article.js";

const CONTENT_DIR = path.join(process.cwd(), "content");

/** Detect CJK characters (Chinese/Japanese/Korean) in text */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * Valid CVE format: CVE-YYYY-NNNNN (year + at least 4 digits).
 * Anything with x's, X's, or fewer than 4 trailing digits is a placeholder.
 */
const VALID_CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const PLACEHOLDER_CVE_RE = /CVE-\d{4}-[xX]{2,}[xX\d]*/g;

/**
 * Strip placeholder/hallucinated CVE IDs from article body text.
 * Replaces patterns like "CVE-2026-xxxxx" with "a zero-day vulnerability".
 */
function sanitizePlaceholderCVEs(body: string): string {
  if (!PLACEHOLDER_CVE_RE.test(body)) return body;
  console.warn(
    `[write] WARNING: Placeholder CVE IDs found in article body — stripping`,
  );
  // Reset regex lastIndex after .test()
  PLACEHOLDER_CVE_RE.lastIndex = 0;
  return body.replace(PLACEHOLDER_CVE_RE, "a zero-day vulnerability");
}

/**
 * Filter cve_ids array to only valid CVE format, stripping placeholders.
 */
function filterValidCVEs(cveIds: string[]): string[] {
  const valid = cveIds.filter((id) => VALID_CVE_RE.test(id));
  const rejected = cveIds.filter((id) => !VALID_CVE_RE.test(id));
  if (rejected.length > 0) {
    console.warn(
      `[write] Stripped invalid CVE IDs from frontmatter: ${rejected.join(", ")}`,
    );
  }
  return valid;
}

/**
 * Validate that EN content doesn't contain Chinese characters
 * and ZH content has Chinese in the body (not just English).
 * Logs a warning and strips CJK from EN articles to prevent contamination.
 */
function validateLanguage(locale: "en" | "zh", body: string): string {
  if (locale === "en" && CJK_RE.test(body)) {
    console.warn(
      `[write] WARNING: Chinese characters detected in EN article — stripping CJK characters`,
    );
    // Replace runs of CJK characters (and adjacent Chinese punctuation) with empty string
    return body
      .replace(
        /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]+/g,
        " ",
      )
      .replace(/ {2,}/g, " ");
  }
  return body;
}

function buildFrontmatter(
  article: GeneratedArticle,
  locale: "en" | "zh",
  date: string,
  datedSlug: string,
  sourceUrls: string[],
  overrides?: Partial<{ title: string; excerpt: string; locale_pair: string }>,
): Record<string, unknown> {
  const fm: Record<string, unknown> = {
    title: overrides?.title ?? article.title,
    slug: datedSlug,
    date,
    excerpt: overrides?.excerpt ?? article.excerpt,
    category: article.category,
    tags: article.tags,
    language: locale,
    source_urls: sourceUrls,
    author: "ZCyberNews",
    draft: false,
  };

  if (overrides?.locale_pair) fm.locale_pair = overrides.locale_pair;
  if (article.severity) fm.severity = article.severity;
  if (article.cvss_score !== null) fm.cvss_score = article.cvss_score;
  const validCves = filterValidCVEs(article.cve_ids);
  if (validCves.length) fm.cve_ids = validCves;
  if (article.threat_actor) fm.threat_actor = article.threat_actor;
  if (article.threat_actor_origin)
    fm.threat_actor_origin = article.threat_actor_origin;
  if (article.affected_sectors.length)
    fm.affected_sectors = article.affected_sectors;
  if (article.affected_regions.length)
    fm.affected_regions = article.affected_regions;
  if (article.iocs.length) fm.iocs = article.iocs;
  if (article.ttp_matrix.length) fm.ttp_matrix = article.ttp_matrix;

  return fm;
}

function writeMdx(
  locale: "en" | "zh",
  type: "posts" | "threat-intel",
  datedSlug: string,
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const dir = path.join(CONTENT_DIR, locale, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${datedSlug}.mdx`);
  const langCleanBody = validateLanguage(locale, body);
  const cleanBody = sanitizePlaceholderCVEs(langCleanBody);
  const file = matter.stringify(cleanBody, frontmatter);
  fs.writeFileSync(filePath, file, "utf-8");
  console.log(`[write] ${filePath}`);
  return filePath;
}

/** Write both EN and ZH MDX files for a generated article. */
export function writeArticlePair(
  article: GeneratedArticle,
  zhMeta: TranslatedMeta | null,
  sourceUrls: string[] = [],
): { en: string; zh: string | null } {
  const date = new Date().toISOString().split("T")[0]!;
  // Add date prefix to slug for unique filenames and consistent naming with manual articles
  const datedSlug = `${date}-${article.slug}`;
  const type: "posts" | "threat-intel" =
    article.category === "threat-intel" ? "threat-intel" : "posts";

  // English
  const enFm = buildFrontmatter(article, "en", date, datedSlug, sourceUrls, {
    locale_pair: zhMeta ? datedSlug : undefined,
  });
  const enPath = writeMdx("en", type, datedSlug, enFm, article.body);

  // Chinese (if translation succeeded)
  let zhPath: string | null = null;
  if (zhMeta) {
    const zhFm = buildFrontmatter(article, "zh", date, datedSlug, sourceUrls, {
      title: zhMeta.title,
      excerpt: zhMeta.excerpt,
      locale_pair: datedSlug,
    });
    zhPath = writeMdx("zh", type, datedSlug, zhFm, zhMeta.body);
  }

  return { en: enPath, zh: zhPath };
}
