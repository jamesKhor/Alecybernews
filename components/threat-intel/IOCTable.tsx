"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { IOCEntry } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  ip: "IP",
  domain: "Domain",
  hash_md5: "MD5",
  hash_sha1: "SHA1",
  hash_sha256: "SHA256",
  url: "URL",
  email: "Email",
  registry_key: "Registry",
  file_path: "File Path",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-red-600 dark:text-red-400",
};

interface Props {
  iocs: IOCEntry[];
}

export function IOCTable({ iocs }: Props) {
  const t = useTranslations("article");
  const [filter, setFilter] = useState<string>("all");
  const [sortCol, setSortCol] = useState<"type" | "value" | "confidence">(
    "type",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [copied, setCopied] = useState<string | null>(null);

  const types = useMemo(() => {
    const s = new Set(iocs.map((i) => i.type));
    return ["all", ...Array.from(s)];
  }, [iocs]);

  const filtered = useMemo(() => {
    const base =
      filter === "all" ? iocs : iocs.filter((i) => i.type === filter);
    return [...base].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [iocs, filter, sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  }

  function sanitizeCsvCell(val: string): string {
    // Prevent CSV injection: prefix formula-triggering characters with a single quote
    if (/^[=+\-@\t\r]/.test(val)) return `'${val}`;
    return val;
  }

  function exportCSV() {
    const header = "type,value,description,confidence,first_seen";
    const rows = filtered.map(
      (i) =>
        `${sanitizeCsvCell(i.type)},"${sanitizeCsvCell(i.value)}","${sanitizeCsvCell(i.description ?? "")}",${sanitizeCsvCell(i.confidence ?? "")},${sanitizeCsvCell(i.first_seen ?? "")}`,
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "iocs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/30">
        <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">
          Indicators of Compromise ({iocs.length})
        </h3>
        <div className="flex items-center gap-2">
          {/* Type filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-border bg-background text-sm px-2 py-1 text-foreground"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All Types" : (TYPE_LABELS[t] ?? t)}
              </option>
            ))}
          </select>
          {/* CSV Export */}
          <button
            onClick={exportCSV}
            className="rounded border border-border px-3 py-1 text-xs hover:bg-secondary transition-colors"
          >
            {t("exportCsv")}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                className="px-4 py-2 text-left text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort("type")}
              >
                Type {sortCol === "type" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                className="px-4 py-2 text-left text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort("value")}
              >
                Value{" "}
                {sortCol === "value" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                Description
              </th>
              <th
                className="px-4 py-2 text-left text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort("confidence")}
              >
                Conf{" "}
                {sortCol === "confidence"
                  ? sortDir === "asc"
                    ? "↑"
                    : "↓"
                  : ""}
              </th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((ioc, i) => (
              <tr
                key={`${ioc.type}-${ioc.value}-${i}`}
                className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
              >
                <td className="px-4 py-2">
                  <span className="font-mono text-xs rounded bg-secondary px-1.5 py-0.5 text-primary">
                    {TYPE_LABELS[ioc.type] ?? ioc.type}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs break-all max-w-xs">
                  {ioc.value}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {ioc.description ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {ioc.confidence ? (
                    <span
                      className={`text-xs font-medium ${
                        CONFIDENCE_COLORS[ioc.confidence]
                      }`}
                    >
                      {ioc.confidence}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => copyValue(ioc.value)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {copied === ioc.value ? t("copied") : t("copyIoc")}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-muted-foreground text-sm"
                >
                  No IOCs match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
