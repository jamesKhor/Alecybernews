import type { Metadata } from "next";
import { getAllPosts } from "@/lib/content";
import { CategoryEnum } from "@/lib/types";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";
  const title = isZh ? "分类" : "Categories";
  const description = isZh
    ? "按主题浏览网络安全文章。"
    : "Browse cybersecurity articles by topic.";
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/categories`,
      languages: {
        en: "/en/categories",
        "zh-Hans": "/zh/categories",
        "x-default": "/en/categories",
      },
    },
  };
}

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  const posts = getAllPosts(locale, "posts");
  const tiPosts = getAllPosts(locale, "threat-intel");
  const all = [...posts, ...tiPosts];

  // Count articles per category
  const counts: Record<string, number> = {};
  for (const cat of CategoryEnum.options) {
    counts[cat] = all.filter((p) => p.frontmatter.category === cat).length;
  }

  return <CategoriesContent locale={locale} counts={counts} />;
}

function CategoriesContent({
  locale,
  counts,
}: {
  locale: string;
  counts: Record<string, number>;
}) {
  const tCats = useTranslations("categories");
  const isZh = locale === "zh";

  return (
    <main className="max-w-7xl mx-auto px-4 py-12">
      <Breadcrumbs
        items={[
          { label: isZh ? "首页" : "Home", href: `/${locale}` },
          { label: isZh ? "分类" : "Categories" },
        ]}
      />
      <h1 className="text-3xl font-bold mb-8">
        {isZh ? "分类" : "Categories"}
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CategoryEnum.options.map((cat) => (
          <Link
            key={cat}
            href={`/categories/${cat}` as Parameters<typeof Link>[0]["href"]}
            locale={locale as "en" | "zh"}
            className="group flex items-center justify-between p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200"
          >
            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {tCats(cat)}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts[cat]} {isZh ? "篇" : "articles"}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
