import { auth } from "@/auth";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import type { FeedArticle } from "@/lib/rss/fetch";

const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

type PastedText = { label?: string; text: string };

type SynthesizeRequest =
  | {
      // Feed mode: articles selected from RSS reader
      articles: FeedArticle[];
      pastedTexts?: never;
      targetLength?: "short" | "medium" | "long";
      customPrompt?: string;
    }
  | {
      // Paste mode: raw text blocks pasted by user
      articles?: never;
      pastedTexts: PastedText[];
      targetLength?: "short" | "medium" | "long";
      customPrompt?: string;
    };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 503 });
  }

  const body = (await req.json()) as SynthesizeRequest;
  const { targetLength = "medium", customPrompt } = body;
  const wordCount = { short: "400-600", medium: "700-900", long: "1000-1300" }[targetLength];

  // Build the source context block
  let sourceContext: string;
  let primaryCategory = "cybersecurity";
  let autoTags: string[] = [];
  let sourceCount: number;

  if (body.pastedTexts && body.pastedTexts.length > 0) {
    const validBlocks = body.pastedTexts.filter((b) => b.text.trim());
    if (validBlocks.length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    sourceCount = validBlocks.length;
    sourceContext = validBlocks
      .map(
        (b, i) =>
          `SOURCE ${i + 1}${b.label ? ` (${b.label})` : ""}:\n${b.text.trim()}`
      )
      .join("\n\n---\n\n");
  } else if (body.articles && body.articles.length > 0) {
    const { articles } = body;
    sourceCount = articles.length;
    primaryCategory = articles[0]?.sourceCategory ?? "cybersecurity";
    autoTags = [...new Set(articles.flatMap((a) => a.tags ?? []).filter(Boolean))].slice(0, 6);
    sourceContext = articles
      .map(
        (a, i) =>
          `SOURCE ${i + 1}: "${a.title}" (from ${a.sourceName})\n${a.excerpt}`
      )
      .join("\n\n---\n\n");
  } else {
    return NextResponse.json({ error: "No sources provided" }, { status: 400 });
  }

  // Optional custom instruction block
  const customInstruction = customPrompt?.trim()
    ? `\nADDITIONAL INSTRUCTIONS FROM EDITOR:\n${customPrompt.trim()}\n`
    : "";

  const prompt = `You are a professional cybersecurity journalist writing for AleCyberNews, a cybersecurity and tech news site.

You have been given ${sourceCount} source(s). Synthesize them into ONE original, well-structured article that:
- Combines unique insights from all sources
- Does NOT copy sentences verbatim — rewrite entirely in your own words
- Is ${wordCount} words long
- Uses markdown formatting (## for sections, **bold** for key terms, \`code\` for CVE IDs/tools)
- Starts with a compelling lead paragraph (no heading)
- Includes 2-4 section headings (##)
- Ends with a "Key Takeaways" section
- Is factual, precise, and security-focused
${customInstruction}
SOURCES:
${sourceContext}

Now write the synthesized article in markdown. Do not include a title — return only the body content.`;

  try {
    const { text } = await generateText({
      model: deepseek("deepseek-chat"),
      prompt,
      maxOutputTokens: 2000,
      temperature: 0.6,
    });

    // Generate headline suggestion
    const suggestedTitle = await generateText({
      model: deepseek("deepseek-chat"),
      prompt: `Based on this article content, write a concise, SEO-friendly headline (max 80 characters). Return ONLY the headline, no quotes.\n\n${text.slice(0, 500)}`,
      maxOutputTokens: 50,
      temperature: 0.4,
    });

    const cleanTitle = suggestedTitle.text.replace(/^["']|["']$/g, "").trim();
    const slugBase = cleanTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    const today = new Date().toISOString().split("T")[0];

    return NextResponse.json({
      content: text,
      suggested: {
        title: cleanTitle,
        slug: `${today}-${slugBase}`,
        category: primaryCategory,
        tags: autoTags,
        excerpt: text.split("\n").find((l) => l.trim().length > 80)?.slice(0, 200) ?? "",
      },
    });
  } catch (err) {
    console.error("[api/admin/synthesize]", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
