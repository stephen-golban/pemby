import "@pemby/ui/tokens.css";
import "./globals.css";

import { themeInitScript } from "@pemby/ui";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Rethink_Sans, Source_Code_Pro } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/i18n/page-metadata";
import { Providers } from "./providers";

// Display grotesk: Rethink Sans, the owner's pick (2026-09-16) from a measured proof sheet against
// the approved comp's headline. Headline at 800; titles and controls at 600-700.
const grotesk = Rethink_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-grotesk-src",
  display: "swap",
});

// Monospace for every paragraph, criterion row, tag and label.
const mono = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-src",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo");
  const siteName = t("siteName");
  const title = t("pages.home.title");
  const description = t("pages.home.description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${siteName}` },
    description,
    applicationName: siteName,
    // The PWA the web-push channel needs (PLAN D8). Saving the site to the Home Screen is the only
    // way an iPhone can receive push at all (Safari 16.4+), so the manifest link is on every page,
    // not only on the one that offers to turn push on.
    manifest: "/manifest.webmanifest",
    openGraph: { title, description, siteName, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${grotesk.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a stored theme choice before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
