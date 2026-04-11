import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CVEData = {
  id: string;
  description: string;
  score: number | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | null;
  published: string;
  status: string;
  cvssVersion: string | null;
};

type NVDVulnerability = {
  cve: {
    id: string;
    published: string;
    vulnStatus: string;
    descriptions: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData: { baseScore: number; baseSeverity: string };
      }>;
      cvssMetricV30?: Array<{
        cvssData: { baseScore: number; baseSeverity: string };
      }>;
      cvssMetricV2?: Array<{
        baseSeverity: string;
        cvssData: { baseScore: number };
      }>;
    };
  };
};

// ─── In-memory cache (24 h TTL) ──────────────────────────────────────────────

const cache = new Map<string, { data: CVEData; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Normalise and validate CVE ID format
  const cveId = id.toUpperCase().trim();
  if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) {
    return NextResponse.json(
      { error: "Invalid CVE ID format" },
      { status: 400 },
    );
  }

  // Serve from cache
  const cached = cache.get(cveId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (process.env.NVD_API_KEY) {
      headers["apiKey"] = process.env.NVD_API_KEY;
    }

    const res = await fetch(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`,
      { headers, next: { revalidate: 86400 } },
    );

    if (!res.ok) {
      throw new Error(`NVD API returned ${res.status}`);
    }

    const raw = (await res.json()) as {
      totalResults: number;
      vulnerabilities: NVDVulnerability[];
    };

    if (!raw.totalResults || !raw.vulnerabilities?.[0]) {
      return NextResponse.json({ error: "CVE not found" }, { status: 404 });
    }

    const cve = raw.vulnerabilities[0].cve;

    // Extract CVSS score — prefer v3.1 → v3.0 → v2
    let score: number | null = null;
    let severity: CVEData["severity"] = null;
    let cvssVersion: string | null = null;

    if (cve.metrics?.cvssMetricV31?.[0]) {
      const m = cve.metrics.cvssMetricV31[0].cvssData;
      score = m.baseScore;
      severity = m.baseSeverity as CVEData["severity"];
      cvssVersion = "3.1";
    } else if (cve.metrics?.cvssMetricV30?.[0]) {
      const m = cve.metrics.cvssMetricV30[0].cvssData;
      score = m.baseScore;
      severity = m.baseSeverity as CVEData["severity"];
      cvssVersion = "3.0";
    } else if (cve.metrics?.cvssMetricV2?.[0]) {
      const m = cve.metrics.cvssMetricV2[0];
      score = m.cvssData.baseScore;
      severity = m.baseSeverity as CVEData["severity"];
      cvssVersion = "2.0";
    }

    // English description
    const description =
      cve.descriptions.find((d) => d.lang === "en")?.value ??
      "No description available.";

    const data: CVEData = {
      id: cveId,
      description:
        description.slice(0, 400) + (description.length > 400 ? "…" : ""),
      score,
      severity,
      published: cve.published,
      status: cve.vulnStatus,
      cvssVersion,
    };

    cache.set(cveId, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    console.error(`[api/cve/${cveId}]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
