import { ThemeToggle, Wordmark } from "@pemby/ui";
import { getTranslations } from "next-intl/server";
import styles from "./site-header.module.css";
import { SiteNav } from "./site-nav";

/** One destination in the top bar. `current` is the open one, drawn in full-strength heavy ink. */
export type HeaderNavItem = { href: string; label: string; current?: boolean };

/**
 * Where the marketing bar's pill sends the reader: the landing hero, whose left column carries the
 * drop zone. Root-relative so it works from `/pricing` and the legal pages too.
 */
const CTA_HREF = "/#drop-cv";

// Section anchors are root-relative so the header works on every page, not only on `/`.
const NAV = [
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "pricing", href: "/pricing" },
  { key: "about", href: "/#about" },
] as const;

/**
 * The shared top bar: the wordmark at the left, the destinations centred, and the actions at the
 * right — the page's primary action as a solid black pill where there is one, then the small
 * solid-black circular theme button.
 *
 * Signed-in screens pass their own `nav` — the product's four destinations, with the open one
 * marked — because the marketing links are not what someone reading their Brief is navigating
 * between. Without it the bar keeps the marketing destinations.
 *
 * `cta` draws the comp's black "Drop your CV" pill beside the theme toggle. It is opt-in rather than
 * automatic so the product screens cannot pick it up by accident: a reader who is signed in has
 * already dropped a CV. Where it is on, the pill stays in the bar at every width, including below
 * 860 where the destinations collapse behind the disclosure, because it is the one thing the
 * marketing page is asking for.
 */
export async function SiteHeader({
  nav,
  cta = false,
}: { nav?: readonly HeaderNavItem[]; cta?: boolean } = {}) {
  const t = await getTranslations("Site");
  const items =
    nav ?? NAV.map((item) => ({ href: item.href, label: t(`nav.${item.key}`), current: false }));
  return (
    <header className={styles.header}>
      <Wordmark name={t("brand")} className={styles.wordmark} />
      <SiteNav label={t("nav.label")} menuLabel={t("nav.menu")} items={items} />
      <div className={styles.actions}>
        {cta ? (
          <a className={styles.cta} href={CTA_HREF}>
            {t("nav.cta")}
          </a>
        ) : null}
        <ThemeToggle label={t("themeToggle")} className={styles.toggle} />
      </div>
    </header>
  );
}
