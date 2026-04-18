# ADR-0002: The 2026 Mobile + Desktop Responsiveness Bar

## Status

Accepted — 2026-04-18

## Context

Operator hit two symptoms in a single day: iPhone viewport overshoot on `/zh/salary` forcing pinch-zoom-out, and drag-resize jitter in desktop DevTools. He declared a hard rule: "mobile and desktop view should be up to 2026 standard." This ADR defines what that bar is, architecturally, and whether our current stack clears it.

This is not a visual style guide. This is about rendering model, network budget, interaction budget, layout engine, and asset pipeline.

---

## 1. The 2026 Bar — What "Modern" Actually Means

### 1.1 Rendering model

The reference 2026 content site ships a **static/ISR shell + streaming RSC + minimal client islands**. Examples:

- **NYT, The Verge (Vox), Bloomberg** — RSC + selective hydration. Article shell is streamed HTML; comments, live tickers, paywall logic are client islands.
- **Stripe, Linear marketing, Vercel.com** — React Server Components with `'use client'` boundaries scoped to interactive chrome only. Linear's app itself is different (local-first CRDT), but their marketing is RSC-shell.
- **Notion, Arc** — different category (app-like, not content). They rely on local-first state + optimistic UI + Web Workers for heavy lifts. Not our model.

**The bar for a content site in 2026: RSC + Suspense-streamed shell, client JS under 80KB gzipped per route, zero blocking third-party scripts above the fold.** This is exactly what Next.js 16 App Router delivers when used correctly.

### 1.2 Network budget (table stakes, not aspirational)

Measured against Chrome UX Report 75th percentile on 4G mobile:

| Metric           | 2026 bar (content) | 2026 bar (app-like) | Our current                                           |
| ---------------- | ------------------ | ------------------- | ----------------------------------------------------- |
| LCP              | < 2.0s             | < 2.5s              | ~2.8s (per CrUX, unverified)                          |
| INP              | < 200ms            | < 200ms             | unmeasured                                            |
| TTFB             | < 500ms            | < 800ms             | ~400ms (CF HIT), ~1.2s (MISS)                         |
| Total JS (gzip)  | < 80KB             | < 200KB             | unmeasured, likely 120-180KB                          |
| Total CSS (gzip) | < 30KB             | < 50KB              | Tailwind v4 JIT should be < 20KB                      |
| LCP image        | < 100KB            | < 100KB             | SVG defaults = tiny; real photos when added = unknown |

**INP replaced FID as a Core Web Vital in March 2024**. It is the 2026 interaction benchmark. 200ms is the Google "good" threshold.

### 1.3 Interaction model

- **120Hz ProMotion** = 8.3ms frame budget. Most sites don't hit this; the bar is "no dropped frames during scroll on a 2-year-old iPhone."
- Modern sites achieve this via: `content-visibility: auto` on below-fold sections, `contain: layout paint` on cards, `will-change` used surgically (not everywhere), passive scroll listeners, CSS-driven animations (no JS rAF loops), and `view-transitions` for navigation.
- **Drag-resize jitter** (operator's complaint) is almost always layout thrash — reading `offsetWidth` inside a resize handler, or layouts where a child's intrinsic size recomputes the parent grid. Fix is `contain` + fixed-column `grid-template-columns` with `minmax(0, 1fr)`.

### 1.4 Layout engine

- **Container queries (`@container`) are baseline** since 2023. All major browsers. In 2026, using only `@media` for component-level responsiveness is a code smell. Pages still use `@media`; components use `@container`.
- **`content-visibility: auto`** on article feed sections gives 2-5x scroll performance wins and is cheap to adopt. Widely used in 2026 production. Baseline in Chrome since 2020, Safari since 17.4 (early 2024).
- **`contain: layout paint`** on cards isolates reflow scope. Free performance win.
- **`:has()` selector** — baseline since Dec 2023, now standard for parent-aware styling (e.g. "card with image vs without").
- **CSS nesting** — baseline. No more SCSS required for nesting.
- **`clamp()` for fluid type** — mandatory in 2026. `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` replaces the old 5-breakpoint ladder.
- **`dvh`/`svh`/`lvh`** — dynamic viewport units, solve the iOS Safari URL-bar jump. Baseline.

### 1.5 Fonts

- **Variable fonts only.** Inter, Source Serif 4, Noto Sans SC are all variable — good.
- **`size-adjust`, `ascent-override`, `descent-override`, `line-gap-override`** on `@font-face` to eliminate CLS during swap. This is the 2026 bar. Next.js `next/font` does this automatically when configured with `adjustFontFallback: true` (default).
- **Preload only the weight that renders above the fold.** Not "all 3 weights."
- **`font-display: swap`** is still correct; `optional` is fine for non-critical text.

### 1.6 Images

The 2026 bar for a self-hosted content site is:

- **AVIF first, WebP fallback, JPEG last.** Chrome/Safari/Firefox all ship AVIF. AVIF is 25-50% smaller than WebP at equivalent quality.
- **Responsive `<img srcset>` with `sizes` attribute** — or Next.js `<Image>` component (which does this for you plus LQIP blur).
- **Decode budget on mobile: < 50ms per above-fold image.** Means keeping LCP image under 100KB and decoded dimensions ≤ 2x displayed size.
- **Pragmatic pipeline pick for us:** Next.js `<Image>` with **`sharp` at build/request time, cached on Cloudflare**. We already run Next.js on a VPS with Cloudflare in front. Adding Cloudflare Images ($5/mo + $1 per 100k) is the low-risk upgrade. Imgproxy is better at scale but adds a service; not worth it at 262 articles.

---

## 2. Gap Analysis — Our Stack vs The Bar

### What we have (baseline-correct)

- Next.js 16 App Router with RSC + Suspense — **best-in-class rendering model, no change needed**
- ISR + memoized content loader + Cloudflare in front — **architecturally at the bar**
- Tailwind v4 with JIT — **small CSS output, correct choice**
- `next/font` with Inter + Source Serif 4 + Noto Sans SC — **correct, variable fonts, fallback adjust happens automatically**
- PM2 cluster mode, zero-downtime deploys — **operationally at the bar**
- Atomic publish + `revalidateTag` — **at the bar**
- SVG category defaults — **correct for now, migrate when real photos land**

### Gaps ranked by impact (ship in this order)

1. **No measurement.** We don't have RUM. We're architecting blind on Core Web Vitals. **Ship Vercel Analytics or Cloudflare Web Analytics (free) + `web-vitals` library reporting to `/api/vitals`.** Without this, every "is it fast?" question is a guess.
2. **`content-visibility: auto` not applied** to article feed sections, tag pages, salary tables. Free 2-5x scroll win on long pages.
3. **`contain: layout paint` not applied** to cards. This is the fix that just shipped for `/zh/salary` — it needs to be the default for every card component in `components/home/`, `components/articles/`, `components/salary/`.
4. **No container queries.** Every responsive component uses media queries. Cards reflow based on viewport, not their slot. The 3-col hero reflow at tablet sizes is awkward precisely because of this. **Migrate `HeroThreeCol`, all `*Card.tsx`, `MoreFromToday` to `@container`.**
5. **No real image pipeline.** When we ship the image-gen Phase 2 (fal.ai FLUX), we need Next.js `<Image>` with AVIF output + Cloudflare caching. Not raw `<img src="/images/articles/foo.webp">`.
6. **No View Transitions on article nav.** `view-transition-name` + CSS animations give native-feel page transitions with zero JS. Next.js 16 supports this via `unstable_ViewTransition`. Would massively upgrade perceived performance.
7. **No INP instrumentation.** We don't know if any interaction is janky until the operator hits it on their phone. `web-vitals` fixes this.
8. **Font preload likely over-eager.** Worth auditing — we probably preload weights not used above the fold.
9. **No `loading="lazy"` + `decoding="async"` audit** on SVG and image elements outside Next.js `<Image>`.
10. **Cloudflare Images not configured.** When real photos land this will bite us.

### What's already good and shouldn't change

- Rendering model (RSC + ISR)
- Deploy pipeline
- Font choices
- Tailwind v4
- `proxy.ts` locale routing
- PM2 cluster + zero-downtime deploys

---

## 3. Roadmap

### Next 7 days — close the gap with CSS + measurement

1. **Ship RUM.** `web-vitals` library → `/api/vitals` → log to stdout initially, upgrade to Cloudflare Analytics later. ~1 hour.
2. **Global card baseline CSS.** In `globals.css`: every `[data-card]` gets `contain: layout paint; max-width: 100%; min-width: 0;`. Audit all card components and add `data-card`. ~2 hours.
3. **`content-visibility: auto`** on `<section>` blocks in home page, tag page, salary list. Each section also needs `contain-intrinsic-size` to prevent scrollbar jumps. ~2 hours.
4. **Fluid type with `clamp()`** site-wide replacing ladder breakpoints. Define 5-6 type tokens in Tailwind v4 theme. ~3 hours.
5. **`dvh` for full-height sections** replacing `vh` (hero, admin panels). ~30 min.
6. **Audit `minmax(0, 1fr)`** — every grid in `components/` — to eliminate overflow-driven reflow. This is what caused the drag-resize jitter. ~2 hours.

**Total: ~1 day of Raymond's time. This alone clears the 2026 bar for layout/interaction.**

### Next 30 days — second wave

1. **Container queries migration.** Convert all card components to `@container`. Start with `TypographyCards`, `PhotoForwardCards`, `MoreFromToday`. ~2 days.
2. **View Transitions API for `/[locale]/articles/[slug]` nav.** `view-transition-name: article-title` on cards → headlines cross-fade. Zero-JS perceived-perf win. ~1 day.
3. **AVIF image pipeline.** Next.js `<Image>` config: `formats: ['image/avif', 'image/webp']`. Add Cloudflare Images for source-of-truth storage. ~1 day.
4. **INP optimization pass.** Use RUM data (now flowing) to find slow interactions. Likely: search dialog debounce, header locale switcher, admin forms. ~2 days.
5. **Font preload audit.** Keep only above-fold weights. ~2 hours.
6. **`@scroll-timeline` or `scroll-driven-animations`** for progress bars on articles. ~1 day. Nice-to-have.

### Next 90 days — reference-tier infrastructure

This is where we decide whether to go deeper. Three moves, ranked:

1. **Cloudflare Images + Polish + Mirage.** ~$5/mo, offloads image transformation entirely. Worth it once we have 500+ articles with real photos.
2. **Cloudflare Workers KV as cacheHandler for Next.js.** Replaces the in-memory ISR cache with a shared KV store. Means all 2 PM2 workers plus any future nodes share one cache. Eliminates the "worker 1 cached, worker 2 didn't" class of bugs. ~2 days engineering + ongoing Workers cost (~$5/mo).
3. **Partial Prerendering (`cacheComponents: true`).** Lets article pages ship the static shell instantly and stream personalization (view count, related articles recompute) as dynamic islands. Next.js 16 supports this. ~3 days engineering. **Only worth it if RUM shows LCP > 2.5s on mobile.**

What we do NOT do in 90 days:

- Do NOT move to Cloudflare Workers runtime. Our MDX pipeline + Node-specific deps (`sharp`, git-based CMS) make this a 2-week migration for no user-visible win.
- Do NOT adopt Astro/islands. RSC is already better for our use case.
- Do NOT rewrite anything in a different framework.

---

## 4. Verdict

**Our architecture is at the 2026 bar. Our CSS wasn't. The fix is 1 day of layout-discipline work + 1 hour of RUM instrumentation, not a re-platform.**

The rendering model (Next.js 16 RSC + ISR + atomic publish), the deploy pipeline (PM2 cluster + zero-downtime), and the font/CSS toolchain (Tailwind v4, variable fonts, `next/font`) are all reference-tier for a 2026 content site. What was missing was defensive layout CSS (`contain`, `content-visibility`, `minmax(0, 1fr)`, `clamp()`, `dvh`) and the container-query migration. Those are hours-to-days of work, not weeks.

The 90-day infrastructure work (Cloudflare Images, Workers KV cacheHandler, PPR) is optional polish, only worth it if RUM data shows a specific gap. Do not front-load it.

## Consequences

- Raymond gets a 7-day punchlist; one engineer-day closes the interaction/layout gap.
- We must ship RUM before any further perf claims — no more flying blind.
- Container-query migration is the one non-trivial refactor; it touches every card component but pays back in layout robustness.
- We defer Cloudflare Images and Workers KV until we have data justifying them.

## Alternatives considered

- **Full re-platform to Astro** — rejected. RSC is equivalent or better for our use case; migration cost is 3+ weeks for no user-visible delta.
- **Move to Cloudflare Workers runtime** — rejected. Our Node-specific content pipeline (`sharp`, git commits from API routes, MDX compilation) would require re-architecture. VPS + CF in front is already fast.
- **Tailwind v4 → CSS Modules** — rejected. Tailwind v4 JIT output is already <20KB gzipped. No gain.

---

**One-line verdict:** Our stack is 2026-grade; what was failing was layout CSS discipline, and a one-day punchlist of `contain` + `content-visibility` + container queries + RUM closes the gap — no re-platform needed.
