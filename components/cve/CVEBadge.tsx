"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ExternalLink, Shield, Loader2, AlertTriangle } from "lucide-react";
import type { CVEData } from "@/app/api/cve/[id]/route";

// ─── Severity colours ─────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<
  string,
  { badge: string; bar: string; score: string }
> = {
  CRITICAL: {
    badge: "bg-red-500/15 text-red-400 border-red-500/40",
    bar: "bg-red-500",
    score: "text-red-400",
  },
  HIGH: {
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/40",
    bar: "bg-orange-500",
    score: "text-orange-400",
  },
  MEDIUM: {
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    bar: "bg-yellow-500",
    score: "text-yellow-400",
  },
  LOW: {
    badge: "bg-green-500/15 text-green-400 border-green-500/40",
    bar: "bg-green-500",
    score: "text-green-400",
  },
  NONE: {
    badge: "bg-gray-500/15 text-gray-400 border-gray-500/40",
    bar: "bg-gray-500",
    score: "text-gray-400",
  },
};

const DEFAULT_STYLE = SEVERITY_STYLES.NONE;

// ─── CVEBadge ─────────────────────────────────────────────────────────────────

export function CVEBadge({ id }: { id: string }) {
  const [cve, setCve] = useState<CVEData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);

  const fetchedRef = useRef(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchCVE = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/cve/${id}`);
      if (!res.ok) throw new Error("not found");
      const data = (await res.json()) as CVEData;
      setCve(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Determine whether to show popover above or below based on screen position
  const updatePosition = useCallback(() => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setAbove(spaceAbove > 280 || spaceAbove > spaceBelow);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    fetchCVE();
    updatePosition();
    openTimerRef.current = setTimeout(() => setOpen(true), 250);
  }, [fetchCVE, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    // Delay close so user can move mouse to the popover
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handlePopoverLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const style = cve?.severity
    ? (SEVERITY_STYLES[cve.severity] ?? DEFAULT_STYLE)
    : DEFAULT_STYLE;

  return (
    <span className="relative inline-block" ref={badgeRef}>
      {/* The CVE badge itself */}
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center gap-1 cursor-help font-mono text-xs px-1.5 py-0.5 rounded border bg-orange-950/30 text-orange-400 border-orange-800/50 hover:border-orange-600/70 hover:bg-orange-950/50 transition-colors"
      >
        <Shield className="w-2.5 h-2.5 flex-shrink-0" />
        {id}
      </span>

      {/* Peek popover */}
      {open && (
        <div
          ref={popoverRef}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
          className={`absolute ${above ? "bottom-full mb-2" : "top-full mt-2"} left-0 z-[9999] w-80 rounded-lg border border-gray-700 bg-gray-900 shadow-2xl shadow-black/60 ring-1 ring-black/20 animate-in fade-in-0 zoom-in-95 duration-150`}
          style={{ minWidth: "320px" }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-800 rounded-t-lg bg-gray-900/80">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
              <span className="text-xs font-mono font-semibold text-white">
                {id}
              </span>
            </div>
            {cve?.severity && (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded border ${style.badge}`}
              >
                {cve.severity}
                {cve.score !== null && ` ${cve.score}`}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="p-3.5 space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Fetching from NVD…
              </div>
            )}

            {error && !loading && (
              <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500/60" />
                Could not load CVE details from NVD.
              </div>
            )}

            {cve && !loading && (
              <>
                {/* CVSS score bar */}
                {cve.score !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        CVSS {cve.cvssVersion}
                      </span>
                      <span className={`font-bold font-mono ${style.score}`}>
                        {cve.score} / 10
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${style.bar}`}
                        style={{ width: `${(cve.score / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Description */}
                <p className="text-xs text-gray-300 leading-relaxed">
                  {cve.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                  <div className="text-xs text-gray-600">
                    Published{" "}
                    {new Date(cve.published).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {cve.status && (
                      <span className="ml-2 text-gray-700">· {cve.status}</span>
                    )}
                  </div>
                  <a
                    href={`https://nvd.nist.gov/vuln/detail/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    NVD <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-2">
                <div className="h-2 bg-gray-800 rounded animate-pulse w-3/4" />
                <div className="h-2 bg-gray-800 rounded animate-pulse w-full" />
                <div className="h-2 bg-gray-800 rounded animate-pulse w-5/6" />
              </div>
            )}
          </div>

          {/* Arrow */}
          <div
            className={`absolute left-3 ${above ? "top-full" : "bottom-full"} ${above ? "-translate-y-px" : "translate-y-px"}`}
          >
            <div
              className={`w-2 h-2 border bg-gray-900 rotate-45 border-gray-700 ${above ? "border-t-0 border-l-0" : "border-b-0 border-r-0"}`}
            />
          </div>
        </div>
      )}
    </span>
  );
}

// ─── Inline code interceptor (used by MDX) ────────────────────────────────────

const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;

export function MDXCode({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"code">) {
  const text = typeof children === "string" ? children.trim() : "";

  // Code blocks (from fences) have a language className — leave them alone
  if (className) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // CVE inline code → badge
  if (text && CVE_PATTERN.test(text)) {
    return <CVEBadge id={text.toUpperCase()} />;
  }

  return <code {...props}>{children}</code>;
}
