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
    readMore: "Read full article",
    footer:
      "You're receiving this because you subscribed to ZCyberNews daily digest.",
    unsubscribe: "Unsubscribe",
    viewOnline: "View all articles",
    severityLabel: "Severity",
    noArticles: "No new articles in this cycle.",
  },
  zh: {
    greeting: "ZCyberNews 最新资讯",
    readMore: "阅读全文",
    footer: "您收到此邮件是因为订阅了 ZCyberNews 每日摘要。",
    unsubscribe: "取消订阅",
    viewOnline: "查看所有文章",
    severityLabel: "严重程度",
    noArticles: "本时段暂无新文章。",
  },
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
  informational: "#6b7280",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

export function buildDigestHtml({
  articles,
  locale,
  siteUrl,
  unsubscribeUrl,
}: DigestTemplateOptions): string {
  const t = T[locale];
  const articleBlocks = articles
    .map((a) => renderArticleBlock(a, locale, siteUrl, t))
    .join("\n");

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(buildDigestSubject(articles, locale))}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111111;border:1px solid #262626;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 16px;border-bottom:1px solid #262626;">
              <a href="${siteUrl}/${locale}" style="text-decoration:none;">
                <h1 style="margin:0;color:#22d3ee;font-size:20px;letter-spacing:-0.02em;">
                  <span style="color:#ef4444;">Z</span>CyberNews
                </h1>
              </a>
              <p style="margin:8px 0 0;color:#a3a3a3;font-size:14px;">${escapeHtml(t.greeting)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              ${articleBlocks || `<p style="color:#737373;font-size:14px;">${escapeHtml(t.noArticles)}</p>`}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;text-align:center;">
              <a href="${siteUrl}/${locale}" style="display:inline-block;padding:10px 20px;background:#22d3ee;color:#0a0a0a;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">${escapeHtml(t.viewOnline)} →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#0a0a0a;border-top:1px solid #262626;">
              <p style="margin:0 0 8px;color:#737373;font-size:12px;line-height:1.5;">${escapeHtml(t.footer)}</p>
              <p style="margin:0;color:#737373;font-size:12px;">
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

function renderArticleBlock(
  a: Article,
  locale: Locale,
  siteUrl: string,
  t: (typeof T)[Locale],
): string {
  const fm = a.frontmatter;
  const url = `${siteUrl}/${locale}/${fm.category === "threat-intel" ? "threat-intel" : "articles"}/${fm.slug}`;
  const severity = fm.severity;
  const severityBadge = severity
    ? `<span style="display:inline-block;padding:2px 8px;background:${SEVERITY_COLOR[severity] ?? "#6b7280"};color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;border-radius:4px;letter-spacing:0.05em;">${escapeHtml(severity)}</span>`
    : "";
  const categoryBadge = `<span style="display:inline-block;padding:2px 8px;background:#262626;color:#22d3ee;font-size:10px;font-weight:600;text-transform:uppercase;border-radius:4px;letter-spacing:0.05em;margin-right:6px;">${escapeHtml(fm.category)}</span>`;

  return `<div style="padding:16px 0;border-bottom:1px solid #262626;">
    <div style="margin-bottom:8px;">${categoryBadge}${severityBadge}</div>
    <a href="${url}" style="text-decoration:none;">
      <h2 style="margin:0 0 8px;color:#fafafa;font-size:17px;line-height:1.35;font-weight:600;">${escapeHtml(fm.title)}</h2>
    </a>
    <p style="margin:0 0 10px;color:#a3a3a3;font-size:14px;line-height:1.5;">${escapeHtml(fm.excerpt)}</p>
    <a href="${url}" style="color:#22d3ee;text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(t.readMore)} →</a>
  </div>`;
}
