import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import type { RssSource } from "@/lib/rss/fetch";

const SOURCES_PATH = path.join(process.cwd(), "data", "rss-sources.json");

function readSources(): RssSource[] {
  const raw = fs.readFileSync(SOURCES_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeSources(sources: RssSource[]) {
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2) + "\n");
}

// GET — list all sources
export async function GET(req: Request) {
  const guard = await adminGuard(req as never, "sources-read", 30, 60_000);
  if (guard) return guard;

  const sources = readSources();
  return NextResponse.json(sources);
}

// POST — add a new source or test a feed URL
export async function POST(req: Request) {
  const guard = await adminGuard(req as never, "sources-write", 10, 60_000);
  if (guard) return guard;

  const body = await req.json();

  // Test mode — just validate the feed URL
  if (body.action === "test") {
    // SSRF protection: only allow https URLs to external hosts
    try {
      const testUrl = new URL(body.url);
      if (testUrl.protocol !== "https:") {
        return NextResponse.json(
          { ok: false, error: "Only HTTPS URLs are allowed" },
          { status: 400 },
        );
      }
      if (
        testUrl.hostname === "localhost" ||
        testUrl.hostname === "127.0.0.1" ||
        testUrl.hostname.startsWith("169.254.") ||
        testUrl.hostname.startsWith("10.") ||
        testUrl.hostname.startsWith("192.168.") ||
        testUrl.hostname.endsWith(".internal")
      ) {
        return NextResponse.json(
          { ok: false, error: "Internal URLs are not allowed" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid URL" },
        { status: 400 },
      );
    }

    try {
      const parser = new Parser({
        timeout: 10000,
        headers: { "User-Agent": "ZCyberNews/1.0 RSS Reader" },
      });
      const feed = await parser.parseURL(body.url);
      return NextResponse.json({
        ok: true,
        title: feed.title,
        itemCount: feed.items?.length ?? 0,
        lastItem: feed.items?.[0]?.title ?? null,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to parse feed",
      });
    }
  }

  // Add new source
  const { id, name, url, category, type, description } = body;
  if (!id || !name || !url) {
    return NextResponse.json(
      { error: "id, name, and url are required" },
      { status: 400 },
    );
  }

  const sources = readSources();
  if (sources.some((s) => s.id === id)) {
    return NextResponse.json(
      { error: "Source with this ID already exists" },
      { status: 409 },
    );
  }

  const newSource: RssSource = {
    id,
    name,
    url,
    category: category ?? "cybersecurity",
    type: type ?? "rss",
    enabled: true,
    description: description ?? "",
  };

  sources.push(newSource);
  writeSources(sources);

  return NextResponse.json(newSource, { status: 201 });
}

// PUT — update a source (toggle enabled, edit fields)
export async function PUT(req: Request) {
  const guard = await adminGuard(req as never, "sources-update", 10, 60_000);
  if (guard) return guard;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sources = readSources();
  const idx = sources.findIndex((s) => s.id === id);
  if (idx === -1)
    return NextResponse.json({ error: "Source not found" }, { status: 404 });

  sources[idx] = { ...sources[idx], ...updates, id }; // preserve id
  writeSources(sources);

  return NextResponse.json(sources[idx]);
}

// DELETE — remove a source
export async function DELETE(req: Request) {
  const guard = await adminGuard(req as never, "sources-delete", 10, 60_000);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 },
    );

  const sources = readSources();
  const filtered = sources.filter((s) => s.id !== id);
  if (filtered.length === sources.length) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  writeSources(filtered);
  return NextResponse.json({ ok: true });
}
