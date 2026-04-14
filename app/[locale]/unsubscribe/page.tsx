"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UnsubscribePage() {
  const locale = useLocale();
  const t = useTranslations("newsletter");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "notFound" | "invalid" | "error"
  >("idle");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus("invalid");
      return;
    }

    startTransition(async () => {
      setStatus("loading");
      try {
        const res = await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });

        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setEmail("");
        } else if (data.error === "not_found") {
          setStatus("notFound");
        } else if (data.error === "invalid_email") {
          setStatus("invalid");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    });
  };

  const isZh = locale === "zh";
  const title = isZh ? "取消订阅" : "Unsubscribe";
  const description = isZh
    ? "输入您的邮箱以停止接收 ZCyberNews 摘要邮件。"
    : "Enter your email to stop receiving ZCyberNews digest emails.";
  const confirm = isZh ? "取消订阅" : "Unsubscribe";
  const successMsg = isZh
    ? "您已成功取消订阅。"
    : "You've been unsubscribed. We're sorry to see you go.";
  const notFoundMsg = isZh
    ? "此邮箱未在订阅列表中。"
    : "This email is not on our subscriber list.";
  const invalidMsg = t("invalid");
  const errorMsg = t("error");

  const message =
    status === "success"
      ? successMsg
      : status === "notFound"
        ? notFoundMsg
        : status === "invalid"
          ? invalidMsg
          : status === "error"
            ? errorMsg
            : null;

  const isError =
    status === "invalid" || status === "error" || status === "notFound";
  const isLoading = status === "loading" || isPending;

  return (
    <main className="container mx-auto px-4 py-16 md:py-24 max-w-lg">
      <section className="border border-border bg-card rounded-xl p-8 md:p-12 text-center">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 border border-primary/20 mb-4">
          <Mail className="size-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== "idle" && status !== "loading") setStatus("idle");
            }}
            placeholder="your@email.com"
            disabled={isLoading || status === "success"}
            aria-invalid={isError || undefined}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={isLoading || status === "success"}
            variant="destructive"
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {confirm}
          </Button>
        </form>
        {message && (
          <p
            className={`mt-4 text-sm flex items-center justify-center gap-1.5 ${
              status === "success"
                ? "text-green-500"
                : isError
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {status === "success" ? (
              <CheckCircle2 className="size-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="size-4 flex-shrink-0" />
            )}
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
