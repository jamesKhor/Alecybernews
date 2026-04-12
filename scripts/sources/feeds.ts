import fs from "fs";
import path from "path";

export type FeedSource = {
  id: string;
  name: string;
  url: string;
  category: string;
  type: "rss" | "cisa-kev";
  enabled: boolean;
  description?: string;
};

// Single source of truth: data/rss-sources.json
// Both the admin panel and the pipeline read from this file.
const SOURCES_PATH = path.join(process.cwd(), "data", "rss-sources.json");

function loadSources(): FeedSource[] {
  const raw = fs.readFileSync(SOURCES_PATH, "utf-8");
  return JSON.parse(raw);
}

export const FEED_SOURCES: FeedSource[] = loadSources();

export const ENABLED_SOURCES = FEED_SOURCES.filter((s) => s.enabled);
