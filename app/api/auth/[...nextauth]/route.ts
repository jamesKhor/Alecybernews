import { handlers } from "@/auth";
import { NextRequest } from "next/server";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const { GET } = handlers;

// Wrap POST with rate limiting to prevent brute-force attacks on login
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`auth:login:${ip}`, 5, 60_000); // 5 attempts per minute
  if (!rl.allowed) return rateLimitResponse(rl);

  return handlers.POST(req);
}
