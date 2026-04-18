# Design Standard 2026 — ZCyberNews

**Author:** Ken (Design Lead)
**Date:** 2026-04-18
**Companion to:** [`docs/adr/0002-mobile-desktop-2026-standard.md`](./adr/0002-mobile-desktop-2026-standard.md) (Vincent, architecture)
**Status:** Active — drives P0/P1/P2 design workstreams

Vincent answered "is the stack 2026-grade?" (yes, with a `contain` / `content-visibility` / container-query / RUM punchlist). This doc answers the other half: **what does 2026 look and feel like, and where are we short?**

---

## 1. What "2026 design" actually means

Not a style — a set of craft disciplines that converged in 2024–25 and became table stakes in 2026. Reference sites that embody it:

- **NYT (nytimes.com)** — editorial typographic rhythm at every breakpoint. Headlines are a fluid clamp, not a Tailwind `text-5xl`. Column widths change, line-height doesn't fight the type.
- **Stripe docs (docs.stripe.com)** — OKLCH color tokens with automatic dark mode, perfect keyboard nav, focus-visible rings that are design elements not browser defaults, code blocks with tabular numerics.
- **Linear (linear.app)** — motion as language. 120ms hovers, 180ms panels, 240ms page transitions. Every interaction has an easing curve. `prefers-reduced-motion` kills them all cleanly.
- **Vercel dashboard (vercel.com/dashboard)** — dense-information design done right. Sparklines, mini-bars, numeric-in-mono, 12–13px tabular data without feeling cramped because space scale is enforced.
- **The Verge 2022→ redesign (theverge.com)** — aggressive typography, extreme scale, but every size is `clamp()`-driven and nothing overflows on iPhone SE.

What they share:

1. **Fluid type.** Zero fixed-px headlines. `clamp(min, preferred, max)` everywhere.
2. **Token-driven everything.** No `p-[17px]`. No `text-[3.2rem]`. Raw values are a smell.
3. **Motion has a grammar.** Durations and easings are tokens, not vibes. Reduced-motion is a first-class path.
4. **Focus-visible is a design element.** Keyboard users are first-class. Default outlines are replaced with deliberate rings.
5. **Density respects space scale.** Dense ≠ cramped. It means the 4pt grid is honored even at 12px type.
6. **Mobile is not "desktop minus".** Thumb zone, safe area, Dynamic Type, bottom sheets are designed-in, not bolted-on.

---

## 2. Design tokens — 2026 canonical

### 2.1 Type scale (fluid)

Five steps, each a `clamp()`. No fixed `text-Nxl` on headings. Tailwind v4 `@theme` block:

```css
@theme {
  --text-display: clamp(2.5rem, 1rem + 4.5vw, 5rem); /* hero h1 */
  --text-title: clamp(1.75rem, 1rem + 2.5vw, 3rem); /* article h1, section h2 */
  --text-head: clamp(1.25rem, 0.9rem + 1.2vw, 1.75rem); /* card title, h3 */
  --text-body: clamp(1rem, 0.95rem + 0.15vw, 1.125rem); /* paragraph */
  --text-meta: 0.875rem; /* fixed; metadata, labels */
  --text-micro: 0.75rem; /* fixed; badges, captions */

  --leading-display: 1.05;
  --leading-title: 1.15;
  --leading-body: 1.6;
}
```

**Rule:** Any headline that today uses `text-3xl`, `text-4xl`, `text-5xl`, `text-[Nvw]`, or `text-[Npx]` migrates to one of these five. Caps and floors are mandatory — no unbounded `vw`.

### 2.2 Space scale (4pt modular)

```css
@theme {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  --space-32: 8rem;
  --space-48: 12rem;
}
```

Max usable value = `--space-48` (192px). Anything larger is a layout bug, not spacing.

### 2.3 Color — OKLCH, semantic pairs

HSL is dead for new tokens. OKLCH gives perceptual uniformity (a +5% L change _looks_ like +5%, unlike HSL):

```css
@theme {
  --color-bg: oklch(99% 0 0);
  --color-fg: oklch(18% 0.02 260);
  --color-muted: oklch(60% 0.01 260);
  --color-accent: oklch(58% 0.19 155); /* emerald */
  --color-danger: oklch(58% 0.22 25);
  --color-border: oklch(92% 0.005 260);
}
@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg: oklch(14% 0.01 260);
    --color-fg: oklch(96% 0 0); /* ... */
  }
}
```

Every token is a **semantic pair** (`bg` / `fg`, `surface` / `on-surface`). Never `gray-200`. Always `--color-border`.

### 2.4 Radius — per-element, not global

```css
--radius-xs: 4px; /* badges, pills */
--radius-sm: 8px; /* inputs, buttons */
--radius-md: 12px; /* cards */
--radius-lg: 16px; /* dialogs, sheets */
--radius-full: 9999px;
```

### 2.5 Shadow — per-elevation

```css
--shadow-1: 0 1px 2px oklch(0% 0 0 / 0.04);
--shadow-2: 0 4px 12px oklch(0% 0 0 / 0.06);
--shadow-3: 0 12px 32px oklch(0% 0 0 / 0.1);
```

Three layers. Anything more nuanced is a bespoke shadow, and bespoke shadows are a smell.

### 2.6 Motion — tokenized, reduced-motion aware

```css
@theme {
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-spring: cubic-bezier(0.5, 1.5, 0.5, 1);
  --dur-fast: 120ms; /* hover, focus */
  --dur-base: 180ms; /* panels, toggles */
  --dur-slow: 320ms; /* page transitions */
}
@media (prefers-reduced-motion: reduce) {
  @theme {
    --dur-fast: 0ms;
    --dur-base: 0ms;
    --dur-slow: 0ms;
  }
}
```

One token flip disables every animation in the app. That's the bar.

---

## 3. Mobile craft — the 2026 bar

- **Touch targets:** 44×44 minimum (WCAG 2.5.5), 48×48 default. Add a `.tap-size` utility that guarantees it regardless of visual size.
- **Thumb zone:** primary action lives in bottom third of viewport on mobile. Sticky "Subscribe" / "Share" should be bottom, not top.
- **Bottom sheets over modals.** Share dialog, filter panel, and search on mobile → sheet. We already have shadcn `<Sheet>` — use it instead of `<Dialog>` under `md`.
- **Haptics:** `navigator.vibrate(10)` on publish / copy-IOC success. Pragmatic, works on Android, silently no-ops on iOS Safari.
- **Swipe affordances:** only where there's a visible hint (carousel dots, "← swipe" chip). No hidden gestures.
- **Safe area:** `padding-bottom: max(1rem, env(safe-area-inset-bottom))` on all sticky bars. We have zero of these today.
- **Dynamic Type (iOS):** respect user font size — avoid `text-[14px]` fixed. Body copy uses `rem`, inherits from root.

---

## 4. Desktop craft — the 2026 bar

- **Hover is affordance, focus-visible is interaction.** Hover states indicate "this is clickable", focus-visible indicates "you are here". They must look different. Default browser outline is banned; replace with a ring token:
  ```css
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  ```
- **Keyboard parity:** every click path works with Tab / Enter / Esc. The Cmd-K search already does this; audit the admin panel next.
- **Dense data:** tables use `font-feature-settings: "tnum"` on numerics. Geist Mono for anything that lines up in columns (CVSS scores, CVE IDs, timestamps).
- **Cursor states:** `col-resize` on table column dividers, `grab` / `grabbing` on the IOC-table reorder handles (future), `help` on `abbr[title]`.
- **Resize must stay 60fps.** This was the bug that started this ADR. Design-side guardrail: **no text grows above 8rem on any viewport**, and **no grid reshapes mid-drag** — container queries settle on their own without layout thrash when `contain: layout` is applied (Vincent's ADR handles the CSS; designers must not author layouts that require reflow on every pixel of resize).

---

## 5. Gap analysis — zcybernews as of 2026-04-18

### Keep (already 2026-grade)

- Source Serif 4 for editorial h1/h2 — distinctive, load-budgeted, fallback-matched.
- Per-category color tokens and mixed-hero pattern from Phase 2 (`524f954`).
- White-default theme with dark-mode `color-scheme` support (Phase 1, `4d271c8`).
- shadcn/ui + Tailwind v4 `@theme` — the right foundation.

### Missing / weak

- Type scale is **Tailwind-fixed**: `text-3xl`, `text-4xl`, `text-5xl` littered across `components/home/cinematic-hero.tsx`, `article-meta.tsx`, `typography-cards.tsx`. Zero `clamp()` usage in core components.
- CinematicHero still has residual `text-[14vw]` and `pl-[8%]` magic numbers post-fix.
- No canonical space-scale token set — spacing is ad-hoc `p-4`, `p-6`, `p-8`, `p-[17px]` in places.
- No shadow tokens. `shadow-sm` / `shadow-lg` used directly.
- **No motion tokens at all.** Every transition is `transition-all duration-200` inline.
- No `.tap-size` utility. Touch targets on mobile nav pills and salary-filter chips are ~36px — under the 44px floor.
- No `prefers-reduced-motion` handling anywhere in `globals.css`.

### Wrong

- Scattered `text-[Nvw]` — unbounded fluid type is how you get iPhone overshoot (the SEV that triggered this ADR).
- Magic percentage margins like `pl-[8%]`, `ml-[12%]`.
- Focus rings rely on browser defaults in several admin forms.
- No safe-area padding on the sticky header on iOS notch devices.

---

## 6. Design punchlist — ordered by impact

### P0 — next 7 days (Ken executes, pairs with Raymond)

1. **Add fluid type scale tokens** to `app/globals.css` `@theme` block (§2.1 above).
2. **Migrate hero + article titles** to the five-step scale. Delete every `text-[Nvw]` and `text-Nxl` on headlines.
3. **Add `.tap-size` utility** (`min-height: 44px; min-width: 44px`) and apply to mobile nav, filter chips, share buttons.
4. **Audit CinematicHero** — remove remaining `text-[Nvw]` and `pl-[N%]`, replace with clamp + `--space-*`.

### P1 — next 30 days (UX Architect owns tokens, Ken owns rollout)

5. **Space + radius + shadow token sets** in `@theme` (§2.2, 2.4, 2.5). Migrate shadcn components one by one.
6. **Motion tokens + `prefers-reduced-motion`** block (§2.6). Replace every inline transition-all duration-N with the motion tokens: transition-property + duration using CSS custom properties like dur-fast / dur-base, easing tokens like ease-out-expo. See §2.6 for full token names.
7. **Container-query migration for cards** — aligned with Vincent's ADR §4. ArticleCard, VulnCard, MalwareCard size themselves off their container, not the viewport.
8. **Focus-visible ring** — global rule in `globals.css`, audit admin forms.
9. **Safe-area padding** on Header and any future sticky bottom bar.

### P2 — next 90 days (UI Designer + Whimsy Injector)

10. **View Transitions API** — article list → article detail choreography. `startViewTransition()` with shared-element hero image.
11. **Dynamic Type iOS respect** — audit every fixed `text-[Npx]`; convert to `rem` or token.
12. **Dense-data components** — Sparkline, MiniBar, TrendArrow. Needed for the salary-page trend view and a future threat-actor timeline.
13. **OKLCH color migration** — replace the last HSL / `gray-N` tokens (§2.3).

---

## 7. Verdict

**Focused token + utility layer on top of the current Tailwind v4 setup. NOT a design-system rebuild.**

The foundation (Tailwind v4 `@theme`, shadcn/ui, Source Serif 4, flipped light theme, category color tokens, mixed-hero pattern) is correct and current. The gap is a **missing token layer** (type / space / radius / shadow / motion) and **discipline enforcement** (no raw `text-[Nvw]`, no `p-[17px]`). Rebuilding the system would throw out the three good months of Phase 1 + Phase 2 work for no gain.

### Ownership

| Workstream                        | Owner            | Support                  |
| --------------------------------- | ---------------- | ------------------------ |
| P0 type scale + hero migration    | **Ken**          | Raymond (impl)           |
| P0 `.tap-size` utility            | **Ken**          | —                        |
| P1 space/radius/shadow tokens     | **UX Architect** | Ken (rollout audit)      |
| P1 motion tokens + reduced-motion | **UX Architect** | Whimsy Injector (curves) |
| P1 container-query card layouts   | **UX Architect** | Vincent (perf alignment) |
| P1 focus-visible + safe-area      | **Ken**          | —                        |
| P2 View Transitions choreography  | **UI Designer**  | Whimsy Injector          |
| P2 dense-data components          | **UI Designer**  | Raymond                  |
| P2 OKLCH migration                | **UX Architect** | —                        |

Ken reviews every PR that touches `@theme`, global CSS, or a top-level layout component. UI Designer handles new-component design; UX Architect owns the token and utility layer. Raymond and Frontend Developer implement.

---

**One-line verdict:** Token-layer update on the existing Tailwind v4 + shadcn foundation — no design-system rebuild needed.
