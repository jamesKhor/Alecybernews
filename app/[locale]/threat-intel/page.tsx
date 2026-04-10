import { getAllPosts } from "@/lib/content";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { useTranslations } from "next-intl";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ThreatIntelPage({ params }: Props) {
  const { locale } = await params;
  const posts = getAllPosts(locale, "threat-intel");

  return <ThreatIntelContent locale={locale} posts={posts} />;
}

function ThreatIntelContent({
  locale,
  posts,
}: {
  locale: string;
  posts: ReturnType<typeof getAllPosts>;
}) {
  const t = useTranslations("nav");

  return (
    <main className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-3 w-3 rounded-full bg-destructive" />
          <h1 className="text-3xl font-bold">{t("threatIntel")}</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {posts.length} reports — IOCs, TTPs, threat actor profiles
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center font-mono">
          {"// No threat intelligence reports yet"}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <ArticleCard
              key={post.frontmatter.slug}
              article={post}
              locale={locale}
              type="threat-intel"
            />
          ))}
        </div>
      )}
    </main>
  );
}
