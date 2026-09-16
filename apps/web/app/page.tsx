import type { Metadata, ResolvingMetadata } from "next";
import { getTranslations } from "next-intl/server";
import { About } from "@/components/landing/about";
import { Close } from "@/components/landing/close";
import { DropZone } from "@/components/landing/drop-zone";
import { HonestSilence } from "@/components/landing/honest-silence";
import { HowItWorks } from "@/components/landing/how-it-works";
import styles from "@/components/landing/landing.module.css";
import { MatchBand } from "@/components/landing/match-band";
import { Passes } from "@/components/landing/passes";
import { TelegramChannel } from "@/components/landing/telegram-channel";
import { Trust } from "@/components/landing/trust";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { pageMetadata } from "@/i18n/page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return pageMetadata("home", parent);
}

export default async function HomePage() {
  const t = await getTranslations("Landing");
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.headline}>
            {t("headline")}
          </h1>
          <p className={styles.subline}>{t("subline")}</p>
          <DropZone className={styles.action} />
        </section>
        <MatchBand />
        <HowItWorks />
        <Trust />
        <HonestSilence />
        <Passes />
        <About />
        <TelegramChannel />
        <Close />
      </main>
      <SiteFooter />
    </div>
  );
}
