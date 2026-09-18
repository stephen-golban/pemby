"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import fields from "@/app/profile/_shared/fields.module.css";
import styles from "./channels.module.css";

/**
 * One line of the channels ledger.
 *
 * The same row grammar as `/profile` and `/onboarding`, from the same stylesheet rather than a copy
 * of it: an uppercase mono label in a fixed column, the state beside it, the action last, hairline
 * rules between rows and no box around anything. The difference is what the third column holds — a
 * switch, or a connect action — rather than an editor pill, so this is its own component and not a
 * `FieldRow` bent into shape.
 */
export function ChannelRow({
  id,
  label,
  state,
  help,
  note,
  action,
  full,
}: {
  /** Put on the label cell so the row's switch can point at it instead of repeating the word. */
  id: string;
  label: string;
  /** What the row reads: "Connected", "Off", the mailbox it writes to. */
  state: ReactNode;
  /** One quiet line under the state, always shown: this is a page of decisions, not a form. */
  help?: ReactNode;
  /** Something that went wrong on its own, or a limit of this device. Stands out from `help`. */
  note?: ReactNode;
  action?: ReactNode;
  /**
   * Rendered under the three columns, across all of them. For the one thing a settings row
   * sometimes has to show that does not fit beside a label: the Telegram deep link, which is a
   * 78-character URL people select and copy.
   */
  full?: ReactNode;
}) {
  return (
    <div className={fields.row}>
      <dt id={id} className={fields.label}>
        {label}
      </dt>
      <dd className={fields.value}>
        <p className={styles.state}>{state}</p>
        {help ? <p className={fields.help}>{help}</p> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
      </dd>
      <dd className={fields.action}>{action}</dd>
      {full ? <dd className={styles.full}>{full}</dd> : null}
    </div>
  );
}

/**
 * The on/off control, as the Brief's `ShownSettings` draws it: an outline pill that is a real
 * `switch`, reading its own state in words. A pill that said only "On" would leave a screen reader
 * and a colour-blind reader guessing whether that is the state or the action.
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
      className={fields.pill}
      disabled={busy}
      onClick={() => onChange(!on)}
    >
      {on ? t("on") : t("off")}
    </button>
  );
}
