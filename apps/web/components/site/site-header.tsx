import { ThemeToggle, Wordmark } from "@pemby/ui";
import { getTranslations } from "next-intl/server";
import styles from "./site-header.module.css";

// Section anchors are root-relative so the header works on every page, not only on `/`.
const NAV = [
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "pricing", href: "/pricing" },
  { key: "about", href: "/#about" },
  { key: "telegram", href: "https://t.me/pemby_jobs" },
] as const;

/** The shared top bar: wordmark, primary navigation and the theme toggle. */
export async function SiteHeader() {
  const t = await getTranslations("Site");
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
