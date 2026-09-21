import { ImageResponse } from "next/og";
import { groteskBodyFont, groteskFont } from "./_og/brand-fonts";
import { seoT } from "./_og/seo-translator";

// Colours from packages/ui/src/tokens.css (Satori cannot read CSS custom properties): the white
// sheet, the ink on it, and the near-black band it stands on.
const GROUND = "#ffffff";
const INK = "#101010";
const BAND = "#0b0b0b";
const ON_BAND = "#ffffff";

export const alt = seoT("image.alt");
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fonts = await Promise.all([groteskFont(), groteskBodyFont()]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: GROUND,
        color: INK,
        fontFamily: "Hanken Grotesk",
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "52px 72px 0",
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: -1.3,
        }}
      >
        {seoT("siteName")}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 90px 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            textAlign: "center",
            fontSize: 124,
            fontWeight: 800,
            lineHeight: 0.86,
            letterSpacing: -4.2,
            maxWidth: 900,
          }}
        >
          {seoT("image.headline")}
        </div>
      </div>

      {/* The near-black band from the landing page, rounded at its top corners. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 132,
          padding: "0 72px",
          background: BAND,
          color: ON_BAND,
          borderTopLeftRadius: 64,
          borderTopRightRadius: 64,
          fontWeight: 500,
          fontSize: 26,
          letterSpacing: -0.2,
        }}
      >
        <div style={{ display: "flex" }}>{seoT("image.line")}</div>
        <div style={{ display: "flex" }}>{seoT("image.domain")}</div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
