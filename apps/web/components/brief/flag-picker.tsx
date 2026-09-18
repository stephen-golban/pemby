"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  FLAG_ELIGIBILITY_VALUES,
  FLAG_FIELDS,
  FLAG_REASONS,
  FLAG_SALARY_VALUES,
  FLAG_SENIORITY_VALUES,
  type FlagField,
  type FlagReason,
} from "@/app/api/brief/_lib/view";
import { Option, Picker } from "./picker";
import styles from "./brief.module.css";

export interface FlagChoice {
  reason: FlagReason;
  field?: FlagField;
  fieldValue?: string;
}

/**
 * Reporting a post (PLAN D26 and section 6): the six flag reasons, and for "wrong details" the
 * fixed picker — which detail, then a value from a fixed list. **No free text anywhere.** The
 * closed fields (pay, level, who it's open to) have their own vocabularies; the two open ones
 * (stack, location) offer the post's own listed values, which is the only fixed list they can
 * have, and say so plainly when the post lists none.
 *
 * Three small steps in place rather than one long form: at each one there is exactly one question
 * on screen, and Back undoes the previous answer.
 */
export function FlagPicker({
  stack,
  locations,
  onPick,
  onClose,
}: {
  stack: readonly string[];
  locations: readonly string[];
  onPick: (choice: FlagChoice) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Brief");
  const [field, setField] = useState<FlagField | null>(null);
  const [step, setStep] = useState<"reason" | "field" | "value">("reason");

  if (step === "reason") {
    return (
      <Picker
        title={t("flag.title")}
        note={t("flag.note")}
        onClose={onClose}
        closeLabel={t("flag.cancel")}
      >
        {FLAG_REASONS.map((reason) => (
          <Option
            key={reason}
            label={t(`flag.reasons.${reason}`)}
            onSelect={() => {
              if (reason === "wrong_details") setStep("field");
              else onPick({ reason });
            }}
          />
        ))}
      </Picker>
    );
  }

  if (step === "field") {
    return (
      <Picker
        title={t("flag.fieldTitle")}
        onClose={() => setStep("reason")}
        closeLabel={t("flag.back")}
      >
        {FLAG_FIELDS.map((name) => (
          <Option
            key={name}
            label={t(`flag.fields.${name}`)}
            onSelect={() => {
              setField(name);
              setStep("value");
            }}
          />
        ))}
      </Picker>
    );
  }

  const chosen = field ?? "salary";
  const values: readonly string[] =
    chosen === "salary"
      ? FLAG_SALARY_VALUES
      : chosen === "seniority"
        ? FLAG_SENIORITY_VALUES
        : chosen === "eligibility"
          ? FLAG_ELIGIBILITY_VALUES
          : chosen === "stack"
            ? stack
            : locations;

  // The post's own values are data, not copy, so they are shown as the post wrote them; the three
  // closed vocabularies are translated.
  const labelFor = (value: string): string => {
    if (chosen === "salary") return t(`flag.values.salary.${value as "not_listed"}`);
    if (chosen === "seniority") return t(`flag.values.seniority.${value as "junior"}`);
    if (chosen === "eligibility") return t(`flag.values.eligibility.${value as "green"}`);
    return value;
  };

  return (
    <Picker
      title={t(`flag.valueTitle.${chosen}`)}
      onClose={() => setStep("field")}
      closeLabel={t("flag.back")}
    >
      {values.length === 0 ? (
        <p className={styles.pickerNote}>
          {chosen === "stack" ? t("flag.empty.stack") : t("flag.empty.location")}
        </p>
      ) : (
        values.map((value) => (
          <Option
            key={value}
            label={labelFor(value)}
            onSelect={() => onPick({ reason: "wrong_details", field: chosen, fieldValue: value })}
          />
        ))
      )}
    </Picker>
  );
}
