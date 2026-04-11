/**
 * AI Provider Factory — Free-first with paid fallback
 *
 * Generation priority for article writing:
 *   1. OpenRouter free models — tried in order (best quality first)
 *      If one is rate-limited (429) or unavailable (404/503), move to next
 *   2. openrouter/free router — OpenRouter's own catch-all free router
 *   3. DeepSeek — paid fallback; returned result includes usedPaidFallback=true
 *      so the admin can be notified of paid API usage
 *
 * Translation priority:
 *   1. OpenRouter: qwen3 (best ZH quality) → gemma-3-27b fallback
 *   2. DeepSeek: deepseek-chat
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { LanguageModel } from "ai";

// ─── OpenRouter free write models ────────────────────────────────────────────
// Ordered by quality & context window. All are ≥12B params, 65k+ context.
// These rotate — if one disappears or is rate-limited we try the next.
export const FREE_WRITE_MODELS = [
  "openai/gpt-oss-120b:free", // 120B, 131k ctx — best quality
  "nvidia/nemotron-3-super-120b-a12b:free", // 120B, 262k ctx
  "minimax/minimax-m2.5:free", // large, 196k ctx
  "meta-llama/llama-3.3-70b-instruct:free", // 70B, 65k ctx — reliable
  "google/gemma-3-27b-it:free", // 27B, 131k ctx
  "google/gemma-4-31b-it:free", // 31B, 262k ctx — newer
  "nousresearch/hermes-3-llama-3.1-405b:free", // 405B when available
  "openrouter/free", // catch-all: OpenRouter picks any free model
] as const;

// Translation models — Qwen is native Chinese, highest ZH quality
export const FREE_TRANSLATE_MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free", // best Chinese quality
  "qwen/qwen3-coder:free", // good alt Qwen
  "openai/gpt-oss-120b:free", // strong multilingual fallback
  "meta-llama/llama-3.3-70b-instruct:free",
  "openrouter/free",
] as const;

// ─── DeepSeek model IDs ───────────────────────────────────────────────────────
export const DEEPSEEK_WRITE_MODEL = "deepseek-chat";
export const DEEPSEEK_TRANSLATE_MODEL = "deepseek-chat";

// ─── Provider detection ───────────────────────────────────────────────────────
export type AIProvider = "openrouter" | "deepseek" | "none";

export function getActiveProvider(): AIProvider {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "none";
}

// ─── OpenRouter client factory ────────────────────────────────────────────────
function makeOpenRouterClient() {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://alecybernews.vercel.app",
      "X-Title": "AleCyberNews",
    },
  });
}

function makeDeepSeekClient() {
  return createOpenAICompatible({
    name: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY!,
  });
}

// ─── generateWithFallback ─────────────────────────────────────────────────────
/**
 * Tries OpenRouter free models in order. Falls back to DeepSeek (paid) if all fail.
 *
 * Returns:
 *   text             — the generated text
 *   modelUsed        — the model ID that succeeded
 *   usedPaidFallback — true if DeepSeek was used (so admin can be notified)
 */
export type GenerateResult = {
  text: string;
  modelUsed: string;
  usedPaidFallback: boolean;
};

export async function generateWithFallback(
  prompt: string,
  options: { maxOutputTokens?: number; temperature?: number } = {},
): Promise<GenerateResult> {
  const { maxOutputTokens = 2000, temperature = 0.6 } = options;
  const errors: string[] = [];

  // ── Step 1: Try OpenRouter free models in order ────────────────────────────
  if (process.env.OPENROUTER_API_KEY) {
    const or = makeOpenRouterClient();

    for (const modelId of FREE_WRITE_MODELS) {
      try {
        const model: LanguageModel = or(modelId);
        const result = await generateText({
          model,
          prompt,
          maxOutputTokens,
          temperature,
        });

        // Sanity check — free router sometimes returns near-empty responses
        if (result.text && result.text.trim().length > 100) {
          return {
            text: result.text,
            modelUsed: modelId,
            usedPaidFallback: false,
          };
        }
        errors.push(
          `${modelId}: response too short (${result.text.trim().length} chars)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 404 = model removed, 429 = rate limited, 503 = unavailable → try next
        // Any other error (auth, malformed) → stop trying OpenRouter
        if (
          msg.includes("404") ||
          msg.includes("429") ||
          msg.includes("503") ||
          msg.includes("rate") ||
          msg.includes("Rate") ||
          msg.includes("No endpoints") ||
          msg.includes("temporarily") ||
          msg.includes("Provider returned error")
        ) {
          errors.push(`${modelId}: ${msg.slice(0, 120)}`);
          continue; // try next model
        }
        // Fatal error (e.g. invalid API key) — stop and fall through to DeepSeek
        errors.push(`${modelId}: fatal — ${msg.slice(0, 120)}`);
        break;
      }
    }
  }

  // ── Step 2: DeepSeek paid fallback ────────────────────────────────────────
  if (process.env.DEEPSEEK_API_KEY) {
    console.warn(
      `[ai-provider] All free models failed — using DeepSeek (paid). Failures:\n` +
        errors.map((e) => `  • ${e}`).join("\n"),
    );
    const ds = makeDeepSeekClient();
    const model: LanguageModel = ds(DEEPSEEK_WRITE_MODEL);
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens,
      temperature,
    });
    return {
      text: result.text,
      modelUsed: `deepseek/${DEEPSEEK_WRITE_MODEL}`,
      usedPaidFallback: true,
    };
  }

  throw new Error(
    `All AI providers failed.\n${errors.join("\n")}\n\nSet OPENROUTER_API_KEY or DEEPSEEK_API_KEY.`,
  );
}

/**
 * Same fallback pattern but for translation (EN → ZH).
 * Uses Qwen-first order (best native Chinese quality).
 */
export async function translateWithFallback(
  prompt: string,
  options: { maxOutputTokens?: number; temperature?: number } = {},
): Promise<GenerateResult> {
  const { maxOutputTokens = 4000, temperature = 0.3 } = options;
  const errors: string[] = [];

  if (process.env.OPENROUTER_API_KEY) {
    const or = makeOpenRouterClient();

    for (const modelId of FREE_TRANSLATE_MODELS) {
      try {
        const model: LanguageModel = or(modelId);
        const result = await generateText({
          model,
          prompt,
          maxOutputTokens,
          temperature,
        });
        if (result.text && result.text.trim().length > 50) {
          return {
            text: result.text,
            modelUsed: modelId,
            usedPaidFallback: false,
          };
        }
        errors.push(`${modelId}: response too short`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("404") ||
          msg.includes("429") ||
          msg.includes("503") ||
          msg.includes("rate") ||
          msg.includes("Rate") ||
          msg.includes("No endpoints") ||
          msg.includes("temporarily") ||
          msg.includes("Provider returned error")
        ) {
          errors.push(`${modelId}: ${msg.slice(0, 120)}`);
          continue;
        }
        errors.push(`${modelId}: fatal — ${msg.slice(0, 120)}`);
        break;
      }
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    console.warn(
      `[ai-provider] All free translate models failed — using DeepSeek (paid). Failures:\n` +
        errors.map((e) => `  • ${e}`).join("\n"),
    );
    const ds = makeDeepSeekClient();
    const model: LanguageModel = ds(DEEPSEEK_TRANSLATE_MODEL);
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens,
      temperature,
    });
    return {
      text: result.text,
      modelUsed: `deepseek/${DEEPSEEK_TRANSLATE_MODEL}`,
      usedPaidFallback: true,
    };
  }

  throw new Error(`All translation providers failed.\n${errors.join("\n")}`);
}

// ─── Legacy single-model getters (kept for backward compat) ──────────────────
// These are still used by any code that hasn't migrated to generateWithFallback

/** @deprecated Use generateWithFallback() instead */
export function getWriteModel(): LanguageModel {
  if (process.env.OPENROUTER_API_KEY) {
    return makeOpenRouterClient()(FREE_WRITE_MODELS[0]);
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return makeDeepSeekClient()(DEEPSEEK_WRITE_MODEL);
  }
  throw new Error("No AI provider configured.");
}

/** @deprecated Use translateWithFallback() instead */
export function getTranslateModel(): LanguageModel {
  if (process.env.OPENROUTER_API_KEY) {
    return makeOpenRouterClient()(FREE_TRANSLATE_MODELS[0]);
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return makeDeepSeekClient()(DEEPSEEK_TRANSLATE_MODEL);
  }
  throw new Error("No AI provider configured.");
}

export function getProviderLabel(): string {
  if (process.env.OPENROUTER_API_KEY) return "OpenRouter (free models)";
  if (process.env.DEEPSEEK_API_KEY) return "DeepSeek (deepseek-chat)";
  return "none";
}
