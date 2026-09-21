"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import styles from "./channels.module.css";

/**
 * One channel, as a row inside the channels card.
 *
 * Laid out like a match card on `/brief`, because it is the same object at a smaller scale: a solid
 * accent rounded square at the far left carrying the channel's own mark, then the channel's name in
 * heavy ink with what it reads right now beneath it and one quiet line explaining what it is for,
 * then the act at the right end. Hairlines separate the rows; there is no box around any of them,
 * because the card is the box.
 */
export function ChannelRow({
  id,
  accent,
  mark,
  label,
  state,
  help,
  note,
  dead,
  action,
  full,
}: {
  /** Put on the name so the row's switch can point at it instead of repeating the word. */
  id: string;
  accent: "blue" | "green" | "yellow" | "red" | "ink";
  /** The white line mark drawn inside the tile. Decorative: the name says the same thing. */
  mark: ReactNode;
  label: string;
  /** What the row reads: "Connected", "Off in this browser", the mailbox it writes to. */
  state: ReactNode;
  /** One quiet line under the state, always shown: this is a page of decisions, not a form. */
  help?: ReactNode;
  /** Something that went wrong on its own, or a limit of this device. Stands out from `help`. */
  note?: ReactNode;
  /** True when the note reports a channel the system broke off, which is drawn in the blocker tint. */
  dead?: boolean;
  action?: ReactNode;
  /**
   * Rendered under the three columns, across all of them. For the one thing a settings row
   * sometimes has to show that does not fit beside a label: the Telegram deep link, which is a
   * 78-character URL people select and copy.
   */
  full?: ReactNode;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.tile} data-accent={accent}>
        {mark}
      </span>
      <h3 id={id} className={styles.name}>
        {label}
      </h3>
      <div className={styles.body}>
        <p className={styles.state}>{state}</p>
        {help ? <p className={styles.help}>{help}</p> : null}
        {note ? (
          <p className={styles.note} data-dead={dead || undefined}>
            {note}
          </p>
        ) : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
      {full ? <div className={styles.full}>{full}</div> : null}
    </li>
  );
}

/**
 * The on/off control, as `/brief`'s `ShownSettings` draws it: an outline pill that is a real
 * `switch`, reading its own state in words and filling with solid ink when it is on. A pill that
 * said only "On" would leave a screen reader and a colour-blind reader guessing whether that is the
 * state or the action.
 */
export function Switch({
  on,
  labelledBy,
  busy,
  onChange,
}: {
  on: boolean;
  labelledBy?: string;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("Settings");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      className={styles.switch}
      disabled={busy}
      onClick={() => onChange(!on)}
    >
      {on ? t("on") : t("off")}
    </button>
  );
}
