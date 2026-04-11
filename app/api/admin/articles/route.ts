import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/content";

export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enPosts = getAllPosts("en", "posts");
  const zhPosts = getAllPosts("zh", "posts");
  const enTi = getAllPosts("en", "threat-intel");
  const zhTi = getAllPosts("zh", "threat-intel");

  const zhPostSlugs = new Set(zhPosts.map((a) => a.frontmatter.slug));
  const zhTiSlugs = new Set(zhTi.map((a) => a.frontmatter.slug));

  const posts = enPosts.map((a) => ({
    slug: a.frontmatter.slug,
    title: a.frontmatter.title,
    date: a.frontmatter.date,
    category: a.frontmatter.category,
    tags: a.frontmatter.tags,
    draft: a.frontmatter.draft,
    type: "posts" as const,
    hasZh: zhPostSlugs.has(a.frontmatter.slug),
    readingTime: a.readingTime,
  }));

  const threatIntel = enTi.map((a) => ({
    slug: a.frontmatter.slug,
    title: a.frontmatter.title,
    date: a.frontmatter.date,
    category: a.frontmatter.category,
    tags: a.frontmatter.tags,
    draft: a.frontmatter.draft,
    type: "threat-intel" as const,
    hasZh: zhTiSlugs.has(a.frontmatter.slug),
    readingTime: a.readingTime,
  }));

  const all = [...posts, ...threatIntel].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return NextResponse.json({ articles: all });
}
