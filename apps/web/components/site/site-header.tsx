import { ThemeToggle, Wordmark } from "@pemby/ui";
import { getTranslations } from "next-intl/server";
import styles from "./site-header.module.css";
import { SiteNav } from "./site-nav";

// Section anchors are root-relative so the header works on every page, not only on `/`.
const NAV = [
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "pricing", href: "/pricing" },
  { key: "about", href: "/#about" },
] as const;

/** The shared top bar: wordmark, primary navigation and the theme toggle. */
export async function SiteHeader() {
  const t = await getTranslations("Site");
  return (
    <header className={styles.header}>
      <Wordmark name={t("brand")} className={styles.wordmark} />
      <div className={styles.actions}>
        <SiteNav
          label={t("nav.label")}
          menuLabel={t("nav.menu")}
          items={NAV.map((item) => ({ href: item.href, label: t(`nav.${item.key}`) }))}
        />
        <ThemeToggle label={t("themeToggle")} className={styles.toggle} />
      </div>
    </header>
  );
}
