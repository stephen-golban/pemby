import { ImageResponse } from "next/og";
import { groteskFont } from "./_og/brand-fonts";
import { seoT } from "./_og/seo-translator";

// Full-bleed square: iOS applies its own corner mask.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
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
        fontFamily: "Rethink Sans",
        fontWeight: 800,
        fontSize: 132,
        lineHeight: 1,
        paddingLeft: 6,
        paddingBottom: 6,
      }}
    >
      {seoT("image.iconLetter")}
    </div>,
    { ...size, fonts: [await groteskFont()] },
  );
}
