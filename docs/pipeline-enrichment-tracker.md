# Pipeline Enrichment Tracker — Hero Card Coverage

**Status**: Phase P-A **SHIPPED** (`c0e7100`, 2026-04-18) · Phase P-B queued
**Author**: Alex (PM)
**Last updated**: 2026-04-18
**Related**: `docs/redesign-phase-2-spec.md` (the cards this feeds)

---

## 1. Context — why this work exists

Phase 2 homepage redesign (`524f954`) shipped typography-forward category cards whose hero element is NOT a photo — it's a structured frontmatter field:

| Card            | Hero element                | Frontmatter field      |
| --------------- | --------------------------- | ---------------------- |
| `VulnCard`      | Big CVSS score (72px serif) | `cvss_score`           |
| `MalwareCard`   | Threat actor name           | `threat_actor`         |
| `IndustryCard`  | Entity/company name         | derived from `tags[0]` |
| `AICard`        | Provider or attack class    | derived from `tags[0]` |
| Hero CENTER col | THE ONE photo on the page   | `featured_image`       |

Problem: the AI pipeline was populating these fields at near-zero rates, so cards rendered `—` placeholders. Baseline coverage on 202 EN articles at start of day:

- `cvss_score` — **5.9%** (12 / 202)
- `threat_actor` — **2.5%** (5 / 202)
- `featured_image` / `featured_image_alt` — **~0%**
- `iocs`, `ttp_matrix`, `industry_angle`, `campaign` — **~0%**

Root cause: prompts were too soft about structured fields, AND the LLM hallucinated when it did try (e.g. "Payouts King" as a threat actor). Core principle applies: **deterministic rules belong in scripts, semantic judgment in agents** (see MEMORY).

---

## 2. Phase P-A — shipped 2026-04-18 (`c0e7100`)

**Approach**: shift-right — let LLM write prose, let script derive structured fields post-hoc with cross-checks against source RSS stories.

### Files touched

- `scripts/pipeline/post-process.ts` — added `extractCvssScore()` + `extractThreatActor()`. Run after LLM generation, before MDX write.
- `data/known-threat-actors.json` — new. ~90 canonical actors + aliases (LockBit, APT28, BlackCat, FIN7, Scattered Spider, etc.).
- `scripts/ai/prompts/article.ts` — prompt tightening: LLM now instructed to fill structured fields assertively when evidence exists in sources.
- `scripts/smoke-test-extractors.ts` — new. Re-runs extractors against all existing EN articles to measure lift and catch regressions.

### Smoke test results (202 EN articles)

| Field          | Baseline | After P-A script-derived | Delta        | Regressions |
| -------------- | -------- | ------------------------ | ------------ | ----------- |
| `cvss_score`   | 5.9%     | **7.9%**                 | +4 articles  | 0           |
| `threat_actor` | 2.5%     | **7.9%**                 | +13 articles | 0           |

**LLM vs script disagreements** (both resolved in script's favor):

1. LLM said `"Russian-speaking threat actor"` → script canonicalized to `APT28`.
2. LLM hallucinated `"Payouts King"` → script correctly identified `BlackBasta`.

### Why zero false positives

Case-sensitive guard on ambiguous aliases — `play`, `hive`, `royal`, `medusa`, `akira`, `conti`, `agenda`. These are English words that would fire on ordinary prose ("royal family", "play store"). Lookup requires the canonical-cased form OR a preceding signal token ("ransomware", "group", "gang"). See `data/known-threat-actors.json` and the alias handling in `scripts/pipeline/post-process.ts`.

---

## 3. Validation — how to re-run

```bash
npx tsx scripts/smoke-test-extractors.ts
```

The script reads every `.mdx` under `content/en/posts/` and `content/en/threat-intel/`, runs both extractors against the body + frontmatter, and reports:

- Coverage % per field (baseline vs script-derived)
- Every LLM-vs-script disagreement (for manual review)
- Any match that fires without a signal token (potential false positive)

**Before merging any change to `scripts/pipeline/post-process.ts` or `data/known-threat-actors.json`**: re-run smoke test, confirm 0 regressions, paste results in the PR.

---

## 4. Phase P-B and beyond — next up

Ordered by impact-to-effort:

### P-B1 · `featured_image` via fal.ai FLUX-schnell — HIGH impact, LOW effort, BLOCKED on UX call

- fal.ai is already wired in the tech stack per CLAUDE.md but not called by the pipeline.
- Cost: $0.003/image × ~10 articles/day ≈ **$0.90/month**. Trivial.
- **Real blocker**: are stock AI-gen images better than the per-category SVG defaults we ship today? See Open Questions §6.
- Touches: `scripts/pipeline/generate-article.ts` (add image step after post-process), `scripts/ai/provider.ts` (fal client).

### P-B2 · TTP matrix regex extraction — MEDIUM impact, LOW effort

- `iocs` (hashes, IPs) already extracted by post-process. TTP matrix still LLM-only.
- Add MITRE ATT&CK technique-ID regex (`T\d{4}(\.\d{3})?`) + cross-check against source stories.
- Reuses the canonical-alias pattern from threat_actor. Should be ~50 LOC.

### P-B3 · ZH article parity run — MEDIUM impact, LOW effort

- Smoke test currently only covers EN. Need a parallel pass over `content/zh/posts/` and `content/zh/threat-intel/`.
- Threat-actor aliases need ZH spellings (锁比特 → LockBit, etc.). Additive to `data/known-threat-actors.json`.
- Must run before claiming EN/ZH parity to Maya for marketing copy.

### P-B4 · `industry_angle`, `campaign`, `affected_sectors`, `affected_regions` — LOW impact, MEDIUM effort

- LLM-only fields. Low priority because hero cards don't consume them.
- Keep on the list for when `IndustryCard` or filter UX needs them. Defer until card designs require.

---

## 5. KPIs to watch

**Weekly review on next 10 auto-generated articles** (not retroactive — forward-looking only):

| KPI                              | P-A target | P-B1 target | Source                       |
| -------------------------------- | ---------- | ----------- | ---------------------------- |
| % articles with `cvss_score`     | ≥ 50%      | ≥ 60%       | smoke test re-run            |
| % articles with `threat_actor`   | ≥ 40%      | ≥ 50%       | smoke test re-run            |
| % articles with `featured_image` | ~0%        | ≥ 95%       | `ls public/images/articles/` |
| Hero `—` placeholder render rate | Down WoW   | Down WoW    | homepage eyeball QA          |

The smoke-test-against-historical numbers (7.9% / 7.9%) are floor estimates — future articles go through tightened prompts AND the extractors, so forward coverage should run meaningfully higher.

---

## 6. Open questions

1. **Stock AI-gen images vs per-category SVGs — for Maya.** Current per-category SVGs are on-brand and consistent. fal.ai FLUX-schnell images would be article-specific but stylistically variable. Tradeoff: editorial authenticity (photos) vs brand consistency (SVGs). Need Maya's call before P-B1 ships. Suggested test: generate 10 images, A/B render against SVG defaults on a staging branch, eyeball.
2. **Case-sensitive guard coverage.** Today's ambiguous-alias list is 7 entries. Anything new added to `data/known-threat-actors.json` that is also a common English word MUST be added to the guard. Needs a linter or PR-template checkbox.
3. **TTP matrix hallucination risk.** Unlike CVSS/actor, ATT&CK techniques are numerous and intersecting. A regex match on `T1059` doesn't mean the article actually describes that technique. Cross-check threshold needs definition before P-B2 ships.
