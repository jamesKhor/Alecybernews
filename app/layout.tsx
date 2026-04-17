import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Noto Sans SC — consistent Heiti rendering across ALL platforms.
// Without this, Windows users see Microsoft YaHei (acceptable) or
// worse, SimSun fallback (Songti serif, which 小鹿Lawrence specifically
// flagged as bad for small-screen readability in the Pixel Street
// episode). iOS users see PingFang SC. The result: brand inconsistency
// between XHS readers and direct visitors.
//
// With this webfont loaded:
//   - All platforms render CJK in Noto Sans SC first
//   - Fallback chain only triggers if the webfont fails to load
//   - Google Fonts auto-subsets based on characters actually used
//     (via unicode-range) so the bundle cost stays bounded
//
// Weights chosen to match our design system (400 body, 600 semibold
// labels, 700 headlines, 900 display hero). display:swap avoids FOIT.
const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  subsets: ["latin"], // actual CJK glyphs come via unicode-range subsetting
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "ZCyberNews",
    template: "%s | ZCyberNews",
  },
  description:
    "Professional cybersecurity and tech intelligence — threat analysis, vulnerability research, and security news for defenders.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://zcybernews.com",
  ),
  keywords: [
    "cybersecurity",
    "threat intelligence",
    "malware analysis",
    "vulnerability research",
    "security news",
    "CVE",
    "ransomware",
    "APT",
  ],
  authors: [{ name: "ZCyberNews" }],
  creator: "ZCyberNews",
  openGraph: {
    type: "website",
    siteName: "ZCyberNews",
    title: "ZCyberNews",
    description:
      "Professional cybersecurity and tech intelligence — threat analysis, vulnerability research, and security news for defenders.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "ZCyberNews — Cybersecurity & Tech Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZCyberNews",
    description:
      "Professional cybersecurity and tech intelligence — threat analysis, vulnerability research, and security news for defenders.",
    images: ["/og-default.png"],
  },
  alternates: {
    types: {
      "application/rss+xml": "/api/feed",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}>) {
  const { locale } = await params;
  const lang = locale === "zh" ? "zh-Hans" : "en";

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <head>
        {/* Google AdSense — must be in <head> for site verification */}
        <script
          async
          crossOrigin="anonymous"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6168266894987797"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          {children}
          <Toaster
            richColors
            position="top-right"
            closeButton
            duration={5000}
          />
          {/* Plausible Analytics — privacy-friendly, no cookies */}
          {process.env.NEXT_PUBLIC_PLAUSIBLE_SRC && (
            <>
              <Script
                async
                src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC}
                strategy="afterInteractive"
              />
              <Script id="plausible-init" strategy="afterInteractive">
                {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
              </Script>
            </>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
