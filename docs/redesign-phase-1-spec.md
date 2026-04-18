# Redesign Phase 1 — Specification

**Status**: Draft for operator review
**Author**: Alex (PM) with Ken (Design) input, Vincent (Architect) notes, Raymond (Engineering) review, Maya (SEO) checklist
**Last updated**: 2026-04-18
**Deploy target**: Incremental — Phase 1 ships standalone; Phases 2-4 gated separately

---

## Why this exists

The operator wants a site-wide redesign grounded in news-publication aesthetics (NYT / FT / Fox News / Vertonews references) rather than the current OLED-dark tech-product look. Phase 1 is the **foundation commit** — it changes the visual tokens and typography without touching any page structure, heading hierarchy, or structured data. Subsequent phases (2-4) will redesign specific page types once the foundation is proven.

**Operator-approved decisions locked 2026-04-18:**

1. No-photo mobile hero pattern = **(d) all three cycling** (lede quote + breaking news + featured threat card) — scoped to Phase 2, NOT Phase 1
2. `/salary` treatment = **flip to white theme** along with the rest of the site (no black-exception)
3. Dark mode fate = **(c) keep manual ThemeToggle** — white default, dark stays opt-in via existing toggle
4. Custom font = **Inter (body) + Source Serif 4 (h1/h2 only)** — replaces Geist Sans entirely. Keep Geist Mono for data, keep Noto Sans SC for CJK.
5. Shipping strategy = **Phase 1 alone first; observe 3-5 days; then Phase 2**

---

## Phase 1 scope (THIS COMMIT ONLY)

### What ships

| Change                                                               | Files touched                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Swap Geist Sans → Inter (body + UI)                                  | `app/layout.tsx` (font imports), `app/globals.css` (font stack)                                            |
| Add Source Serif 4 for display headlines                             | `app/layout.tsx`, `app/globals.css`                                                                        |
| Theme flip: white becomes default, dark becomes manual-toggle opt-in | `app/globals.css` (CSS variable :root + .dark swap), `components/ThemeProvider.tsx` if defaultTheme is set |
| Keep Geist Mono as-is (tabular data)                                 | no change                                                                                                  |
| Keep Noto Sans SC as-is (CJK)                                        | no change                                                                                                  |

### What does NOT ship in Phase 1

- ❌ No mobile index redesign — that's Phase 2
- ❌ No article listing redesign — Phase 3
- ❌ No article detail polish — Phase 4
- ❌ No component prop changes
- ❌ No heading hierarchy changes
- ❌ No JSON-LD modifications
- ❌ No sitemap/robots changes

---

## Typography system (Phase 1)

### Rationale for Inter + Source Serif 4

| Candidate                       | Verdict            | Why                                                                                                                                                                                                                             |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inter** (body)                | ✅ SELECTED        | Designed for screen UI by Rasmus Andersson. Most-battle-tested screen font ever. Variable weight range. Used by Linear, Stripe docs, Vercel docs, The Verge. ~28kb Latin subset. Better small-size readability than Geist.      |
| **Source Serif 4** (h1/h2 only) | ✅ SELECTED        | Adobe's modern editorial serif. Subtle publication-feel without commercial-font licensing cost. ~18kb Latin subset at 2 weights. Pairs with Inter cleanly. Used by many publications as free alternative to Tiempos/Cheltenham. |
| Geist Sans (current)            | ❌ REPLACED        | Vercel-default geometric sans. Clean but feels SaaS-product, not editorial. No personality for news context.                                                                                                                    |
| Newsreader                      | Considered, passed | Google-designed news font. Slightly too rigid. Source Serif 4 more flexible.                                                                                                                                                    |
| IBM Plex                        | Considered, passed | Humanist with quirk. Slightly heavy. Inter cleaner for small sizes.                                                                                                                                                             |
| Recursive variable              | Considered, passed | One file covers all weights. Flexible but ~45kb alone — heavier than Inter + Source Serif 4 combined.                                                                                                                           |
| Tiempos                         | Rejected           | Commercial license (~$400/seat). Source Serif 4 is the free alternative.                                                                                                                                                        |

### Weight ladder (enforced via Pixel Street "three roles" framework)

| Role                                    | Where used                           | Font           | Weights allowed                          |
| --------------------------------------- | ------------------------------------ | -------------- | ---------------------------------------- |
| **Title / Bandit** (grab attention)     | `<h1>`, cinematic hero wordmark      | Source Serif 4 | 700 (bold) for h1, 600 (semibold) for h2 |
| **Body / Nanny** (invisible, readable)  | Paragraphs, list items, article body | Inter          | 400 (regular), 500 (medium for emphasis) |
| **Stylized / Assassin** (short, punchy) | Eyebrows, labels, CTAs, nav          | Inter          | 600 (semibold), 700 (bold)               |
| **Tabular / Data**                      | Currency, numbers, code              | Geist Mono     | Unchanged — keep 400-700                 |
| **CJK**                                 | Chinese characters anywhere          | Noto Sans SC   | Unchanged — keep 400/600/700/900         |

### Size ladder (unchanged from current — tokens only)

| Use               | Tailwind class                            | px equiv |
| ----------------- | ----------------------------------------- | -------- |
| Small eyebrow     | `text-[10px] tracking-[0.15em] uppercase` | 10px     |
| Body small        | `text-sm`                                 | 14px     |
| Body              | `text-base`                               | 16px     |
| Body large        | `text-lg`                                 | 18px     |
| h3                | `text-xl` / `text-2xl`                    | 20-24px  |
| h2                | `text-2xl` / `text-3xl`                   | 24-30px  |
| h1                | `text-3xl` → `text-5xl` responsive        | 30-48px  |
| Cinematic display | `text-[14vw]` → `text-[15rem]`            | 45-240px |

---

## Theme token system (Phase 1)

### Strategy

Keep the dual-theme CSS-variables system already in `globals.css`. Swap the `:root` defaults from dark → light. Keep the `.dark` class definitions unchanged. Result: light is default, dark is opt-in via `ThemeToggle` (sets `.dark` on `<html>`).

### Light theme tokens (new `:root` defaults)

| Token                  | Current (dark default)     | Phase 1 (light default)        | Reasoning                             |
| ---------------------- | -------------------------- | ------------------------------ | ------------------------------------- |
| `--background`         | `0 0% 0%` (OLED black)     | `0 0% 100%` (pure white)       | Paper-feel                            |
| `--foreground`         | `210 40% 96%` (near-white) | `224 71% 4%` (near-black)      | Invert                                |
| `--card`               | `0 0% 4%` (near-black)     | `0 0% 99%` (off-white card)    | Subtle card distinction               |
| `--card-foreground`    | `210 40% 96%`              | `224 71% 4%`                   | Invert                                |
| `--muted`              | `0 0% 8%`                  | `220 14% 96%` (light gray)     | Invert                                |
| `--muted-foreground`   | `215 20% 55%` (mid gray)   | `220 9% 46%` (darker mid gray) | Ensure contrast ratio AA              |
| `--primary`            | `199 89% 48%` (cyan)       | `210 100% 35%` (deep blue)     | Editorial anchor color                |
| `--primary-foreground` | `0 0% 0%`                  | `0 0% 100%`                    | Invert                                |
| `--border`             | `0 0% 14%`                 | `220 13% 91%` (light gray)     | Visible on white                      |
| `--severity-critical`  | `0 84% 60%`                | `0 84% 50%`                    | Slightly darker for contrast on white |

Dark mode tokens in `.dark {}` stay as current values — users who prefer dark can still toggle.

### Accessibility check

- Foreground `224 71% 4%` on background `0 0% 100%` → contrast **19.5:1** (WCAG AAA)
- Muted foreground `220 9% 46%` on background `0 0% 100%` → contrast **4.6:1** (WCAG AA for body text)
- Primary `210 100% 35%` on white → contrast **7.2:1** (WCAG AAA)

---

## Implementation plan (Phase 1)

### Commit 1a — Font stack (tokens only, no component changes)

File: `app/layout.tsx`

```tsx
import {
  Inter,
  Source_Serif_4,
  Geist_Mono,
  Noto_Sans_SC,
} from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Remove: Geist import
// Keep: Geist_Mono, Noto_Sans_SC
```

File: `app/globals.css`

```css
:root {
  --font-sans-stack:
    var(--font-inter), var(--font-noto-sc), "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", system-ui,
    sans-serif;
  --font-serif-stack: var(--font-serif), Georgia, "Times New Roman", serif;
  /* existing --font-mono-stack stays */
}

.font-serif {
  font-family: var(--font-serif-stack) !important;
}
```

File: `app/globals.css` (selective h1/h2 in prose + page headers)

- Add a `.prose h1, .prose h2 { font-family: var(--font-serif-stack); }`
- Existing h1 tags in components will need className="font-serif" added (scoped to Phase 1 — keep list small)

### Commit 1b — Theme token flip

File: `app/globals.css`

Swap the contents of `:root {}` and `.dark {}` blocks. Net effect: white becomes default, dark classes remain for ThemeToggle.

File: `components/ThemeProvider.tsx`

- Verify `defaultTheme="light"` (or `system` with light as fallback)
- Ensure `attribute="class"` so `.dark` toggle still works

### Commit 1c — Remove hardcoded `dark` on `<html>` (if present)

Check `app/layout.tsx` for any hardcoded `dark` class on `<html>`. If present, remove so ThemeProvider controls it.

### Combined as ONE commit (recommended)

All three sub-changes are atomic and tightly related. Ship as one commit with clear rollback.

---

## Files touched (exhaustive list)

| File                           | Change type                                                                                                                                                | Risk                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `app/layout.tsx`               | Import swap (Geist → Inter), add Source Serif 4, keep Geist Mono + Noto SC, update className variable list                                                 | Low                                 |
| `app/globals.css`              | Swap `:root` and `.dark` contents; add `--font-serif-stack` + `.font-serif` override; add `.prose h1, .prose h2 { font-family: var(--font-serif-stack); }` | Low                                 |
| `components/ThemeProvider.tsx` | Verify defaultTheme (likely already correct)                                                                                                               | None (read-only check)              |
| Selected page headers          | Add `className="font-serif"` to h1 tags we want serif-ified                                                                                                | Low-medium — touches multiple files |

### Header files that need `font-serif` class added in Phase 1

**Scope question for operator**: should h1 serif be applied site-wide in Phase 1, or deferred to specific page types in Phases 2-4?

Recommendation: apply globally via CSS (`app/globals.css`) using `.prose h1` + selector for article page wrapper. Avoid hand-editing individual components — keeps Phase 1 to CSS-only.

---

## Gate reviews (all must pass before ship)

### Vincent (Architect) — ripple analysis

- [ ] Font loading strategy: next/font auto-subsets via unicode-range; bundle impact +~8kb net
- [ ] Theme switch mechanism: CSS variables (no JS theme logic change)
- [ ] Cache invalidation: CSS changes hashed in \_next/static — auto-invalidated
- [ ] Shared component touches: 0 (globals.css + layout.tsx + ThemeProvider only)
- [ ] Proxy / middleware: untouched
- [ ] Zero-downtime: YES — full-deploy job does pm2 reload cluster

### Raymond (Engineering) — runtime/bundle

- [ ] Bundle delta: remove Geist Sans (~15kb) + add Inter (~28kb) + add Source Serif 4 (~18kb) = +~31kb
- [ ] Alternative: drop Source Serif 4, go Inter-only → +13kb (lighter but no serif)
- [ ] LCP impact: `font-display: swap` + preload on Inter → minimal (fallback Geist used briefly)
- [ ] CLS risk: minor — fallback font + Inter have different metrics. Mitigation: add `adjustFontFallback` in next/font config.
- [ ] Classify rule: code change → full-deploy job (already supported)
- [ ] Test matrix: light theme default, toggle to dark, verify both on mobile + desktop

### Maya (SEO / content) — semantic preservation

- [ ] Every `<h1>` still present and unique per page
- [ ] Heading order preserved (h1 → h2 → h3)
- [ ] `<title>` tags unchanged
- [ ] Meta descriptions unchanged
- [ ] Structured data (NewsArticle, Dataset, FAQPage, WebPage, Breadcrumb) unchanged — verify 4+ blocks still emit on article pages
- [ ] Canonical + hreflang unchanged
- [ ] sitemap.xml unchanged
- [ ] robots.txt unchanged
- [ ] X-Robots-Tag on /admin unchanged
- [ ] OG + Twitter tags unchanged
- [ ] Core Web Vitals projection: CLS stays under 0.1, LCP stays under 2.5s, FID stays under 100ms

### Test Automator — regression coverage

- [ ] Admin flows spot-check: /admin/login, /admin/compose, /admin/articles render in light theme
- [ ] ThemeToggle works (click → dark mode applies)
- [ ] Feed endpoints return valid XML/JSON
- [ ] Sample articles render without layout breaks
- [ ] /salary renders in light theme (replaces cinematic black per operator decision)
- [ ] Mobile responsive check (320px, 375px, 414px)
- [ ] CJK rendering consistent (Noto Sans SC still loads + applies)

---

## Deploy + rollback

### Deploy path

- Code change → GitHub Actions full-deploy job
- Classify rule routes to `full-deploy`: build on runner → rsync `.next/` to VPS staging → atomic swap → `pm2 reload`
- Zero downtime
- ETA: 3-4 minutes from push to live

### Rollback

```bash
# Single-commit revert
git revert <phase-1-commit-sha>
git push origin main
# → Auto-deploys prior state in ~3 minutes
```

If critical: emergency rollback via VPS

```bash
# On VPS
cd /home/zcybernews/zcybernews
mv .next .next-phase1 && mv .next-prev .next && pm2 reload zcybernews
```

---

## Verification after deploy

### Curl check (1 minute)

```bash
curl -sI https://zcybernews.com/en/salary | head -5
# Expect: 200 OK, normal cache headers
```

### Visual check (5 minutes)

Browser to each page type:

- [ ] / (root) — light theme, serif h1
- [ ] /en — homepage, light theme, serif headlines
- [ ] /en/articles — listing, light theme
- [ ] /en/articles/[real-slug] — article detail, serif h1, body in Inter
- [ ] /en/salary — salary page in light theme (cinematic hero adapts)
- [ ] /zh/salary — ZH version, Noto SC renders correctly
- [ ] /admin/login — admin renders in light, noindex preserved
- [ ] ThemeToggle → switch to dark, verify dark palette applies

### SEO check (30 min after deploy)

- [ ] Google Rich Results Test: https://search.google.com/test/rich-results?url=https://zcybernews.com/en/articles/[real-slug]
- [ ] Structured data still valid (NewsArticle, Breadcrumb, WebPage)
- [ ] View-source: h1, canonical, meta description unchanged

---

## Mobile-first discipline (operator directive 2026-04-18)

**Context**: XHS funnel routes mobile users to `/salary`. Search Console shows mobile is >60% of traffic. Mobile-first is not a nice-to-have — it's the primary use case.

### Mobile budgets Phase 1 must preserve

| Metric                                 | Current baseline            | Phase 1 target                | Hard fail threshold |
| -------------------------------------- | --------------------------- | ----------------------------- | ------------------- |
| First Contentful Paint (mobile, 4G)    | ~1.2s                       | ≤ 1.4s                        | > 1.8s              |
| Largest Contentful Paint (LCP, mobile) | ~2.1s                       | ≤ 2.3s                        | > 2.5s              |
| Cumulative Layout Shift (CLS)          | ~0.05                       | ≤ 0.05                        | > 0.1               |
| Total JS on first paint                | ~180kb gzip                 | ≤ 185kb gzip                  | > 200kb gzip        |
| Total fonts + CSS                      | ~110kb (Geist + Noto + CSS) | ~118kb (+Inter -Geist +Serif) | > 140kb             |
| Mobile bounce on /salary               | (tracked)                   | No regression                 | +20% vs baseline    |

### Mobile-specific rules applied in Phase 1

1. **`adjustFontFallback: "Arial"`** in next/font config for Inter — ensures fallback metrics match Inter exactly, eliminating CLS when Inter swaps in.
2. **`display: "swap"`** on all fonts — no FOIT (flash of invisible text). Some acceptable FOUT on slow 3G but text is always visible.
3. **`preload: true`** on Inter (body font, used on first paint). **`preload: false`** on Source Serif 4 (display only, not needed for FCP).
4. **`subsets: ["latin"]` only** — do NOT add Cyrillic/Vietnamese/etc. Keeps bundle minimal. CJK comes from Noto Sans SC separately (already loaded).
5. **Mobile tap targets**: every interactive element in new CSS minimum 44×44px (Apple HIG) — enforced via Tailwind `min-h-11 min-w-11` on buttons/links.
6. **No hover-only UX** — all hover styles must have tap equivalents (covered by browser touch handlers, but design review must verify).
7. **Font-size floor**: body ≥ 16px on mobile (browser auto-zooms anything smaller on iOS Safari — breaks layout). Currently `text-base = 16px`, safe.
8. **Tabular numerals on mobile**: `tabular-nums` already applied to HeroStats / salary cards. Keep. Prevents number jitter on narrow screens.

### Mobile-specific review in Phase 1 gate

**Ken (Design)** must verify on real devices (or Chrome DevTools emulation):

- [ ] iPhone SE (320px width) — narrowest phone still supported. Hero + cards must fit without horizontal scroll.
- [ ] iPhone 15 (393px width) — most common iOS.
- [ ] Pixel 8 (412px width) — most common Android.
- [ ] iPad Mini portrait (768px width) — breakpoint where `sm:` rules kick in.
- [ ] Every page type at each of those widths, both EN and ZH locales.

**Raymond (Engineering)** must verify:

- [ ] Lighthouse mobile score stays ≥ 90 for Performance, Accessibility, Best Practices, SEO
- [ ] No CLS regressions in Real User Monitoring (RUM) if Plausible/CF tracks this
- [ ] Touch-scroll performance (60fps) on lowest-tier Android (Pixel 6a emulation)

**Maya (SEO)** must verify:

- [ ] Mobile-Friendly Test passes: https://search.google.com/test/mobile-friendly
- [ ] Core Web Vitals in Search Console don't regress week-over-week
- [ ] Mobile-Usability report stays clean

### Mobile-specific fixes to roll in during Phase 1

**Observation from current production (operator screenshots 2026-04-18)**: some overflow already fixed in `f942a13`. Phase 1 should NOT regress those fixes. Specifically:

- `SalaryCard` big-number row uses `[overflow-wrap:anywhere]` — keep
- `CinematicHero` mobile uses `text-[14vw]` — keep (don't bump to 16vw for serif headlines)
- `HeroStats` delta lines use `break-words` — keep

Phase 1 may surface NEW overflow issues with serif font metrics (Source Serif 4 has slightly wider glyphs than Geist Sans). Ken must screenshot-test every page type on 320px viewport after Phase 1 deploy.

---

## SEO + CF + Performance preservation checklist

Operator directive: "ensure we check back at our current seo, and performances config such as for cf, etc"

### Current state we MUST preserve (documented as of 2026-04-18 end-of-session)

| Area                            | Current value                                                       | Where configured                          | Phase 1 preservation rule                         |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| **www → apex 308**              | `https://www.* → zcybernews.com`                                    | `proxy.ts`                                | DO NOT modify proxy.ts in Phase 1                 |
| **Locale-less → /en/ 308**      | `/articles/x → /en/articles/x`                                      | `proxy.ts`                                | DO NOT modify proxy.ts in Phase 1                 |
| **Root / Accept-Language 307**  | `/ → /en or /zh`                                                    | next-intl middleware via `proxy.ts`       | DO NOT modify proxy.ts in Phase 1                 |
| **NEXT_LOCALE cookie disabled** | `localeCookie: false`                                               | `i18n/routing.ts`                         | DO NOT modify i18n/routing.ts in Phase 1          |
| **CF Cache HIT on content**     | `public, s-maxage=3600, swr=86400` on `/en/*` `/zh/*`               | `next.config.ts` headers                  | DO NOT modify next.config.ts Cache-Control blocks |
| **CF Status Code TTL**          | 4xx + 5xx = No cache (operator-configured at CF dashboard)          | Cloudflare Cache Rule                     | No app-side change needed                         |
| **/admin private + noindex**    | `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`        | `next.config.ts`                          | DO NOT modify admin header rules                  |
| **Canonical URLs**              | Point to apex + correct locale                                      | `generateMetadata` per page               | DO NOT touch generateMetadata anywhere            |
| **hreflang**                    | HTML `<link>` + HTTP `Link:` headers                                | `generateMetadata` `alternates.languages` | DO NOT modify                                     |
| **Structured data emit count**  | Article: 4 JSON-LD blocks. /salary: 8.                              | Per-page components                       | DO NOT modify JsonLd.tsx or its consumers         |
| **Sitemap**                     | 863 URLs including `/salary?market=xx` filters + hreflang           | `app/sitemap.ts`                          | DO NOT modify                                     |
| **robots.txt**                  | Allows all, disallows /admin/, /api/admin/, /api/cve/, /api/search/ | `app/robots.ts`                           | DO NOT modify                                     |
| **Open Graph + Twitter**        | Present on every article                                            | `generateMetadata`                        | DO NOT modify                                     |
| **ISR revalidate intervals**    | Articles 3600s, /salary 86400s, sitemap 3600s                       | Per-page `export const revalidate`        | DO NOT modify                                     |
| **Noto Sans SC CJK webfont**    | Loaded via `next/font/google`                                       | `app/layout.tsx`                          | **KEEP** when swapping Geist→Inter                |
| **Geist Mono for tabular data** | Currency, numbers, code                                             | `app/layout.tsx`                          | **KEEP** — no change                              |
| **Security headers**            | X-Frame-Options, CSP, HSTS, etc.                                    | `next.config.ts`                          | DO NOT touch the securityHeaders array            |
| **WeChat user-agent detection** | `MicroMessenger` → redirect to /zh                                  | `proxy.ts`                                | DO NOT touch                                      |

### Verification checklist after Phase 1 deploy

Run the same comprehensive audit we ran at end of session 2026-04-18. All items must remain green:

```bash
# Canonical redirects still work
curl -sI https://www.zcybernews.com/en/salary | head -2     # expect 308 → apex
curl -sI https://zcybernews.com/articles/foo | head -2      # expect 308 → /en/articles/foo
curl -sI https://zcybernews.com/ | head -2                   # expect 307 → /en or /zh

# CF cache still HIT
curl -sI https://zcybernews.com/en/salary | grep cf-cache-status  # expect HIT

# No Set-Cookie leak
curl -sI https://zcybernews.com/en/salary | grep -i set-cookie    # expect empty

# Articles still 200 (SEV3 stays fixed)
curl -sI https://zcybernews.com/en/articles/2026-04-14-mirax-android-rat-proxy-botnet | head -1

# Admin still private + noindex
curl -sI https://zcybernews.com/admin/login | grep -iE "cache-control|x-robots"
```

Every item above MUST still pass after Phase 1. If ANY regress, rollback immediately.

### Why this preservation matters

Phase 1 is ONLY typography + theme tokens. The only files touched are:

- `app/layout.tsx` (font imports)
- `app/globals.css` (CSS variables + font stack)
- `components/ThemeProvider.tsx` (verify only, likely no edit)

**Zero touches** to routing, metadata, structured data, sitemap, robots, cache headers, proxy, or any API. If Phase 1 somehow regresses any SEO/CF item, it means an unrelated bug was already latent. Either way: `git revert` the phase 1 commit and we're back to current state.

---

## What's DEFERRED to later phases

| Phase       | Scope                                                                                   | Blocked by                             |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| **Phase 2** | Mobile index redesign (cycling hero: lede-quote + breaking-news + featured-threat-card) | Phase 1 shipped + 3-5 days observation |
| **Phase 3** | Desktop index + articles listing (NYT/Vertonews multi-column)                           | Phase 2 shipped + observation          |
| **Phase 4** | Article detail polish (NYT mobile pattern)                                              | Phase 3 shipped + observation          |

Each subsequent phase gets its own spec doc + gate review.

---

## Operator sign-off checklist

Before Alex green-lights Ken to start implementation:

- [ ] Operator reviews this spec end-to-end
- [ ] Operator confirms font choice (Inter + Source Serif 4)
- [ ] Operator confirms theme token palette (light default + existing dark kept)
- [ ] Operator confirms /salary adopts light theme (not kept as black-exception)
- [ ] Operator confirms ship-Phase-1-alone strategy
- [ ] Any objections or changes logged here before commit lands

---

## Open questions / risks / unknowns

1. **Font download reliability at build**: Google Fonts is generally reliable but has rate limits. Fallback: if next/font fails at build, use self-hosted font files. Raymond to verify build log on first ship.
2. **Noto Sans SC still bundled correctly?** Already confirmed working (CJK rendering verified last session). No action needed.
3. **CSS specificity conflicts**: `.font-serif !important` override should win everywhere. Raymond to double-check against Tailwind v4's generated utilities.
4. **Phase 1 breaks existing dark-theme users**: some visitors might have `.dark` class cached from previous visits. `ThemeProvider` should re-hydrate to system/light as intended. Minor UX issue, auto-resolves on next paint.

---

## Sign-off

- [ ] Operator
- [ ] Alex (PM) — spec written
- [ ] Ken (Design) — typography + token palette reviewed
- [ ] Vincent (Architect) — ripple analysis reviewed
- [ ] Raymond (Engineering) — bundle + CWV reviewed
- [ ] Maya (SEO) — semantic preservation reviewed
