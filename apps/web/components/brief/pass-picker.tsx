"use client";

import { useTranslations } from "next-intl";
import { PASS_REASONS, type PassReason } from "@/app/api/brief/_lib/view";
import { Option, Picker } from "./picker";

/**
 * "Not for me" (PLAN D6): the eight `match_pass_reason` values, one tap each, and nothing to type.
 * The reason is not only a dismissal — it is folded into this user's scoring nudges, so the next
 * matches lean away from whatever they named.
 */
export function PassPicker({
  onPick,
  onClose,
}: {
  onPick: (reason: PassReason) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Brief");
  return (
    <Picker
      title={t("pass.title")}
      note={t("pass.note")}
      onClose={onClose}
      closeLabel={t("pass.cancel")}
    >
      {PASS_REASONS.map((reason) => (
        <Option key={reason} label={t(`pass.reasons.${reason}`)} onSelect={() => onPick(reason)} />
      ))}
    </Picker>
  );
}
