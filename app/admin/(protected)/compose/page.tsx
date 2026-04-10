"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { FeedArticle } from "@/lib/rss/fetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  ExternalLink,
  ChevronDown,
  Plus,
  ClipboardPaste,
  Newspaper,
} from "lucide-react";

type SuggestedMeta = {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  excerpt: string;
};

type PublishResult = {
  success: boolean;
  githubUrl?: string;
  error?: string;
};

type PasteBlock = {
  id: string;
  label: string;
  text: string;
};

const CATEGORIES = [
  "cybersecurity",
  "vulnerabilities",
  "malware",
  "threat-intel",
  "tools",
  "ai",
  "industry",
];

function newPasteBlock(): PasteBlock {
  return { id: crypto.randomUUID(), label: "", text: "" };
}

export default function ComposePage() {
  // Feed mode state
  const [sourceArticles, setSourceArticles] = useState<FeedArticle[]>([]);

  // Paste mode state
  const [pasteBlocks, setPasteBlocks] = useState<PasteBlock[]>([
    newPasteBlock(),
  ]);

  // Shared generation state
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [genError, setGenError] = useState("");
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null,
  );
  const [customPrompt, setCustomPrompt] = useState("");

  // Generated content state
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("cybersecurity");
  const [tags, setTags] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [locale, setLocale] = useState<"en" | "zh">("en");
  const [targetLength, setTargetLength] = useState<"short" | "medium" | "long">(
    "medium",
  );

  useEffect(() => {
    const stored = sessionStorage.getItem("compose_articles");
    if (stored) {
      try {
        setSourceArticles(JSON.parse(stored) as FeedArticle[]);
      } catch {}
    }
  }, []);

  const removeSource = (id: string) => {
    setSourceArticles((prev) => prev.filter((a) => a.id !== id));
  };

  // Paste block helpers
  const addPasteBlock = () => {
    if (pasteBlocks.length < 5)
      setPasteBlocks((prev) => [...prev, newPasteBlock()]);
  };
  const removePasteBlock = (id: string) => {
    if (pasteBlocks.length > 1)
      setPasteBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const updatePasteBlock = (
    id: string,
    field: keyof PasteBlock,
    value: string,
  ) => {
    setPasteBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const handleGenerate = async (mode: "feed" | "paste") => {
    if (mode === "feed" && sourceArticles.length === 0) {
      setGenError("Add at least one source article from the Feed Reader.");
      return;
    }
    if (mode === "paste") {
      const hasText = pasteBlocks.some((b) => b.text.trim().length > 0);
      if (!hasText) {
        setGenError("Paste at least one article text to rewrite.");
        return;
      }
    }

    setGenerating(true);
    setGenError("");
    setPublishResult(null);

    try {
      const body =
        mode === "feed"
          ? {
              articles: sourceArticles,
              targetLength,
              customPrompt: customPrompt.trim() || undefined,
            }
          : {
              pastedTexts: pasteBlocks
                .filter((b) => b.text.trim())
                .map((b) => ({
                  label: b.label.trim() || "Source",
                  text: b.text.trim(),
                })),
              targetLength,
              customPrompt: customPrompt.trim() || undefined,
            };

      const res = await fetch("/api/admin/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        content?: string;
        suggested?: SuggestedMeta;
        error?: string;
      };

      if (!res.ok || data.error) {
        setGenError(data.error ?? "Generation failed");
        return;
      }

      setContent(data.content ?? "");
      if (data.suggested) {
        setTitle(data.suggested.title);
        setSlug(data.suggested.slug);
        setCategory(data.suggested.category);
        setTags(data.suggested.tags.join(", "));
        setExcerpt(data.suggested.excerpt);
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Network error");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!content || !title || !slug) {
      setPublishResult({
        success: false,
        error: "Title, slug and content are required.",
      });
      return;
    }
    setPublishing(true);
    setPublishResult(null);

    try {
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          content,
          excerpt,
          category,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          locale,
          type: "posts",
        }),
      });
      const data = (await res.json()) as PublishResult & { message?: string };
      if (!res.ok) {
        setPublishResult({ success: false, error: data.error });
      } else {
        setPublishResult({ success: true, githubUrl: data.githubUrl });
      }
    } catch (err) {
      setPublishResult({
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPublishing(false);
    }
  };

  // Shared settings + generate panel
  const SettingsPanel = ({ mode }: { mode: "feed" | "paste" }) => (
    <div className="px-4 py-4 border-t border-gray-800 space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        Settings
      </p>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Length</label>
        <div className="relative">
          <select
            value={targetLength}
            onChange={(e) =>
              setTargetLength(e.target.value as typeof targetLength)
            }
            className="w-full appearance-none px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="short">Short (400–600 words)</option>
            <option value="medium">Medium (700–900 words)</option>
            <option value="long">Long (1000–1300 words)</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Publish locale</label>
        <div className="flex gap-2">
          {(["en", "zh"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                locale === l
                  ? "bg-emerald-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {l === "en" ? "English" : "中文"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">
          Additional instructions{" "}
          <span className="text-gray-600">(optional)</span>
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Focus on the impact to healthcare sector. Include a section on attacker TTPs. Write in a more technical tone."
          className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
        />
      </div>

      <button
        onClick={() => handleGenerate(mode)}
        disabled={generating}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {generating ? "Generating…" : "Generate with AI"}
      </button>

      {genError && (
        <div className="flex items-start gap-2 rounded-md bg-red-950/40 border border-red-800 p-3 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {genError}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel: source input + settings */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-900/30 overflow-y-auto">
        <Tabs defaultValue="feed" className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full rounded-none border-b border-gray-800 bg-gray-900/60 h-10 px-2 shrink-0">
            <TabsTrigger
              value="feed"
              className="flex-1 text-xs gap-1.5 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"
            >
              <Newspaper className="w-3.5 h-3.5" />
              From Feed
            </TabsTrigger>
            <TabsTrigger
              value="paste"
              className="flex-1 text-xs gap-1.5 data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste & Compose
            </TabsTrigger>
          </TabsList>

          {/* FROM FEED TAB */}
          <TabsContent
            value="feed"
            className="flex flex-col flex-1 mt-0 min-h-0"
          >
            <div className="px-4 py-3 border-b border-gray-800 shrink-0">
              <p className="text-xs text-gray-500">
                {sourceArticles.length === 0
                  ? "No articles selected."
                  : `${sourceArticles.length} article${sourceArticles.length > 1 ? "s" : ""} selected (max 5)`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {sourceArticles.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center">
                  <p className="text-xs text-gray-500">
                    Go to{" "}
                    <Link
                      href="/admin/feed"
                      className="text-emerald-400 hover:underline"
                    >
                      Feed Reader
                    </Link>{" "}
                    and select 1–5 articles to synthesize.
                  </p>
                </div>
              )}
              {sourceArticles.map((a) => (
                <div
                  key={a.id}
                  className="rounded-md bg-gray-800 border border-gray-700 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-medium line-clamp-2 leading-snug">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-gray-500">{a.sourceName}</span>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-emerald-400"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSource(a.id)}
                      className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <SettingsPanel mode="feed" />
          </TabsContent>

          {/* PASTE & COMPOSE TAB */}
          <TabsContent
            value="paste"
            className="flex flex-col flex-1 mt-0 min-h-0"
          >
            <div className="px-4 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Paste text from any source — AI will rewrite into one article.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {pasteBlocks.map((block, i) => (
                <div
                  key={block.id}
                  className="rounded-md bg-gray-800 border border-gray-700 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">
                      Source {i + 1}
                    </span>
                    {pasteBlocks.length > 1 && (
                      <button
                        onClick={() => removePasteBlock(block.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={block.label}
                    onChange={(e) =>
                      updatePasteBlock(block.id, "label", e.target.value)
                    }
                    placeholder="Source name (optional)"
                    className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <textarea
                    value={block.text}
                    onChange={(e) =>
                      updatePasteBlock(block.id, "text", e.target.value)
                    }
                    rows={5}
                    placeholder="Paste article text here…"
                    className="w-full px-2 py-2 rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y leading-relaxed font-mono"
                  />
                </div>
              ))}

              {pasteBlocks.length < 5 && (
                <button
                  onClick={addPasteBlock}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-gray-700 text-xs text-gray-500 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add another source ({pasteBlocks.length}/5)
                </button>
              )}
            </div>

            <SettingsPanel mode="paste" />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right panel: editor + metadata */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Metadata */}
        <div className="px-6 py-4 border-b border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Article Editor</h2>
            <button
              onClick={handlePublish}
              disabled={publishing || !content}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {publishing ? "Publishing…" : "Publish to Site"}
            </button>
          </div>

          {publishResult && (
            <div
              className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                publishResult.success
                  ? "bg-emerald-950/40 border border-emerald-800 text-emerald-400"
                  : "bg-red-950/40 border border-red-800 text-red-400"
              }`}
            >
              {publishResult.success ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <div>
                {publishResult.success ? (
                  <span>
                    Published! Cloudflare is deploying.{" "}
                    {publishResult.githubUrl && (
                      <a
                        href={publishResult.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-emerald-300"
                      >
                        View on GitHub
                      </a>
                    )}
                  </span>
                ) : (
                  publishResult.error
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-500">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Article title…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                placeholder="2026-04-10-article-slug"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Category</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full appearance-none px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-500">
                Tags (comma separated)
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="ransomware, CVE-2024-1234, healthcare"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-500">Excerpt</label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Short description for cards and SEO…"
              />
            </div>
          </div>
        </div>

        {/* Content editor */}
        <div className="flex-1 px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              Article Content (Markdown)
            </label>
            {content && (
              <span className="text-xs text-gray-600">
                ~{Math.ceil(content.split(/\s+/).length)} words
              </span>
            )}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[calc(100vh-480px)] min-h-64 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono resize-none leading-relaxed"
            placeholder="Generated article content will appear here. You can also write or paste markdown directly…"
          />
        </div>
      </div>
    </div>
  );
}
