import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowMark, AuthShell, BlockedMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";

/**
 * The screen a refused product page is rewritten to (`/access-denied`, served 403) and the one
 * `forbidden()` renders. Same frame as the other signed-out screens: a statement at poster scale
 * and one white card with the single way forward. Red is the blocker colour and this is the one
 * signed-out screen that is a blocker.
 *
 * No client JavaScript: everything here is a sentence and a link.
 */
export async function ForbiddenMessage() {
  const t = await getTranslations("Forbidden");
  return (
    <AuthShell
      accent="red"
      mark={<BlockedMark className={styles.tileMark} />}
      headline={t("heading")}
      lead={t("body")}
    >
      <h2 className={styles.cardTitle}>{t("cardTitle")}</h2>
      <p className={styles.cardBody}>{t("cardBody")}</p>
      <Link className={styles.primary} href="/sign-in">
        {t("signIn")}
        <ArrowMark className={styles.arrow} />
      </Link>
      <p className={styles.footRow}>
        <Link className={styles.quiet} href="/">
          {t("home")}
        </Link>
      </p>
    </AuthShell>
  );
}
