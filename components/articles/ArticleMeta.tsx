import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import type { ArticleFrontmatter } from "@/lib/types";
import { SEVERITY_COLORS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  frontmatter: ArticleFrontmatter;
  readingTime: number;
  locale: string;
}

export function ArticleMeta({ frontmatter, readingTime, locale }: Props) {
  const t = useTranslations("article");
  const tCats = useTranslations("categories");
  const dateLocale = locale === "zh" ? zhCN : enUS;

  const formattedDate = format(new Date(frontmatter.date), "PPP", {
    locale: dateLocale,
  });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {/* Category badge */}
      <Badge variant="secondary" className="text-primary border-primary/20 bg-primary/10">
        {tCats(frontmatter.category)}
      </Badge>

      {/* Severity badge */}
      {frontmatter.severity && (
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            SEVERITY_COLORS[frontmatter.severity]
          }`}
        >
          {t(`severity.${frontmatter.severity}`)}
        </span>
      )}

      <span>•</span>

      {/* Date */}
      <time dateTime={frontmatter.date}>{formattedDate}</time>

      <span>•</span>

      {/* Reading time */}
      <span>{t("readingTime", { minutes: readingTime })}</span>

      {/* Threat actor */}
      {frontmatter.threat_actor && (
        <>
          <span>•</span>
          <span className="font-mono text-destructive text-xs">
            {frontmatter.threat_actor}
          </span>
        </>
      )}

      {/* CVE IDs */}
      {frontmatter.cve_ids && frontmatter.cve_ids.length > 0 && (
        <>
          <span>•</span>
          <div className="flex gap-1">
            {frontmatter.cve_ids.slice(0, 3).map((cve) => (
              <span
                key={cve}
                className="font-mono text-xs rounded bg-destructive/10 text-destructive px-1.5 py-0.5"
              >
                {cve}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
