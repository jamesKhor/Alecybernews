import { Resend } from "resend";

export type Locale = "en" | "zh";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export function getAudienceId(locale: Locale): string | null {
  return locale === "zh"
    ? (process.env.RESEND_AUDIENCE_ID_ZH ?? null)
    : (process.env.RESEND_AUDIENCE_ID_EN ?? null);
}

export function isResendConfigured(): boolean {
  return !!apiKey;
}

export const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "ZCyberNews <news@zcybernews.com>";

export const EMAIL_REPLY_TO =
  process.env.RESEND_REPLY_TO ?? "news@zcybernews.com";
