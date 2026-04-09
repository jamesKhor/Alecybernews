import { getAllPosts } from "@/lib/content";
import { NextResponse, type NextRequest } from "next/server";

export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const locale = searchParams.get("locale") === "en" ? "en" : "zh";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const posts = getAllPosts(locale, "posts").slice(0, 10);

  const feed = posts.map((p) => ({
    title: p.frontmatter.title,
    digest: p.frontmatter.excerpt,
    content_source_url: `${siteUrl}/${locale}/articles/${p.frontmatter.slug}`,
    author: p.frontmatter.author,
    date: p.frontmatter.date,
    category: p.frontmatter.category,
    tags: p.frontmatter.tags,
    severity: p.frontmatter.severity ?? null,
    threat_actor: p.frontmatter.threat_actor ?? null,
  }));

  return NextResponse.json(
    { locale, total: feed.length, articles: feed },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
