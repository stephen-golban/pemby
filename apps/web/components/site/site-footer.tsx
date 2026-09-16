import { Wordmark } from "@pemby/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import styles from "./site-footer.module.css";

const TELEGRAM_URL = "https://t.me/pemby_jobs";
const GITHUB_URL = "https://github.com/stephen-golban/pemby";
const EMAIL = "hello@pemby.app";

/**
 * The shared footer: the deep field that closes every page, with site links, the operator line
 * and the copyright year. The operator's street address never appears here.
 */
export async function SiteFooter() {
  const t = await getTranslations("Site");
  const year = new Date().getFullYear();

  const groups = [
    {
      key: "product",
      heading: t("footer.productHeading"),
      links: [
        { label: t("footer.howItWorks"), href: "/#how-it-works" },
        { label: t("footer.pricing"), href: "/pricing", internal: true },
        { label: t("footer.telegram"), href: TELEGRAM_URL, external: true },
      ],
    },
    {
      key: "legal",
      heading: t("footer.legalHeading"),
      links: [
        { label: t("footer.terms"), href: "/terms", internal: true },
        { label: t("footer.privacy"), href: "/privacy", internal: true },
        { label: t("footer.refunds"), href: "/refunds", internal: true },
      ],
    },
    {
      key: "contact",
      heading: t("footer.contactHeading"),
      links: [
        { label: t("footer.email"), href: `mailto:${EMAIL}` },
        { label: t("footer.github"), href: GITHUB_URL, external: true },
      ],
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Wordmark name={t("brand")} className={styles.wordmark} />
          <p className={styles.tagline}>{t("footer.tagline")}</p>
        </div>
        <nav aria-label={t("footer.label")} className={styles.groups}>
          {groups.map((group) => (
            <div key={group.key} className={styles.group}>
              <h2 className={styles.groupHeading}>{group.heading}</h2>
              <ul className={styles.links}>
                {group.links.map((link) => (
                  <li key={link.href}>
                    {"internal" in link && link.internal ? (
                      <Link className={styles.link} href={link.href}>
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        className={styles.link}
                        href={link.href}
                        {...("external" in link && link.external
                          ? { rel: "noopener noreferrer", target: "_blank" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.legal}>
          <p>{t("footer.operator")}</p>
          <p>{t("footer.copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
