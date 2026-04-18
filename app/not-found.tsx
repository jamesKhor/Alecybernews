import Link from "next/link";
import type { Metadata } from "next";

/**
 * Root-level 404 page.
 *
 * Why this file exists (2026-04-18 SEO fix):
 * Without an `app/not-found.tsx`, Next.js App Router's `notFound()`
 * call from dynamic routes (e.g. `/en/articles/[slug]`) would render
 * the framework's default not-found content with HTTP status 200.
 * Google indexes those "soft 404" URLs as real pages, polluting
 * Search Console with thin content over time.
 *
 * Having this file present forces Next.js to return proper HTTP 404
 * on every `notFound()` call across the entire route tree — article
 * detail, threat-intel detail, and any future dynamic route.
 *
 * Kept locale-agnostic here. A future enhancement: add
 * `app/[locale]/not-found.tsx` with locale-aware copy. The root
 * file wins for routes outside `[locale]` and is the safety net for
 * anything the locale variant doesn't catch.
 */
export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you were looking for does not exist on ZCyberNews.",
  // Explicit noindex so search engines don't index the 404 surface itself
  // if they somehow hit it via a 200-rendered edge case.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 font-mono mb-3">
          404 · Not Found
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-foreground mb-4">
          Page not found
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          The page you were looking for does not exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-sm hover:bg-primary/90 transition-colors"
          >
            Return home
          </Link>
          <Link
            href="/en/articles"
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Browse articles →
          </Link>
        </div>
      </div>
    </main>
  );
}
