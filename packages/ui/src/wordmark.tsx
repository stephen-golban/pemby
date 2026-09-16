import type { ComponentPropsWithoutRef } from "react";
import styles from "./wordmark.module.css";

type WordmarkProps = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  /** The brand name, from the i18n layer. */
  name: string;
};

/** Pemby's lockup: the wordmark alone, set in the display face (owner decision 2026-09-16). */
export function Wordmark({ name, className, href = "/", ...rest }: WordmarkProps) {
  return (
    <a
      href={href}
      className={className ? `${styles.wordmark} ${className}` : styles.wordmark}
      {...rest}
    >
      {name}
    </a>
  );
}
