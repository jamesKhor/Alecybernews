/**
 * Trigger revalidation of a path or tag on the running Next.js server.
 *
 * Used by the admin publish APIs to make newly-committed articles appear
 * on the live site in seconds, without waiting for a full VPS rebuild.
 *
 * The revalidation endpoint is on the SAME Next.js process that handled
 * the publish request, so we hit localhost. If NEXT_PUBLIC_SITE_URL is
 * set to an external URL, we use that — useful for admin panels hosted
 * separately from the public site (not our current setup, but cheap to
 * support).
 */

export interface RevalidateArgs {
  path?: string;
  tag?: string;
}

export async function triggerRevalidate(args: RevalidateArgs): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn(
      "[revalidate] REVALIDATE_SECRET not set — skipping revalidation call",
    );
    return;
  }

  // Default to localhost so this works even if the site URL points to a
  // CDN in front of the origin.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL("/api/revalidate", base);
  if (args.path) url.searchParams.set("path", args.path);
  if (args.tag) url.searchParams.set("tag", args.tag);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      // Short timeout — if the endpoint hangs we don't want to block publish
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[revalidate] ${url.pathname} returned ${res.status}`);
    }
  } catch (err) {
    // Revalidation failures are non-fatal — the next hourly cache TTL will
    // refresh the page, and a full VPS deploy would anyway.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[revalidate] request failed: ${message}`);
  }
}
