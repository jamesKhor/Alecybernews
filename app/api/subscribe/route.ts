import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  resend,
  getAudienceId,
  isResendConfigured,
  type Locale,
} from "@/lib/resend";

const SUBSCRIBERS_FILE = path.join(process.cwd(), "data", "subscribers.json");

interface Subscriber {
  email: string;
  subscribedAt: string;
  locale: string;
  resendContactId?: string;
}

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimitMap.set(ip, recent);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

function readSubscribers(): Subscriber[] {
  try {
    const raw = fs.readFileSync(SUBSCRIBERS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeSubscribers(subscribers: Subscriber[]): void {
  fs.mkdirSync(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
  fs.writeFileSync(
    SUBSCRIBERS_FILE,
    JSON.stringify(subscribers, null, 2) + "\n",
    "utf-8",
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: "Too many requests. Please try again later.",
        },
        { status: 429 },
      );
    }

    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const locale: Locale = body.locale === "zh" ? "zh" : "en";

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        {
          error: "invalid_email",
          message: "Please enter a valid email address.",
        },
        { status: 400 },
      );
    }

    const subscribers = readSubscribers();
    const exists = subscribers.some((s) => s.email === email);

    if (exists) {
      return NextResponse.json(
        {
          error: "already_subscribed",
          message: "This email is already subscribed.",
        },
        { status: 409 },
      );
    }

    let resendContactId: string | undefined;

    if (isResendConfigured() && resend) {
      const audienceId = getAudienceId(locale);
      if (audienceId) {
        try {
          const created = await resend.contacts.create({
            email,
            audienceId,
            unsubscribed: false,
          });
          resendContactId = created.data?.id;
        } catch (err) {
          console.error("[subscribe] Resend contact create failed:", err);
        }
      } else {
        console.warn(
          `[subscribe] No RESEND_AUDIENCE_ID_${locale.toUpperCase()} configured`,
        );
      }
    }

    subscribers.push({
      email,
      subscribedAt: new Date().toISOString(),
      locale,
      resendContactId,
    });

    writeSubscribers(subscribers);

    return NextResponse.json(
      { success: true, message: "Successfully subscribed!" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[subscribe] Error:", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        {
          error: "invalid_email",
          message: "Please enter a valid email address.",
        },
        { status: 400 },
      );
    }

    const subscribers = readSubscribers();
    const idx = subscribers.findIndex((s) => s.email === email);

    if (idx === -1) {
      return NextResponse.json(
        { error: "not_found", message: "This email is not subscribed." },
        { status: 404 },
      );
    }

    const sub = subscribers[idx];

    if (isResendConfigured() && resend && sub.resendContactId) {
      const locale: Locale = sub.locale === "zh" ? "zh" : "en";
      const audienceId = getAudienceId(locale);
      if (audienceId) {
        try {
          await resend.contacts.remove({
            id: sub.resendContactId,
            audienceId,
          });
        } catch (err) {
          console.error("[unsubscribe] Resend contact remove failed:", err);
        }
      }
    }

    subscribers.splice(idx, 1);
    writeSubscribers(subscribers);

    return NextResponse.json(
      { success: true, message: "Successfully unsubscribed." },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error: "server_error",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}
