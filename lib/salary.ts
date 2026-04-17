/**
 * Salary explorer — types, helpers, market metadata.
 *
 * Powers the /salary page. Data is sourced from zcyber-xhs's YAML topic
 * banks via the sync script (scripts/sync-career-data.ts) and committed
 * here as static JSON. Cross-project read happens at sync time, not
 * runtime — keeps git histories clean per repo (per portfolio rule in
 * ~/.claude/CLAUDE.md).
 */

import { z } from "zod";

// ── Source schema (matches xhs salary_map.yaml) ──────────────────────────

// `top_hiring` evolved in the source YAML to support TWO shapes:
//   - string[]                              (simple, most records)
//   - { label: string }[]                   (cross-market — labelled by region)
// We normalize to string[] at parse time so consumers see one shape.
const TopHiringEntry = z.union([
  z.string(),
  z.record(z.string(), z.string()).transform((obj) => {
    // {SG: "GovTech / Grab"} → "SG: GovTech / Grab"
    const entries = Object.entries(obj);
    return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
  }),
]);

export const SalaryRecordSchema = z.object({
  slug: z.string(),
  role: z.string(),
  market: z.string(),
  currency: z.string().min(2).max(8),
  entry_salary: z.string(),
  mid_salary: z.string(),
  senior_salary: z.string(),
  yoe_entry: z.string(),
  yoe_mid: z.string(),
  yoe_senior: z.string(),
  // Optional — some HK records include monthly breakdowns for transparency
  monthly_entry: z.string().optional(),
  monthly_mid: z.string().optional(),
  monthly_senior: z.string().optional(),
  top_hiring: z.array(TopHiringEntry).default([]),
  required_certs: z.array(z.string()).default([]),
  hook: z.string().optional(),
  shocking_fact: z.string().optional(),
  // Permissive — some sources are partial URLs or attribution strings.
  // Display layer will only render as a link if it parses as a URL.
  source_url: z.string().optional(),
  category: z.string().optional(),
  // ── Top-of-market / elite tier (optional) ────────────────────────────
  // Senior bands above describe the MEDIAN senior outcome — what most
  // 5-10 YoE professionals reach. `top_tier_*` is for outliers: regional
  // CISO, principal consultant, FAANG security lead, ex-Big4 partner.
  // Editorially separate so the median data stays accurate while we
  // surface the aspirational sticker-shock numbers that XHS readers ask
  // about ("但我朋友的 CISO 一年拿 200 万..."). Sourced from operator's
  // direct industry network for HK; conservative public-source estimates
  // for other markets where we have credible data.
  top_tier_salary: z.string().optional(),
  top_tier_note: z.string().optional(),
  // ── English overrides (optional) ─────────────────────────────────
  // The source YAMLs live in zcyber-xhs (Chinese-audience project) so
  // many text fields are Chinese-only. When displayed on /en/salary
  // they bleed through as mixed-language. Operator caught this on
  // 2026-04-17 after switching language manually.
  //
  // Schema fix: optional `_en` fields that take precedence when the
  // reader locale is "en". If missing, we fall back to the base field
  // (some base fields are already English — SG / AU / MY records
  // mostly — so no override needed there).
  //
  // Populated per-slug in data/salary-data.json via a translation pass;
  // preserved across future YAML syncs by mergePreservedFields().
  role_en: z.string().optional(),
  top_tier_salary_en: z.string().optional(),
  top_tier_note_en: z.string().optional(),
  entry_salary_en: z.string().optional(),
  mid_salary_en: z.string().optional(),
  senior_salary_en: z.string().optional(),
  // Array override. Operator caught 2026-04-18 that several records'
  // top_hiring arrays were ZH-only company names (成都：腾讯成都分部、
  // 华为成都研究所 / 政府机构 DSTA/GovTech / 五大银行网安部门). When
  // present, replaces the whole array on EN view. Length may differ
  // from the base array — some records collapse or expand during
  // translation (e.g. 各市场代表性公司见各市场词条 which is filler
  // and becomes an empty array with [] on EN view).
  top_hiring_en: z.array(z.string()).optional(),
});
export type SalaryRecord = z.infer<typeof SalaryRecordSchema>;

export const CertRecordSchema = z.object({
  slug: z.string(),
  cert_a: z.string(),
  cert_b: z.string(),
  market: z.string(),
  market_note: z.string().optional(),
  angle: z.string().optional(),
  cert_a_cost_usd: z.number(),
  cert_a_cost_local: z.string(),
  cert_b_cost_usd: z.number(),
  cert_b_cost_local: z.string(),
  cert_a_salary_boost: z.string(),
  cert_b_salary_boost: z.string(),
  verdict: z.string(),
  verdict_reason: z.string(),
  category: z.string().optional(),
  // ── English overrides (optional) ─────────────────────────────────
  // Same pattern as SalaryRecord. Source YAMLs in zcyber-xhs are
  // ZH-heavy; these override whichever display fields would otherwise
  // bleed Chinese through to /en/salary.
  //
  // Rules for translation (operator-supplied 2026-04-18):
  //   - Certification acronyms stay verbatim (CISSP, OSCP, CRTO,
  //     GXPN, GREM, CISP, CBEST, etc.) — they're proper nouns even
  //     in Chinese industry contexts. Don't "translate" acronyms.
  //   - Company names → official English (腾讯 → Tencent, 华为 →
  //     Huawei, 阿里云 → Alibaba Cloud, 港交所 → HKEX, 汇丰 → HSBC).
  //   - Cities → English (成都 → Chengdu, 杭州 → Hangzhou).
  //   - Job titles → English (银行安全主管 → Bank Security Head).
  //
  // cert_a / cert_b carry pairing labels that often have Chinese
  // structural text (梯: "ladder"; vs "对比"; 路线A vs 路线B "Track A
  // vs Track B"). The EN overrides below translate the structural
  // text while preserving cert acronyms.
  cert_a_en: z.string().optional(),
  cert_b_en: z.string().optional(),
  market_en: z.string().optional(),
  market_note_en: z.string().optional(),
  angle_en: z.string().optional(),
  cert_a_cost_local_en: z.string().optional(),
  cert_b_cost_local_en: z.string().optional(),
  cert_a_salary_boost_en: z.string().optional(),
  cert_b_salary_boost_en: z.string().optional(),
  verdict_reason_en: z.string().optional(),
});
export type CertRecord = z.infer<typeof CertRecordSchema>;

// ── Display normalization ────────────────────────────────────────────────
// The source YAML has many overlapping market labels (e.g. "Singapore",
// "Singapore vs Hong Kong", "China T1 (北京/上海/深圳)"). For the UI we
// collapse them to a small set of canonical filter buckets.

export type MarketKey = "sg" | "my" | "cn-t1" | "cn-t2" | "au" | "hk" | "cross";

export const MARKETS: {
  key: MarketKey;
  en: string;
  zh: string;
  flag: string;
}[] = [
  { key: "sg", en: "Singapore", zh: "新加坡", flag: "🇸🇬" },
  { key: "my", en: "Malaysia", zh: "马来西亚", flag: "🇲🇾" },
  { key: "cn-t1", en: "China T1", zh: "中国一线", flag: "🇨🇳" },
  { key: "cn-t2", en: "China T2", zh: "中国二线", flag: "🇨🇳" },
  { key: "au", en: "Australia", zh: "澳大利亚", flag: "🇦🇺" },
  { key: "hk", en: "Hong Kong", zh: "香港", flag: "🇭🇰" },
  { key: "cross", en: "Cross-market", zh: "跨地区对比", flag: "🌐" },
];

/** Canonicalize the free-form `market` field from YAML to a MarketKey. */
export function classifyMarket(raw: string): MarketKey {
  const s = raw.toLowerCase();
  if (
    s.includes("singapore vs") ||
    s.includes("cross-market") ||
    s.includes("global comparison")
  ) {
    return "cross";
  }
  if (s.includes("hong kong") || s.startsWith("hk")) return "hk";
  if (s.includes("singapore")) return "sg";
  if (s.includes("malaysia") || s.includes("kuala lumpur") || s.includes("kl"))
    return "my";
  if (s.includes("china t2") || s.includes("二线")) return "cn-t2";
  if (
    s.includes("china t1") ||
    s.includes("china") ||
    s.includes("中国") ||
    s.includes("一线")
  )
    return "cn-t1";
  if (
    s.includes("australia") ||
    s.includes("sydney") ||
    s.includes("melbourne")
  )
    return "au";
  if (s.includes("remote")) return "cross";
  return "cross";
}

// ── Role canonicalization ────────────────────────────────────────────────
// Same idea — collapse the long-form roles into a small filter set.

export type RoleKey =
  | "soc"
  | "pentest"
  | "cloud"
  | "grc"
  | "architect"
  | "ciso"
  | "engineer"
  | "comparison";

export const ROLES: { key: RoleKey; en: string; zh: string }[] = [
  { key: "soc", en: "SOC Analyst", zh: "SOC 分析师" },
  { key: "pentest", en: "Penetration Tester", zh: "渗透测试" },
  { key: "cloud", en: "Cloud Security", zh: "云安全" },
  { key: "grc", en: "GRC Analyst", zh: "GRC 合规" },
  { key: "architect", en: "Security Architect", zh: "安全架构师" },
  { key: "ciso", en: "CISO", zh: "CISO" },
  { key: "engineer", en: "Security Engineer", zh: "安全工程师" },
  { key: "comparison", en: "Cross-role comparison", zh: "跨岗位对比" },
];

export function classifyRole(raw: string): RoleKey {
  const s = raw.toLowerCase();
  if (s.includes("ciso")) return "ciso";
  if (s.includes("cloud")) return "cloud";
  if (s.includes("grc")) return "grc";
  if (s.includes("architect")) return "architect";
  if (s.includes("pentest") || s.includes("penetration")) return "pentest";
  if (
    s.includes("soc") ||
    s.includes("security analyst") ||
    s.includes("entry level")
  )
    return "soc";
  if (s.includes("vs") || s.includes("comparison")) return "comparison";
  return "engineer";
}

// ── Currency formatting + USD conversion ─────────────────────────────────
// USD reference rates as of 2026-04-17. Used ONLY for cross-market
// comparison strip — primary salary display always uses source currency.
// Refresh quarterly with the YAML data.

export const USD_RATES: Record<string, number> = {
  USD: 1.0,
  SGD: 0.74,
  MYR: 0.22,
  CNY: 0.14,
  HKD: 0.13,
  AUD: 0.66,
};

/** Parse a salary range string like "42,000–60,000" → {low, high}. */
export function parseSalaryRange(
  s: string,
): { low: number; high: number } | null {
  // Handles en-dash (–), em-dash (—), hyphen (-), with optional commas
  const match = s.replace(/,/g, "").match(/(\d+)\s*[–—-]\s*(\d+)/);
  if (!match) return null;
  return { low: parseInt(match[1], 10), high: parseInt(match[2], 10) };
}

/** Convert local annual salary to USD (rounded to nearest $1k). */
export function toUsd(amount: number, currency: string): number {
  const rate = USD_RATES[currency.toUpperCase()] ?? 1;
  return Math.round((amount * rate) / 1000) * 1000;
}

/** Format a USD amount as "$120k" / "$1.2M". */
export function formatUsdShort(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}k`;
  return `$${usd}`;
}

/** Currency symbol lookup (display only, not arithmetic). */
export function currencySymbol(code: string): string {
  const map: Record<string, string> = {
    SGD: "S$",
    MYR: "RM",
    CNY: "¥",
    HKD: "HK$",
    AUD: "A$",
    USD: "$",
  };
  return map[code.toUpperCase()] ?? code;
}

// ── Filter helpers (used by server component to read URL params) ─────────

/**
 * Return a SalaryRecord with fields swapped to their English overrides
 * when the target locale is "en" and an `_en` variant exists.
 *
 * Why this pattern: the source YAML is ZH-first (per operator's xhs
 * project). English readers saw Chinese role / note / salary-range
 * strings bleeding through on /en/salary. This helper normalizes at
 * the presentation boundary without changing the data model's single
 * source of truth (the base fields stay authoritative; `_en` is pure
 * override, not duplication).
 *
 * Behavior:
 *   - locale === "zh" → returns record unchanged (base fields are ZH)
 *   - locale === "en" → returns record with base fields replaced by
 *     their `_en` counterparts WHERE PRESENT. Missing `_en` means the
 *     base field was already English, so it's used as-is.
 */
export function getLocalized(
  record: SalaryRecord,
  locale: "en" | "zh",
): SalaryRecord {
  if (locale === "zh") return record;
  return {
    ...record,
    role: record.role_en ?? record.role,
    top_tier_salary: record.top_tier_salary_en ?? record.top_tier_salary,
    top_tier_note: record.top_tier_note_en ?? record.top_tier_note,
    entry_salary: record.entry_salary_en ?? record.entry_salary,
    mid_salary: record.mid_salary_en ?? record.mid_salary,
    senior_salary: record.senior_salary_en ?? record.senior_salary,
    // Array override: if top_hiring_en exists, use it (even if empty,
    // which lets us remove meaningless filler rows on the EN view).
    top_hiring: record.top_hiring_en ?? record.top_hiring,
  };
}

/**
 * CertRecord counterpart to getLocalized(). Same pattern: swap in
 * `_en` fields when locale === "en" and they exist, otherwise fall
 * back to the base field. Certification acronyms are never translated.
 */
export function getLocalizedCert(
  record: CertRecord,
  locale: "en" | "zh",
): CertRecord {
  if (locale === "zh") return record;
  return {
    ...record,
    cert_a: record.cert_a_en ?? record.cert_a,
    cert_b: record.cert_b_en ?? record.cert_b,
    market: record.market_en ?? record.market,
    market_note: record.market_note_en ?? record.market_note,
    angle: record.angle_en ?? record.angle,
    cert_a_cost_local: record.cert_a_cost_local_en ?? record.cert_a_cost_local,
    cert_b_cost_local: record.cert_b_cost_local_en ?? record.cert_b_cost_local,
    cert_a_salary_boost:
      record.cert_a_salary_boost_en ?? record.cert_a_salary_boost,
    cert_b_salary_boost:
      record.cert_b_salary_boost_en ?? record.cert_b_salary_boost,
    verdict_reason: record.verdict_reason_en ?? record.verdict_reason,
  };
}

export function filterSalaries(
  records: SalaryRecord[],
  filters: { market?: MarketKey | "all"; role?: RoleKey | "all" },
): SalaryRecord[] {
  return records.filter((r) => {
    if (filters.market && filters.market !== "all") {
      if (classifyMarket(r.market) !== filters.market) return false;
    }
    if (filters.role && filters.role !== "all") {
      if (classifyRole(r.role) !== filters.role) return false;
    }
    return true;
  });
}
