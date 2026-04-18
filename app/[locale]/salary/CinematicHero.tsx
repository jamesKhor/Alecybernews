/**
 * CinematicHero — server component, full-viewport landing hero.
 *
 * 2026-04-18 PM rebuild — mobile-first.
 *
 * What went wrong in the prior version:
 *   - 4-line staggered wordmark with text-left / text-right dance
 *     relied on viewport wide enough to show both alignments. On
 *     mobile (<640px), lines 3 and 4 (text-right) frequently rendered
 *     off-screen — users literally saw only "GROW YOUR" with the rest
 *     of the headline invisible.
 *   - vw-based font sizing with too-high upper bound caused resize lag
 *     and pushed CJK glyphs past viewport width at some zoom levels.
 *
 * New layout — two presentations, breakpoint-switched:
 *   • MOBILE (< 640px): centered, single column. The four words render
 *     in a 2×2 grid — visually distinct, guaranteed to fit any phone
 *     from iPhone SE (375) up, no alignment tricks. Font size is
 *     clamped TIGHTLY to prevent viewport overshoot.
 *   • DESKTOP (≥ 640px): the original staggered TX3-style moment.
 *     Large viewports can safely carry the left/right dance.
 *
 * Why 2×2 on mobile (not 4 vertical lines): vertical 4-line takes too
 * much vertical space on short phones (iPhone SE 667px) and pushes the
 * CTA below the fold. 2×2 preserves the editorial weight while staying
 * above the fold.
 */
interface Props {
  locale: "en" | "zh";
  labels: {
    w1: string;
    w2: string;
    w3: string;
    w4: string;
    body: string;
    cta: string;
  };
}

export function CinematicHero({ labels }: Props) {
  return (
    <section
      aria-label="Salary data lede"
      className="relative isolate -mx-4 sm:-mx-6 mb-12 sm:mb-16 overflow-hidden bg-black layout-isolate"
    >
      {/* Backdrop layer stack — radial burn, circuit grid, vignette. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 85% 100%,
              rgba(251, 146, 60, 0.22) 0%,
              rgba(251, 146, 60, 0.10) 30%,
              transparent 70%),
            radial-gradient(ellipse 90% 60% at 15% 0%,
              rgba(6, 182, 212, 0.10) 0%,
              transparent 60%),
            linear-gradient(180deg, #0a0a0a 0%, #000 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)
          `,
          backgroundSize: "32px 32px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ boxShadow: "inset 0 0 200px 40px rgba(0,0,0,0.85)" }}
      />

      {/* Content. Mobile takes only the space it needs (min-h-[56vh]
          keeps the CTA above the fold on iPhone SE). Desktop keeps the
          cinematic 88vh moment. */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-8 py-10 sm:py-24 md:py-32 min-h-[56vh] sm:min-h-[88vh] flex flex-col justify-between gap-8 sm:gap-12">
        {/* ── MOBILE WORDMARK (< 640px) — 2×2 grid, fully contained ── */}
        <div aria-hidden className="sm:hidden grid grid-cols-2 gap-x-3 gap-y-1">
          {[
            { text: labels.w1, strong: false },
            { text: labels.w2, strong: true },
            { text: labels.w3, strong: true },
            { text: labels.w4, strong: false },
          ].map((line, i) => (
            <div
              key={i}
              className={`font-display font-black leading-[0.95] tracking-tight uppercase
                text-[clamp(2rem,11vw,3.5rem)]
                ${line.strong ? "text-white" : "text-white/[0.18]"}
                ${i % 2 === 0 ? "text-left" : "text-right"}`}
              style={{ letterSpacing: "-0.02em" }}
            >
              {line.text}
            </div>
          ))}
        </div>

        {/* ── DESKTOP WORDMARK (≥ 640px) — 4-line staggered TX3 ── */}
        <div
          aria-hidden
          className="hidden sm:flex flex-col w-full overflow-hidden"
        >
          {[
            { text: labels.w1, strong: false, align: "text-left" },
            { text: labels.w2, strong: true, align: "text-left pl-[8%]" },
            { text: labels.w3, strong: true, align: "text-right pr-[4%]" },
            { text: labels.w4, strong: false, align: "text-right" },
          ].map((line, i) => (
            <div
              key={i}
              className={`font-display font-black leading-[0.86] tracking-tight uppercase
                text-[clamp(4rem,15vw,9rem)] md:text-[clamp(5rem,14vw,12rem)] lg:text-[13rem] xl:text-[15rem]
                ${line.align}
                ${line.strong ? "text-white" : "text-white/[0.14]"}
                ${i > 0 ? "-mt-[0.06em]" : ""}`}
              style={{
                letterSpacing: "-0.02em",
                textShadow: line.strong
                  ? "0 0 40px rgba(6, 182, 212, 0.15)"
                  : undefined,
              }}
            >
              {line.text}
            </div>
          ))}
        </div>

        {/* ── BOTTOM: body + CTA. On mobile, CTA is full-width for
               48px+ thumb-zone tap target. */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6 max-w-full">
          <p className="text-[15px] sm:text-base text-white/70 leading-relaxed max-w-sm">
            {labels.body}
          </p>
          <a
            href="#dataset"
            className="inline-flex items-center justify-center gap-2 shrink-0
              bg-white text-black
              text-sm sm:text-base font-semibold
              w-full sm:w-auto
              px-6 sm:px-7 py-3.5 sm:py-3.5 rounded-sm
              hover:bg-white/90 active:bg-white/80
              transition-colors
              shadow-[0_4px_24px_rgba(255,255,255,0.08)]
              min-h-[48px]"
          >
            <span>{labels.cta}</span>
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
