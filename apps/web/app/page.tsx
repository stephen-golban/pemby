import type { Metadata, ResolvingMetadata } from "next";
import { getTranslations } from "next-intl/server";
import { DropZoneSlot } from "@/components/cv-drop/drop-zone-slot";
import { About } from "@/components/landing/about";
import { Close } from "@/components/landing/close";
import { HeroFacts } from "@/components/landing/hero-facts";
import { HeroShowcase } from "@/components/landing/hero-showcase";
import { HonestSilence } from "@/components/landing/honest-silence";
import { HowItWorks } from "@/components/landing/how-it-works";
import styles from "@/components/landing/landing.module.css";
import { LongArrow } from "@/components/landing/marks";
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
      <div className={styles.crown}>
        <SiteHeader cta />
      </div>
      <main>
        <div className={styles.hero}>
          <section className={styles.heroInner} aria-labelledby="hero-title">
            {/* The bar's "Drop your CV" pill lands here: the hero column that carries the drop zone. */}
            <div id="drop-cv" className={styles.lead}>
              {/*
                The outlined pill with the long right arrow is set inline inside the headline,
                after its first line, exactly as the comp sets it. It is a real link to the
                mechanism, so it is keyboard operable, and its name comes from the message.
              */}
              <h1 id="hero-title" className={styles.headline}>
                {t.rich("headline", {
                  jump: (chunks) => (
                    <a className={styles.jump} href="#how-it-works">
                      <span className="visually-hidden">{chunks}</span>
                      <LongArrow className={styles.jumpArrow} />
                    </a>
                  ),
                })}
              </h1>
              <p className={styles.subline}>{t("subline")}</p>
              <DropZoneSlot className={styles.action} resume />
            </div>
            <HeroShowcase />
          </section>
        </div>
        <HeroFacts />
        <div className={styles.body}>
          <MatchBand />
          <HowItWorks />
          <Trust />
          <HonestSilence />
          <Passes />
          <About />
          <TelegramChannel />
          <Close />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
