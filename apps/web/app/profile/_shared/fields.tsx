"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCountryOptions } from "./countries";
import styles from "./fields.module.css";

/**
 * The editable ledger shared by `/onboarding` and `/profile`.
 *
 * One white card at 24px radius holding the topic's rows: the field's name in warm grey, the
 * answer under it in ink, hairline rules between rows and no box around a value. Same grammar as
 * the CV panel's read-only ledger (`components/profile/profile.module.css`). The difference is a
 * second column holding one pill that opens the editor **in the row** — no modal, no drawer, no
 * separate edit page (Operate: a modal for a task that needs neither interruption nor protected
 * focus is a lapse).
 *
 * Every editor below is uncontrolled while it is open and commits on "Done" or on Enter, so an
 * optimistic save happens once per edit rather than once per keystroke.
 */

// Ledger ------------------------------------------------------------------

export function Ledger({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <dl className={styles.ledger} aria-labelledby={labelledBy}>
      {children}
    </dl>
  );
}

export function FieldRow({
  id,
  label,
  help,
  filled,
  value,
  empty,
  editor,
}: {
  id?: string;
  label: string;
  help?: string;
  filled: boolean;
  /** What the row reads when it is not being edited. */
  value: ReactNode;
  /** What it reads instead when nothing has been answered. */
  empty: string;
  /** Rendered in place of the value while the row is open; mounted only then. */
  editor: () => ReactNode;
}) {
  const t = useTranslations("Onboarding.actions");
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (open) {
      // The first control of a freshly opened editor, so keyboard users stay in the row.
      body.current?.querySelector<HTMLElement>("input, select, button, textarea")?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      pill.current?.focus();
    }
  }, [open]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
  }

  return (
    <div className={styles.row} id={id} data-filled={filled} data-editing={open || undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>
        <div ref={body}>
          {open ? editor() : filled ? value : <span className={styles.missing}>{empty}</span>}
        </div>
        {help && (open || !filled) ? <p className={styles.help}>{help}</p> : null}
      </dd>
      <dd className={styles.action}>
        <button
          ref={pill}
          type="button"
          className={styles.pill}
          aria-label={open ? t("doneField", { field: label }) : t("editField", { field: label })}
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? t("done") : t("edit")}
        </button>
      </dd>
    </div>
  );
}

/** Values read as a wrapped list of grey tag pills; the same chip as `components/profile`. */
export function ValueChips({ values, label }: { values: readonly string[]; label: string }) {
  return (
    <ul className={styles.chips} aria-label={label}>
      {values.map((value) => (
        <li key={value} className={styles.chip}>
          {value}
        </li>
      ))}
    </ul>
  );
}

// Editors -----------------------------------------------------------------

export interface Option<T extends string> {
  value: T;
  label: string;
  help?: string;
}

function EditorShell({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className="visually-hidden">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** One of a small set, or nothing. Radios, because the options are few and worth reading at once. */
export function ChoiceEditor<T extends string>({
  legend,
  options,
  value,
  clearable,
  onChange,
}: {
  legend: string;
  options: readonly Option<T>[];
  value: T | null;
  clearable?: boolean;
  onChange: (next: T | null) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const name = useId();
  return (
    <EditorShell legend={legend}>
      <div className={styles.choices}>
        {options.map((option) => (
          <label key={option.value} className={styles.choice}>
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {clearable ? (
          <label className={styles.choice}>
            <input
              type="radio"
              name={name}
              checked={value === null}
              onChange={() => onChange(null)}
            />
            <span>{t("notSet")}</span>
          </label>
        ) : null}
      </div>
    </EditorShell>
  );
}

/** Any number of a small set. Each option may carry one mono line explaining it. */
export function MultiChoiceEditor<T extends string>({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: readonly Option<T>[];
  values: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <EditorShell legend={legend}>
      <div className={styles.choices} data-stacked="true">
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label key={option.value} className={styles.choice} data-stacked="true">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked ? values.filter((v) => v !== option.value) : [...values, option.value],
                  )
                }
              />
              <span>
                {option.label}
                {option.help ? <span className={styles.choiceHelp}>{option.help}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </EditorShell>
  );
}

export function YesNoEditor({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  return (
    <ChoiceEditor
      legend={legend}
      options={[
        { value: "yes", label: t("yes") },
        { value: "no", label: t("no") },
      ]}
      value={value ? "yes" : "no"}
      onChange={(next) => onChange(next === "yes")}
    />
  );
}

export function CountryEditor({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const countries = useCountryOptions();
  return (
    <label className={styles.inlineLabel}>
      <span className="visually-hidden">{legend}</span>
      <select
        className={styles.select}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{t("notSet")}</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A list of countries: the ones already chosen as removable chips, plus one picker that adds. */
export function CountryChipsEditor({
  legend,
  values,
  max,
  onChange,
}: {
  legend: string;
  values: readonly string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const countries = useCountryOptions();
  const byCode = new Map(countries.map((c) => [c.code, c.name]));
  return (
    <EditorShell legend={legend}>
      <ul className={styles.chips}>
        {values.map((code) => (
          <li key={code} className={styles.chip}>
            {byCode.get(code) ?? code}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={t("remove", { value: byCode.get(code) ?? code })}
              onClick={() => onChange(values.filter((v) => v !== code))}
            >
              <RemoveGlyph />
            </button>
          </li>
        ))}
      </ul>
      {values.length < max ? (
        <label className={styles.inlineLabel}>
          <span className="visually-hidden">{t("addCountry")}</span>
          <select
            className={styles.select}
            value=""
            onChange={(event) => {
              const code = event.target.value;
              if (code && !values.includes(code)) onChange([...values, code]);
            }}
          >
            <option value="">{t("addCountry")}</option>
            {countries
              .filter((country) => !values.includes(country.code))
              .map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
    </EditorShell>
  );
}

/** IANA zones from the browser, with one action that takes the zone the browser is already in. */
export function TimezoneEditor({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const [zones] = useState<string[]>(() => {
    try {
      return [...Intl.supportedValuesOf("timeZone")];
    } catch {
      return [];
    }
  });
  const guess = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  })();
  const options = value && !zones.includes(value) ? [value, ...zones] : zones;

  return (
    <EditorShell legend={legend}>
      <label className={styles.inlineLabel}>
        <span className="visually-hidden">{legend}</span>
        <select
          className={styles.select}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{t("notSet")}</option>
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      {guess && guess !== value ? (
        <button type="button" className={styles.pill} onClick={() => onChange(guess)}>
          {t("useBrowserZone", { zone: guess })}
        </button>
      ) : null}
    </EditorShell>
  );
}

export function NumberEditor({
  legend,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  legend: string;
  value: number | null;
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className={styles.inlineLabel}>
      <span className="visually-hidden">{legend}</span>
      <input
        className={styles.number}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") return onChange(null);
          const parsed = Number.parseInt(raw, 10);
          if (Number.isNaN(parsed)) return;
          onChange(Math.min(Math.max(parsed, min), max));
        }}
      />
      {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
    </label>
  );
}

/** Free-text values as removable chips: titles, stack, dealbreakers. Enter adds. */
export function TextChipsEditor({
  legend,
  placeholder,
  values,
  max,
  maxChars,
  onChange,
}: {
  legend: string;
  placeholder: string;
  values: readonly string[];
  max: number;
  maxChars: number;
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.replace(/\s+/g, " ").trim().slice(0, maxChars);
    if (value === "" || values.length >= max) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <EditorShell legend={legend}>
      <ul className={styles.chips}>
        {values.map((value) => (
          <li key={value} className={styles.chip}>
            {value}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={t("remove", { value })}
              onClick={() => onChange(values.filter((v) => v !== value))}
            >
              <RemoveGlyph />
            </button>
          </li>
        ))}
      </ul>
      {values.length < max ? (
        <div className={styles.addRow}>
          <label className={styles.inlineLabel}>
            <span className="visually-hidden">{placeholder}</span>
            <input
              className={styles.text}
              type="text"
              value={draft}
              placeholder={placeholder}
              maxLength={maxChars}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </label>
          <button
            type="button"
            className={styles.pill}
            onClick={add}
            disabled={draft.trim() === ""}
          >
            {t("add")}
          </button>
        </div>
      ) : null}
    </EditorShell>
  );
}

export function RateEditor({
  legend,
  amount,
  currency,
  period,
  currencies,
  periods,
  labels,
  onChange,
}: {
  legend: string;
  amount: number | null;
  currency: string | null;
  period: string | null;
  currencies: readonly string[];
  periods: readonly Option<string>[];
  labels: { amount: string; currency: string; period: string };
  onChange: (next: {
    amount: number | null;
    currency: string | null;
    period: string | null;
  }) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  return (
    <EditorShell legend={legend}>
      <div className={styles.rate}>
        <label className={styles.inlineLabel}>
          <span className="visually-hidden">{labels.amount}</span>
          <input
            className={styles.number}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              const parsed = raw === "" ? null : Number.parseInt(raw, 10);
              onChange({
                amount: parsed !== null && Number.isNaN(parsed) ? amount : parsed,
                currency,
                period,
              });
            }}
          />
        </label>
        <label className={styles.inlineLabel}>
          <span className="visually-hidden">{labels.currency}</span>
          <select
            className={styles.select}
            value={currency ?? ""}
            onChange={(event) => onChange({ amount, currency: event.target.value || null, period })}
          >
            <option value="">{t("notSet")}</option>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.inlineLabel}>
          <span className="visually-hidden">{labels.period}</span>
          <select
            className={styles.select}
            value={period ?? ""}
            onChange={(event) => onChange({ amount, currency, period: event.target.value || null })}
          >
            <option value="">{t("notSet")}</option>
            {periods.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </EditorShell>
  );
}

export interface PermitValue {
  country: string;
  kind: string;
  expiresOn?: string;
}

/**
 * Work permits: one chip per permit, and an add row of country plus kind plus an optional expiry.
 * Kind is a fixed list rather than free text — the matcher has to read it, and free text cannot be
 * translated.
 */
export function PermitsEditor({
  legend,
  values,
  kinds,
  max,
  labels,
  onChange,
}: {
  legend: string;
  values: readonly PermitValue[];
  kinds: readonly Option<string>[];
  max: number;
  labels: { country: string; kind: string; expires: string };
  onChange: (next: PermitValue[]) => void;
}) {
  const t = useTranslations("Onboarding.actions");
  const countries = useCountryOptions();
  const byCode = new Map(countries.map((c) => [c.code, c.name]));
  const kindLabel = new Map(kinds.map((k) => [k.value, k.label]));
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState(kinds[0]?.value ?? "");
  const [expiresOn, setExpiresOn] = useState("");

  function describe(permit: PermitValue) {
    return `${byCode.get(permit.country) ?? permit.country} · ${kindLabel.get(permit.kind) ?? permit.kind}`;
  }

  function add() {
    if (!country || !kind || values.length >= max) return;
    if (values.some((p) => p.country === country && p.kind === kind)) return;
    const permit: PermitValue = { country, kind };
    if (expiresOn) permit.expiresOn = expiresOn;
    onChange([...values, permit]);
    setCountry("");
    setExpiresOn("");
  }

  return (
    <EditorShell legend={legend}>
      <ul className={styles.chips}>
        {values.map((permit) => (
          <li key={`${permit.country}-${permit.kind}`} className={styles.chip}>
            {describe(permit)}
            {permit.expiresOn ? (
              <span className={styles.chipDetail}>{permit.expiresOn}</span>
            ) : null}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={t("remove", { value: describe(permit) })}
              onClick={() =>
                onChange(
                  values.filter((p) => !(p.country === permit.country && p.kind === permit.kind)),
                )
              }
            >
              <RemoveGlyph />
            </button>
          </li>
        ))}
      </ul>
      {values.length < max ? (
        <div className={styles.addRow}>
          <label className={styles.inlineLabel}>
            <span className="visually-hidden">{labels.country}</span>
            <select
              className={styles.select}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="">{labels.country}</option>
              {countries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.inlineLabel}>
            <span className="visually-hidden">{labels.kind}</span>
            <select
              className={styles.select}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {kinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.inlineLabel}>
            <span className="visually-hidden">{labels.expires}</span>
            <input
              className={styles.text}
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </label>
          <button type="button" className={styles.pill} onClick={add} disabled={country === ""}>
            {t("add")}
          </button>
        </div>
      ) : null}
    </EditorShell>
  );
}

function RemoveGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M3 3l6 6M9 3l-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
