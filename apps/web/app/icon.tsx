import { ImageResponse } from "next/og";
import { groteskFont } from "./_og/brand-fonts";
import { seoT } from "./_og/seo-translator";

// The wordmark's "P" in Rethink Sans 800, off-white on the olive field. Drawn at 32px so it stays
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
        background: "#2b3323",
        color: "#f7f1e6",
        borderRadius: 7,
        fontFamily: "Rethink Sans",
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
