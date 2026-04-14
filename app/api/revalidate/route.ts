import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Secret-guarded revalidation endpoint.
 *
 * Called by:
 *   - Admin publish APIs (after a commit lands) — path + locale-specific
 *   - deploy-vps.yml content-path workflow (after git pull) — tag-based broad
 *
 * Secret must be supplied either as `x-revalidate-secret` header OR as a
 * `?secret=` query param (for convenience in curl commands from workflows).
 *
 * Usage:
 *   POST /api/revalidate?path=/en/articles/some-slug
 *   POST /api/revalidate?tag=articles
 *   POST /api/revalidate?path=/en/articles&tag=articles   (both)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const headerSecret = req.headers.get("x-revalidate-secret");
  const querySecret = url.searchParams.get("secret");
  const supplied = headerSecret ?? querySecret;

  if (supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = url.searchParams.get("path");
  const tag = url.searchParams.get("tag");

  if (!path && !tag) {
    return NextResponse.json(
      { error: "Provide ?path= and/or ?tag= query param" },
      { status: 400 },
    );
  }

  const revalidated: { paths: string[]; tags: string[] } = {
    paths: [],
    tags: [],
  };

  if (path) {
    // Revalidate the page AND any layouts that wrap it so listing pages update too
    revalidatePath(path);
    revalidated.paths.push(path);
  }
  if (tag) {
    // Next.js 16 requires the second arg. 'max' = stale-while-revalidate
    // (serve stale HTML while regenerating in background) — ideal for a
    // content site where "near-instant" is good enough and availability wins.
    revalidateTag(tag, "max");
    revalidated.tags.push(tag);
  }

  return NextResponse.json({
    revalidated,
    now: new Date().toISOString(),
  });
}

// GET returns a quick health-check so workflows can verify the endpoint
// is reachable without actually invalidating anything.
export async function GET(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  const supplied = new URL(req.url).searchParams.get("secret");
  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, configured: true });
}
