import { useTranslations } from "next-intl";
import { getAllPosts } from "@/lib/content";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Link } from "@/i18n/navigation";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const posts = getAllPosts(locale, "posts").slice(0, 6);
  const tiPosts = getAllPosts(locale, "threat-intel").slice(0, 3);

  return <HomeContent locale={locale} posts={posts} tiPosts={tiPosts} />;
}

function HomeContent({
  locale,
  posts,
  tiPosts,
}: {
  locale: string;
  posts: Awaited<ReturnType<typeof getAllPosts>>;
  tiPosts: Awaited<ReturnType<typeof getAllPosts>>;
}) {
  const t = useTranslations("home");
  const tNav = useTranslations("nav");

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative border-b border-border bg-gradient-to-b from-primary/5 to-transparent py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-4 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-mono">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            LIVE THREAT INTELLIGENCE
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            {t("heroTitle")}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-12 space-y-16">
        {/* Latest Articles */}
        {posts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-foreground">{t("latestArticles")}</h2>
              <Link
                href="/articles"
                locale={locale as "en" | "zh"}
                className="text-sm text-primary hover:underline"
              >
                {t("viewAll")} →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <ArticleCard key={post.frontmatter.slug} article={post} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {/* Threat Intel */}
        {tiPosts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {t("latestThreatIntel")}
              </h2>
              <Link
                href="/threat-intel"
                locale={locale as "en" | "zh"}
                className="text-sm text-primary hover:underline"
              >
                {t("viewAll")} →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tiPosts.map((post) => (
                <ArticleCard key={post.frontmatter.slug} article={post} locale={locale} type="threat-intel" />
              ))}
            </div>
          </section>
        )}

        {posts.length === 0 && tiPosts.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-xl font-mono">// No articles yet</p>
            <p className="mt-2 text-sm">Run the AI pipeline or add MDX files to content/</p>
          </div>
        )}
      </div>
    </main>
  );
}
