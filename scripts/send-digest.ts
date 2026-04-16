#!/usr/bin/env tsx
/**
 * Send the twice-daily email digest of recent articles.
 *
 * Flags:
 *   --window-hours=13  How far back to look for articles (default 13)
 *   --dry-run          Print subject + article count, do not send
 *   --locale=en|zh     Only send for one locale (default: both)
 *
 * Invoked by .github/workflows/email-digest.yml on cron schedule.
 */
import "dotenv/config";
import { getAllPosts, type Article } from "@/lib/content";
import {
  buildDigestHtml,
  buildDigestSubject,
} from "@/lib/email/digest-template";
import {
  resend,
  getAudienceId,
  isResendConfigured,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  type Locale,
} from "@/lib/resend";

function parseArgs() {
  const args = process.argv.slice(2);
  const windowHours = Number(
    args.find((a) => a.startsWith("--window-hours="))?.split("=")[1] ?? 13,
  );
  const dryRun = args.includes("--dry-run");
  const localeArg = args.find((a) => a.startsWith("--locale="))?.split("=")[1];
  const locales: Locale[] =
    localeArg === "en" || localeArg === "zh" ? [localeArg] : ["en", "zh"];
  return { windowHours, dryRun, locales };
}

function recentArticles(locale: Locale, windowHours: number): Article[] {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const posts = getAllPosts(locale, "posts");
  const threat = getAllPosts(locale, "threat-intel");
  const merged = [...posts, ...threat];
  return merged
    .filter(
      (a) =>
        !a.frontmatter.draft &&
        new Date(a.frontmatter.date).getTime() >= cutoff,
    )
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime(),
    );
}

async function sendForLocale(
  locale: Locale,
  articles: Article[],
  dryRun: boolean,
): Promise<void> {
  const tag = `[digest:${locale}]`;
  if (articles.length === 0) {
    console.log(`${tag} No new articles in window — skipping.`);
    return;
  }

  // Maya's content strategy: don't send thin digests — looks unprofessional
  const { MIN_ARTICLES_TO_SEND } = await import("@/lib/email/digest-template");
  if (articles.length < MIN_ARTICLES_TO_SEND) {
    console.log(
      `${tag} Only ${articles.length} article(s) — below minimum ${MIN_ARTICLES_TO_SEND}. Skipping.`,
    );
    return;
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://zcybernews.com"
  ).replace(/\/$/, "");
  const unsubscribeUrl = `${siteUrl}/${locale}/unsubscribe`;
  const subject = buildDigestSubject(articles, locale);
  const html = buildDigestHtml({
    articles,
    locale,
    siteUrl,
    unsubscribeUrl,
  });

  console.log(`${tag} ${articles.length} articles, subject: "${subject}"`);

  if (dryRun) {
    console.log(`${tag} DRY RUN — not sending`);
    return;
  }

  if (!isResendConfigured() || !resend) {
    console.error(`${tag} ❌ RESEND_API_KEY not configured`);
    return;
  }

  const audienceId = getAudienceId(locale);
  if (!audienceId) {
    console.error(
      `${tag} ❌ RESEND_AUDIENCE_ID_${locale.toUpperCase()} not set`,
    );
    return;
  }

  const created = await resend.broadcasts.create({
    audienceId,
    from: EMAIL_FROM,
    subject,
    html,
    replyTo: EMAIL_REPLY_TO,
  });

  if (created.error || !created.data) {
    console.error(`${tag} ❌ broadcast create failed:`, created.error);
    return;
  }

  const sent = await resend.broadcasts.send(created.data.id);
  if (sent.error) {
    console.error(`${tag} ❌ broadcast send failed:`, sent.error);
    return;
  }

  console.log(`${tag} ✅ sent broadcast id=${created.data.id}`);
}

async function main() {
  const { windowHours, dryRun, locales } = parseArgs();
  console.log(
    `📬 Digest runner · window=${windowHours}h · dryRun=${dryRun} · locales=${locales.join(",")}`,
  );

  for (const locale of locales) {
    const articles = recentArticles(locale, windowHours);
    await sendForLocale(locale, articles, dryRun);
  }
}

main().catch((err) => {
  console.error("💥 digest failed:", err);
  process.exit(1);
});
