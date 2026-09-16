import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { EFFECTIVE_DATE } from "@/content/legal/meta";
import type { LegalDocument } from "@/content/legal/meta";
import styles from "./legal.module.css";
import { loadLegalDocument } from "./markdown";
import { rehypeLegal } from "./rehype-legal";

function LinkIcon() {
  return (
    <svg
      className={styles.anchorIcon}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.75 9.25a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.25l-.7.71M9.25 6.75a3 3 0 0 0-4.24 0L2.89 8.87a3 3 0 1 0 4.24 4.25l.7-.71"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export async function LegalPage({ doc }: { doc: LegalDocument }) {
  const locale = await getLocale();
  const t = await getTranslations("Legal");
  const { title, body, toc } = await loadLegalDocument(locale, doc);
  const anchorLabel = t("anchor");

  const components: Options["components"] = {
    h2({ id, children }: ComponentPropsWithoutRef<"h2">) {
      return (
        <h2 id={id} className={styles.h2}>
          {children}
          <a className={styles.anchor} href={`#${id}`}>
            <LinkIcon />
            <span className="visually-hidden">{anchorLabel}</span>
          </a>
        </h2>
      );
    },
    table({ children }: ComponentPropsWithoutRef<"table">) {
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>{children}</table>
        </div>
      );
    },
  };

  const tocList = (
    <ol className={styles.tocList}>
      {toc.map((entry) => (
        <li key={entry.id}>
          <a className={styles.tocLink} href={`#${entry.id}`}>
            {entry.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main" className={styles.main}>
        <header className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.effective}>{t("effective", { date: EFFECTIVE_DATE })}</p>
        </header>

        <div className={styles.layout}>
          <nav className={styles.tocSide} aria-label={t("toc")}>
            <p className={styles.tocTitle} aria-hidden="true">
              {t("toc")}
            </p>
            {tocList}
          </nav>

          <details className={styles.tocInline}>
            <summary className={styles.tocSummary}>{t("toc")}</summary>
            <nav aria-label={t("toc")}>{tocList}</nav>
          </details>

          <article className={styles.prose}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeLegal] as Options["rehypePlugins"]}
              components={components}
              skipHtml
            >
              {body}
            </Markdown>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
