import { useTranslations } from "next-intl";
import { MessageCircle, Users } from "lucide-react";

interface Props {
  /** "compact" renders smaller for footer; "full" for article end / homepage */
  variant?: "compact" | "full";
  /** "en" | "zh" — which community links to show */
  locale?: string;
}

/**
 * Community call-to-action — invites readers to join Discord (EN/global)
 * or WeChat group (ZH). Only renders links that are actually configured
 * via env vars (NEXT_PUBLIC_DISCORD_INVITE_URL, NEXT_PUBLIC_WECHAT_QR_URL).
 *
 * If neither env var is set, this renders nothing (component returns null).
 * Safe to drop into Footer / article end before the community is live.
 */
export function CommunityCTA({ variant = "full", locale = "en" }: Props) {
  const t = useTranslations("community");
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  const wechatUrl = process.env.NEXT_PUBLIC_WECHAT_QR_URL;

  if (!discordUrl && !wechatUrl) {
    return null;
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap gap-3 text-sm">
        {discordUrl && (
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t("discord")}</span>
          </a>
        )}
        {wechatUrl && (
          <a
            href={wechatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Users className="h-4 w-4" />
            <span>{t("wechat")}</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 my-10">
      <h3 className="text-lg font-semibold mb-2">{t("title")}</h3>
      <p className="text-sm text-muted-foreground mb-4">{t("description")}</p>
      <div className="flex flex-wrap gap-3">
        {discordUrl && (
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] hover:bg-[#4752c4] text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t("joinDiscord")}</span>
          </a>
        )}
        {wechatUrl && locale === "zh" && (
          <a
            href={wechatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#07C160] hover:bg-[#06ad56] text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <Users className="h-4 w-4" />
            <span>{t("joinWeChat")}</span>
          </a>
        )}
      </div>
    </section>
  );
}
