import { translateText } from "../ai/provider.js";
import {
  buildTranslationPrompt,
  buildZhMetaPrompt,
} from "../ai/prompts/translation.js";
import { withRetry } from "../utils/rate-limit.js";
import type { GeneratedArticle } from "../ai/schemas/article-schema.js";

export type TranslatedMeta = {
  title: string;
  excerpt: string;
  body: string;
};

/** Translate an English article to Chinese. */
export async function translateArticle(
  article: GeneratedArticle,
): Promise<TranslatedMeta | null> {
  try {
    // Translate body
    const {
      text: zhBody,
      modelUsed: bodyModel,
      paid: bodyPaid,
    } = await withRetry(() =>
      translateText(buildTranslationPrompt(article.body, article.title), {
        maxOutputTokens: 4000,
        temperature: 0.3,
      }),
    );
    console.log(
      `[translate] Body translated by ${bodyModel}${bodyPaid ? " (PAID)" : " (FREE)"}`,
    );

    // Translate title + excerpt
    const {
      text: metaRaw,
      modelUsed: metaModel,
      paid: metaPaid,
    } = await withRetry(() =>
      translateText(buildZhMetaPrompt(article.excerpt, article.title), {
        maxOutputTokens: 300,
        temperature: 0.2,
      }),
    );
    console.log(
      `[translate] Meta translated by ${metaModel}${metaPaid ? " (PAID)" : " (FREE)"}`,
    );

    let zhTitle = article.title;
    let zhExcerpt = article.excerpt;

    try {
      const cleaned = metaRaw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const meta = JSON.parse(cleaned) as { title?: string; excerpt?: string };
      if (meta.title) zhTitle = meta.title;
      if (meta.excerpt) zhExcerpt = meta.excerpt;
    } catch {
      console.warn(
        "[translate] Meta JSON parse failed, using English title/excerpt",
      );
    }

    return { title: zhTitle, excerpt: zhExcerpt, body: zhBody };
  } catch (err) {
    console.error("[translate] Translation failed:", err);
    return null;
  }
}
