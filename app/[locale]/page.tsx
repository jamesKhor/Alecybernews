import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getAllPosts } from "@/lib/content";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Link } from "@/i18n/navigation";
import { format } from "date-fns";
import { CATEGORY_DEFAULT_IMAGES, type Category } from "@/lib/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";
  const title = isZh
    ? "AleCyberNews — 网络安全与科技情报"
    : "AleCyberNews — Cybersecurity & Tech Intelligence";
  const description = isZh
    ? "深度威胁分析、漏洞研究与安全资讯，为防御者服务。"
    : "In-depth threat analysis, vulnerability research, and security news for defenders.";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", "zh-Hans": "/zh" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      locale: isZh ? "zh_CN" : "en_US",
      alternateLocale: isZh ? "en_US" : "zh_CN",
    },
  };
}

const ORDERED_CATEGORIES = [
  "threat-intel",
  "vulnerabilities",
  "malware",
  "industry",
  "tools",
  "ai",
] as const;

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  const allPosts = getAllPosts(locale, "posts");
  const tiPosts = getAllPosts(locale, "threat-intel");

  // Featured = latest article overall
  const featured = allPosts[0] ?? tiPosts[0] ?? null;

  // Group posts by category (skip featured)
  const postsByCat: Record<string, typeof allPosts> = {};
  for (const post of allPosts.slice(featured?.frontmatter.slug === allPosts[0]?.frontmatter.slug ? 1 : 0)) {
    const cat = post.frontmatter.category;
    if (!postsByCat[cat]) postsByCat[cat] = [];
    postsByCat[cat].push(post);
  }

  // Threat intel as its own section
  const tiSlice = tiPosts.slice(0, 3);

  return (
    <HomeContent
      locale={locale}
      featured={featured}
      postsByCat={postsByCat}
      tiPosts={tiSlice}
    />
  );
}

function HomeContent({
  locale,
  featured,
  postsByCat,
  tiPosts,
}: {
  locale: string;
  featured: Awaited<ReturnType<typeof getAllPosts>>[number] | null;
  postsByCat: Record<string, Awaited<ReturnType<typeof getAllPosts>>>;
  tiPosts: Awaited<ReturnType<typeof getAllPosts>>;
}) {
  const t = useTranslations("home");
  const tCats = useTranslations("categories");
  const isZh = locale === "zh";

  const hasContent =
    featured ||
    tiPosts.length > 0 ||
    Object.values(postsByCat).some((p) => p.length > 0);

  return (
    <main className="flex-1">
      {/* Breaking news ticker */}
      <div className="border-b border-border bg-primary/5">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
          <span className="flex-shrink-0 text-xs font-bold font-mono bg-destructive text-destructive-foreground px-2 py-0.5 rounded uppercase tracking-wider">
            {isZh ? "最新" : "Latest"}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {featured
              ? featured.frontmatter.title
              : isZh
                ? "网络安全情报平台"
                : "Cybersecurity intelligence for defenders"}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-14">
        {/* Featured article */}
        {featured && (
          <section>
            <FeaturedArticle article={featured} locale={locale} />
          </section>
        )}

        {/* Threat Intel section */}
        {tiPosts.length > 0 && (
          <section>
            <SectionHeader
              label={isZh ? "威胁情报" : "Threat Intel"}
              href="/threat-intel"
              locale={locale}
              viewAll={t("viewAll")}
              accent="destructive"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {tiPosts.map((post) => (
                <ArticleCard
                  key={post.frontmatter.slug}
                  article={post}
                  locale={locale}
                  type="threat-intel"
                />
              ))}
            </div>
          </section>
        )}

        {/* Category sections */}
        {ORDERED_CATEGORIES.filter(
          (cat) => (postsByCat[cat]?.length ?? 0) > 0,
        ).map((cat) => (
          <section key={cat}>
            <SectionHeader
              label={tCats(cat)}
              href={`/categories/${cat}`}
              locale={locale}
              viewAll={t("viewAll")}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {postsByCat[cat].slice(0, 3).map((post) => (
                <ArticleCard
                  key={post.frontmatter.slug}
                  article={post}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        ))}

        {!hasContent && (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-xl font-mono">{"// No articles yet"}</p>
            <p className="mt-2 text-sm">
              {isZh
                ? "通过管理面板发布第一篇文章"
                : "Publish your first article from the admin panel"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function SectionHeader({
  label,
  href,
  locale,
  viewAll,
  accent,
}: {
  label: string;
  href: string;
  locale: string;
  viewAll: string;
  accent?: "destructive" | "primary";
}) {
  return (
    <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-1 rounded-full ${accent === "destructive" ? "bg-destructive" : "bg-primary"}`}
        />
        <h2 className="text-base font-bold uppercase tracking-wide text-foreground">
          {label}
        </h2>
      </div>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        locale={locale as "en" | "zh"}
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {viewAll} →
      </Link>
    </div>
  );
}

function FeaturedArticle({
  article,
  locale,
}: {
  article: Awaited<ReturnType<typeof getAllPosts>>[number];
  locale: string;
}) {
  const { frontmatter, readingTime } = article;
  const tCats = useTranslations("categories");
  const t = useTranslations("article");

  const image =
    frontmatter.featured_image ??
    CATEGORY_DEFAULT_IMAGES[frontmatter.category as Category];

  const href = `/${locale}/articles/${frontmatter.slug}`;

  return (
    <a
      href={href}
      className="group grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 overflow-hidden"
    >
      {/* Image */}
      <div className="relative h-56 lg:h-auto bg-secondary overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={frontmatter.featured_image_alt ?? frontmatter.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-transparent">
            <span className="font-mono text-muted-foreground text-sm">
              {"// featured"}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-7 flex flex-col justify-center">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
            {tCats(frontmatter.category)}
          </span>
          <time
            dateTime={frontmatter.date}
            className="text-xs text-muted-foreground"
          >
            {format(new Date(frontmatter.date), "MMMM d, yyyy")}
          </time>
        </div>

        <h2 className="text-xl lg:text-2xl font-bold leading-snug text-foreground group-hover:text-primary transition-colors mb-3 line-clamp-3">
          {frontmatter.title}
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-5">
          {frontmatter.excerpt}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{t("readingTime", { minutes: readingTime })}</span>
          {frontmatter.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-secondary rounded px-2 py-0.5 font-mono"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
