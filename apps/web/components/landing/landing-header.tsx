import { ThemeToggle, Wordmark } from "@pemby/ui";
import { getTranslations } from "next-intl/server";
import styles from "./landing.module.css";

// Anchors and routes that do not exist yet stay as placeholders until their phases land.
const NAV = [
  { key: "howItWorks", href: "#how-it-works" },
  { key: "pricing", href: "/pricing" },
  { key: "about", href: "#about" },
  { key: "telegram", href: "https://t.me/pemby_jobs" },
] as const;

export async function LandingHeader() {
  const t = await getTranslations("Landing");
  return (
    <header className={styles.header}>
      <Wordmark name={t("brand")} className={styles.wordmark} />
      <nav aria-label={t("nav.label")} className={styles.nav}>
        <ul className={styles.navList}>
          {NAV.map((item) => (
            <li key={item.key}>
              <a className={styles.navLink} href={item.href}>
                {t(`nav.${item.key}`)}
              </a>
            </li>
          ))}
        </ul>
        <ThemeToggle label={t("themeToggle")} className={styles.toggle} />
      </nav>
    </header>
  );
}
