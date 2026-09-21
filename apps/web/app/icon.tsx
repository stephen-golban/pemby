import { ImageResponse } from "next/og";
import { groteskFont } from "./_og/brand-fonts";
import { seoT } from "./_og/seo-translator";

// The wordmark's "P" in Hanken Grotesk 800, white on the near-black band. Drawn at 32px so it stays
// legible when a browser tab scales it to 16px.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0b",
        color: "#ffffff",
        borderRadius: 7,
        fontFamily: "Hanken Grotesk",
        fontWeight: 800,
        fontSize: 28,
        lineHeight: 1,
        paddingLeft: 1,
        paddingBottom: 1,
      }}
    >
      {seoT("image.iconLetter")}
    </div>,
    { ...size, fonts: [await groteskFont()] },
  );
}
