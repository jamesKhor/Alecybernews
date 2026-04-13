import { getAllPosts } from "@/lib/content";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCdata(str: string): string {
  return str.replace(/]]>/g, "]]]]><![CDATA[>");
}

export async function GET(request: NextRequest) {
  const locale =
    request.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Merge posts + threat-intel, sort by date, take latest 20
  const posts = getAllPosts(locale, "posts").map((p) => ({
    ...p,
    _type: "posts" as const,
  }));
  const ti = getAllPosts(locale, "threat-intel").map((p) => ({
    ...p,
    _type: "threat-intel" as const,
  }));
  const all = [...posts, ...ti]
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime(),
    )
    .slice(0, 20);

  const items = all
    .map((p) => {
      const section = p._type === "threat-intel" ? "threat-intel" : "articles";
      const url = `${siteUrl}/${locale}/${section}/${p.frontmatter.slug}`;
      return `
    <item>
      <title><![CDATA[${escapeCdata(p.frontmatter.title)}]]></title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description><![CDATA[${escapeCdata(p.frontmatter.excerpt)}]]></description>
      <pubDate>${new Date(p.frontmatter.date).toUTCString()}</pubDate>
      <category>${escapeXml(p.frontmatter.category)}</category>
    </item>`;
    })
    .join("");

  const feedTitle = locale === "zh" ? "ZCyberNews 中文" : "ZCyberNews";
  const feedDesc =
    locale === "zh"
      ? "网络安全与科技情报"
      : "Professional cybersecurity and tech intelligence";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${feedTitle}</title>
    <link>${siteUrl}</link>
    <description>${feedDesc}</description>
    <language>${locale === "zh" ? "zh-cn" : "en-us"}</language>
    <atom:link href="${siteUrl}/api/feed${locale === "zh" ? "?locale=zh" : ""}" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
