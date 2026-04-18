import { ImageResponse } from "next/og";

// iOS home-screen icon — 180×180 PNG. Next.js auto-injects the
// <link rel="apple-touch-icon"> tag pointing at this route.
//
// Separate from icon.tsx (32×32 favicon) because iOS renders the home-
// screen icon much larger. Same serif "Z" mark, scaled for the larger
// canvas and with more generous letter scale.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        fontSize: 140,
        fontWeight: 700,
        fontFamily: "Georgia, 'Times New Roman', serif",
        letterSpacing: -4,
      }}
    >
      Z
    </div>,
    { ...size },
  );
}
