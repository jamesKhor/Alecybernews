import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware({
  ...routing,
  // next-intl reads Accept-Language header for locale detection automatically
});

export default function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const pathname = request.nextUrl.pathname;

  // WeChat browser detection — MicroMessenger is the WeCom/WeChat UA identifier
  const isWechat =
    userAgent.includes("MicroMessenger") || userAgent.includes("WeChat");

  // If WeChat browser hits the root or an /en path with no explicit locale
  // override, redirect to /zh
  if (isWechat && (pathname === "/" || pathname.startsWith("/en"))) {
    const zhUrl = request.nextUrl.clone();
    zhUrl.pathname = pathname === "/" ? "/zh" : pathname.replace(/^\/en/, "/zh");
    return NextResponse.redirect(zhUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - /api routes
    // - /_next (Next.js internals)
    // - files with extensions (images, etc.)
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
