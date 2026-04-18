import { ImageResponse } from "next/og";

// Next.js App Router convention — this file generates the site favicon.
// ImageResponse (via next/og) renders a PNG at build/request time, so the
// serif "Z" looks identical across every browser and OS (no reliance on
// local font fallbacks that would vary between Windows/macOS/Linux).

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#fff",
        fontSize: 26,
        fontWeight: 700,
        // serif stack — ImageResponse doesn't bundle Source Serif 4, but
        // Georgia is available on every system font source and has the
        // bracketed-serif feel we want for the editorial brand mark.
        fontFamily: "Georgia, 'Times New Roman', serif",
        letterSpacing: -1,
      }}
    >
      Z
    </div>,
    { ...size },
  );
}
