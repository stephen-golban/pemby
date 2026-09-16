/**
 * The token names from `tokens.css`, for code that needs to reference a token from TypeScript
 * (inline styles, canvas, charts). Values stay in CSS so the theme swap keeps working.
 */
export const tokens = {
  color: {
    ground: "var(--color-ground)",
    surface: "var(--color-surface)",
    ink: "var(--color-ink)",
    inkSoft: "var(--color-ink-soft)",
    line: "var(--color-line)",
    lineStrong: "var(--color-line-strong)",
    focus: "var(--color-focus)",
    field: "var(--color-field)",
    onField: "var(--color-on-field)",
    plum: "var(--color-plum)",
    onPlum: "var(--color-on-plum)",
    plumChip: "var(--color-plum-chip)",
    ochre: "var(--color-ochre)",
    onOchre: "var(--color-on-ochre)",
    ochreChip: "var(--color-ochre-chip)",
    inkblue: "var(--color-inkblue)",
    onInkblue: "var(--color-on-inkblue)",
    inkblueChip: "var(--color-inkblue-chip)",
    paperCard: "var(--color-paper-card)",
    onChip: "var(--color-on-chip)",
    tierGreen: "var(--color-tier-green)",
    tierYellow: "var(--color-tier-yellow)",
    tierWhite: "var(--color-tier-white)",
    tierRed: "var(--color-tier-red)",
  },
  font: {
    display: "var(--font-display)",
    mono: "var(--font-mono)",
  },
  radius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    xl: "var(--radius-xl)",
    field: "var(--radius-field)",
    full: "var(--radius-full)",
  },
  shadow: {
    soft: "var(--shadow-soft)",
    card: "var(--shadow-card)",
  },
  rhythm: {
    top: "var(--rhythm-top)",
    lead: "var(--rhythm-lead)",
    headlineSub: "var(--rhythm-headline-sub)",
    subAction: "var(--rhythm-sub-action)",
    actionField: "var(--rhythm-action-field)",
    section: "var(--rhythm-section)",
    headingBody: "var(--rhythm-heading-body)",
  },
} as const;

export type Theme = "light" | "dark";
