import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <Header locale={locale} />
      {/* flex-1 stretches this wrapper between Header and Footer (body
          is flex-col). `min-w-0` prevents min-content intrinsic sizing
          from making main wider than viewport — the ROOT cause of the
          2026-04-18 SEV2 mobile overflow where main was 788px on a
          375px viewport. Removed `flex flex-col` because main should
          use normal block layout, not a flex container. */}
      <div className="flex-1 min-w-0">{children}</div>
      <Footer locale={locale} />
    </NextIntlClientProvider>
  );
}
