import type { Article } from "@/lib/content";
import type { Locale } from "@/lib/resend";

interface DigestTemplateOptions {
  articles: Article[];
  locale: Locale;
  siteUrl: string;
  unsubscribeUrl: string;
}

const T = {
  en: {
    greeting: "Here's what's new on ZCyberNews",
    preheaderFallback: "Your daily cybersecurity intelligence briefing",
    readMore: "Read more",
    readHero: "Read the full analysis",
    footer:
      "You're receiving this because you subscribed to ZCyberNews daily digest.",
    unsubscribe: "Unsubscribe",
    viewOnline: "Browse all",
    viewOnlineSuffix: "articles",
    severityLabel: "Severity",
    noArticles: "No new articles in this cycle.",
    moreArticles: "more article",
    moreArticlesPlural: "more articles",
    forwardCta: "Know a defender who'd find this useful? Forward this email.",
    discordCta: "Join our Discord community",
    topStory: "TOP STORY",
    todaysBriefing: "TODAY'S BRIEFING",
  },
  zh: {
    greeting: "ZCyberNews 最新资讯",
    preheaderFallback: "每日网络安全情报简报",
    readMore: "阅读更多",
    readHero: "阅读完整分析",
    footer: "您收到此邮件是因为订阅了 ZCyberNews 每日摘要。",
    unsubscribe: "取消订阅",
    viewOnline: "浏览全部",
    viewOnlineSuffix: "篇文章",
    severityLabel: "严重程度",
    noArticles: "本时段暂无新文章。",
    moreArticles: "篇更多文章",
    moreArticlesPlural: "篇更多文章",
    forwardCta: "认识需要这些情报的安全从业者？转发此邮件。",
    discordCta: "加入 Discord 安全社区",
    topStory: "头条",
    todaysBriefing: "今日简报",
  },
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
  informational: "#6b7280",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Content strategy (Maya's spec) ────────────────────────────────────────

const MAX_ARTICLES = 7;
const MIN_ARTICLES_TO_SEND = 3;

/**
 * Sort + select articles per Maya's content strategy:
 * 1. Sort by severity (critical first) then by category diversity
 * 2. Take top MAX_ARTICLES
 * 3. First one = hero
 */
function selectArticles(articles: Article[]): {
  hero: Article | null;
  secondary: Article[];
  remainingCount: number;
} {
  if (articles.length === 0) {
    return { hero: null, secondary: [], remainingCount: 0 };
  }

  // Sort: severity desc, then threat-intel first, then alphabetical
  const sorted = [...articles].sort((a, b) => {
    const sevA = SEVERITY_RANK[a.frontmatter.severity ?? ""] ?? 0;
    const sevB = SEVERITY_RANK[b.frontmatter.severity ?? ""] ?? 0;
    if (sevB !== sevA) return sevB - sevA;
    // Prefer threat-intel for top position
    if (
      a.frontmatter.category === "threat-intel" &&
      b.frontmatter.category !== "threat-intel"
    )
      return -1;
    if (
      b.frontmatter.category === "threat-intel" &&
      a.frontmatter.category !== "threat-intel"
    )
      return 1;
    return a.frontmatter.title.localeCompare(b.frontmatter.title);
  });

  const hero = sorted[0] ?? null;
  const secondary = sorted.slice(1, MAX_ARTICLES);
  const remainingCount = Math.max(0, articles.length - MAX_ARTICLES);

  return { hero, secondary, remainingCount };
}

// ── Subject line ──────────────────────────────────────────────────────────

export function buildDigestSubject(
  articles: Article[],
  locale: Locale,
): string {
  const count = articles.length;
  const dateStr = new Date().toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { month: "short", day: "numeric" },
  );
  if (locale === "zh") {
    return `ZCyberNews 摘要 · ${dateStr} · ${count} 篇新文章`;
  }
  return `ZCyberNews Digest · ${dateStr} · ${count} new article${count === 1 ? "" : "s"}`;
}

// ── Main template builder ─────────────────────────────────────────────────

export function buildDigestHtml({
  articles,
  locale,
  siteUrl,
  unsubscribeUrl,
}: DigestTemplateOptions): string {
  const t = T[locale];
  const totalCount = articles.length;
  const { hero, secondary, remainingCount } = selectArticles(articles);
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

  // Build preheader: top story headline (or fallback)
  const preheaderText = hero
    ? escapeHtml(hero.frontmatter.title)
    : escapeHtml(t.preheaderFallback);

  // Hero block
  const heroBlock = hero ? renderHeroBlock(hero, locale, siteUrl, t) : "";

  // Secondary blocks
  const secondaryBlocks = secondary
    .map((a) => renderSecondaryBlock(a, locale, siteUrl, t))
    .join("\n");

  // "And N more" link
  const moreBlock =
    remainingCount > 0
      ? `<div style="padding:16px 0;text-align:center;">
          <a href="${siteUrl}/${locale}/articles" style="color:#22d3ee;text-decoration:none;font-size:14px;font-weight:500;">
            + ${remainingCount} ${remainingCount === 1 ? escapeHtml(t.moreArticles) : escapeHtml(t.moreArticlesPlural)} →
          </a>
        </div>`
      : "";

  // Discord CTA (only if configured)
  const discordBlock = discordUrl
    ? `<tr>
        <td style="padding:0 32px 16px;text-align:center;">
          <a href="${escapeHtml(discordUrl)}" style="display:inline-block;padding:8px 16px;background:#5865F2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">${escapeHtml(t.discordCta)} →</a>
        </td>
      </tr>`
    : "";

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(buildDigestSubject(articles, locale))}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <!--[if mso]><span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;visibility:hidden;mso-hide:all;">${preheaderText}</span><![endif]-->
  <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;visibility:hidden;">${preheaderText}${"‌".repeat(60)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111111;border:1px solid #262626;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 16px;border-bottom:1px solid #262626;">
              <a href="${siteUrl}/${locale}" style="text-decoration:none;">
                <h1 style="margin:0;color:#22d3ee;font-size:22px;letter-spacing:-0.02em;">
                  <span style="color:#ef4444;">Z</span>CyberNews
                </h1>
              </a>
              <p style="margin:8px 0 0;color:#a3a3a3;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(t.todaysBriefing)}</p>
            </td>
          </tr>

          <!-- Hero article -->
          ${heroBlock}

          <!-- Secondary articles -->
          <tr>
            <td style="padding:8px 32px 0;">
              ${secondaryBlocks}
              ${moreBlock}
            </td>
          </tr>

          <!-- Primary CTA -->
          <tr>
            <td style="padding:16px 32px 20px;text-align:center;">
              <a href="${siteUrl}/${locale}/articles" style="display:inline-block;padding:10px 24px;background:#22d3ee;color:#0a0a0a;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">${escapeHtml(t.viewOnline)} ${totalCount} ${escapeHtml(t.viewOnlineSuffix)} →</a>
            </td>
          </tr>

          <!-- Discord CTA -->
          ${discordBlock}

          <!-- Forward CTA -->
          <tr>
            <td style="padding:0 32px 20px;text-align:center;">
              <p style="margin:0;color:#737373;font-size:12px;font-style:italic;">${escapeHtml(t.forwardCta)}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#0a0a0a;border-top:1px solid #262626;">
              <p style="margin:0 0 8px;color:#737373;font-size:11px;line-height:1.5;">${escapeHtml(t.footer)}</p>
              <p style="margin:0;color:#737373;font-size:11px;">
                <a href="${unsubscribeUrl}" style="color:#22d3ee;">${escapeHtml(t.unsubscribe)}</a>
                &nbsp;·&nbsp;
                <a href="${siteUrl}/${locale}" style="color:#22d3ee;">zcybernews.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Hero article block (large, prominent) ─────────────────────────────────

function renderHeroBlock(
  a: Article,
  locale: Locale,
  siteUrl: string,
  t: (typeof T)[Locale],
): string {
  const fm = a.frontmatter;
  const url = `${siteUrl}/${locale}/${fm.category === "threat-intel" ? "threat-intel" : "articles"}/${fm.slug}`;
  const severity = fm.severity;
  const severityBadge = severity
    ? `<span style="display:inline-block;padding:3px 10px;background:${SEVERITY_COLOR[severity] ?? "#6b7280"};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:4px;letter-spacing:0.05em;">${escapeHtml(severity)}</span>`
    : "";
  const categoryBadge = `<span style="display:inline-block;padding:3px 10px;background:#262626;color:#22d3ee;font-size:11px;font-weight:600;text-transform:uppercase;border-radius:4px;letter-spacing:0.05em;">${escapeHtml(fm.category)}</span>`;

  return `<tr>
    <td style="padding:24px 32px 20px;background:linear-gradient(180deg,#1a1a2e 0%,#111111 100%);border-bottom:1px solid #262626;">
      <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ef4444;">${escapeHtml(t.topStory)}</p>
      <div style="margin-bottom:10px;">${categoryBadge}&nbsp;${severityBadge}</div>
      <a href="${url}" style="text-decoration:none;">
        <h2 style="margin:0 0 10px;color:#fafafa;font-size:20px;line-height:1.3;font-weight:700;">${escapeHtml(fm.title)}</h2>
      </a>
      <p style="margin:0 0 14px;color:#d4d4d4;font-size:15px;line-height:1.55;">${escapeHtml(fm.excerpt)}</p>
      <a href="${url}" style="display:inline-block;padding:8px 18px;background:#22d3ee;color:#0a0a0a;text-decoration:none;border-radius:5px;font-size:13px;font-weight:600;">${escapeHtml(t.readHero)} →</a>
    </td>
  </tr>`;
}

// ── Secondary article block (compact) ─────────────────────────────────────

function renderSecondaryBlock(
  a: Article,
  locale: Locale,
  siteUrl: string,
  t: (typeof T)[Locale],
): string {
  const fm = a.frontmatter;
  const url = `${siteUrl}/${locale}/${fm.category === "threat-intel" ? "threat-intel" : "articles"}/${fm.slug}`;
  const severity = fm.severity;
  const severityBadge = severity
    ? `<span style="display:inline-block;padding:2px 7px;background:${SEVERITY_COLOR[severity] ?? "#6b7280"};color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;border-radius:3px;letter-spacing:0.04em;">${escapeHtml(severity)}</span>`
    : "";
  const categoryBadge = `<span style="display:inline-block;padding:2px 7px;background:#262626;color:#22d3ee;font-size:10px;font-weight:600;text-transform:uppercase;border-radius:3px;letter-spacing:0.04em;">${escapeHtml(fm.category)}</span>`;

  return `<div style="padding:14px 0;border-bottom:1px solid #1f1f1f;">
    <div style="margin-bottom:6px;">${categoryBadge}&nbsp;${severityBadge}</div>
    <a href="${url}" style="text-decoration:none;">
      <h3 style="margin:0 0 4px;color:#fafafa;font-size:15px;line-height:1.35;font-weight:600;">${escapeHtml(fm.title)}</h3>
    </a>
    <p style="margin:0 0 6px;color:#a3a3a3;font-size:13px;line-height:1.45;">${escapeHtml(fm.excerpt.length > 140 ? fm.excerpt.slice(0, 137) + "..." : fm.excerpt)}</p>
    <a href="${url}" style="color:#22d3ee;text-decoration:none;font-size:12px;font-weight:500;">${escapeHtml(t.readMore)} →</a>
  </div>`;
}

export { MIN_ARTICLES_TO_SEND, MAX_ARTICLES, selectArticles };
