import { getTranslations } from "next-intl/server";
import { DropZone } from "@/components/landing/drop-zone";
import { LandingHeader } from "@/components/landing/landing-header";
import styles from "@/components/landing/landing.module.css";
import { MatchBand } from "@/components/landing/match-band";

export default async function HomePage() {
  const t = await getTranslations("Landing");
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.headline}>
            {t("headline")}
          </h1>
          <p className={styles.subline}>{t("subline")}</p>
          <DropZone className={styles.action} />
        </section>
        <MatchBand />
      </main>
    </div>
  );
}
