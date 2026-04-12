"use client";

import { useEffect, useRef } from "react";

interface AdSenseProps {
  /** Ad slot ID from AdSense dashboard (e.g. "1234567890") */
  slot: string;
  /** Ad format — "auto" for responsive, "rectangle" for 300x250, "horizontal" for banner */
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  /** Full-width responsive — set to true for in-feed/in-article ads */
  fullWidth?: boolean;
  className?: string;
}

const publisherId = process.env.NEXT_PUBLIC_ADSENSE_ID;

/**
 * Google AdSense ad unit.
 *
 * Required env vars:
 *   NEXT_PUBLIC_ADSENSE_ID  — your publisher ID (ca-pub-XXXXXXXXXXXXXXXX)
 *
 * Each placement needs a `slot` prop from your AdSense dashboard.
 */
export function AdSense({
  slot,
  format = "auto",
  fullWidth = false,
  className,
}: AdSenseProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!publisherId || pushed.current) return;

    try {
      const adsbygoogle = (window as unknown as { adsbygoogle: unknown[] })
        .adsbygoogle;
      if (adsbygoogle) {
        adsbygoogle.push({});
        pushed.current = true;
      }
    } catch {
      // AdSense script not loaded yet or blocked by ad blocker
    }
  }, []);

  if (!publisherId) return null;

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisherId}
        data-ad-slot={slot}
        data-ad-format={format === "rectangle" ? "auto" : format}
        {...(fullWidth && { "data-full-width-responsive": "true" })}
      />
    </div>
  );
}

/**
 * Sidebar ad — 300x250 or responsive rectangle
 */
export function SidebarAd({ className }: { className?: string }) {
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR;
  if (!slot) return null;
  return <AdSense slot={slot} format="rectangle" className={className} />;
}

/**
 * In-article ad — responsive horizontal banner placed mid-content
 */
export function InArticleAd({ className }: { className?: string }) {
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE;
  if (!slot) return null;
  return (
    <AdSense slot={slot} format="horizontal" fullWidth className={className} />
  );
}

/**
 * In-feed ad — blends into article listing grids
 */
export function InFeedAd({ className }: { className?: string }) {
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED;
  if (!slot) return null;
  return <AdSense slot={slot} format="auto" fullWidth className={className} />;
}
