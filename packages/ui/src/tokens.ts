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
    band: "var(--color-band)",
    onBand: "var(--color-on-band)",
    card: "var(--color-card)",
    onCard: "var(--color-on-card)",
    accentYellow: "var(--color-accent-yellow)",
    onAccentYellow: "var(--color-on-accent-yellow)",
    accentRed: "var(--color-accent-red)",
    onAccentRed: "var(--color-on-accent-red)",
    accentBlue: "var(--color-accent-blue)",
    onAccentBlue: "var(--color-on-accent-blue)",
    accentGreen: "var(--color-accent-green)",
    onAccentGreen: "var(--color-on-accent-green)",
    tierGreen: "var(--color-tier-green)",
    tierGreenSoft: "var(--color-tier-green-soft)",
    onTierGreenSoft: "var(--color-on-tier-green-soft)",
    tierYellow: "var(--color-tier-yellow)",
    tierYellowSoft: "var(--color-tier-yellow-soft)",
    onTierYellowSoft: "var(--color-on-tier-yellow-soft)",
    tierWhite: "var(--color-tier-white)",
    tierWhiteSoft: "var(--color-tier-white-soft)",
    onTierWhiteSoft: "var(--color-on-tier-white-soft)",
    tierRed: "var(--color-tier-red)",
    tierRedSoft: "var(--color-tier-red-soft)",
    onTierRedSoft: "var(--color-on-tier-red-soft)",
    /** @deprecated use `band` */
    field: "var(--color-band)",
    /** @deprecated use `onBand` */
    onField: "var(--color-on-band)",
    /** @deprecated use `card` */
    paperCard: "var(--color-card)",
    /** @deprecated use `accentBlue` */
    plum: "var(--color-plum)",
    /** @deprecated */
    onPlum: "var(--color-on-plum)",
    /** @deprecated */
    plumChip: "var(--color-plum-chip)",
    /** @deprecated use `accentYellow` */
    ochre: "var(--color-ochre)",
    /** @deprecated */
    onOchre: "var(--color-on-ochre)",
    /** @deprecated */
    ochreChip: "var(--color-ochre-chip)",
    /** @deprecated use `ink` */
    inkblue: "var(--color-inkblue)",
    /** @deprecated */
    onInkblue: "var(--color-on-inkblue)",
    /** @deprecated */
    inkblueChip: "var(--color-inkblue-chip)",
    /** @deprecated use `ink` */
    onChip: "var(--color-on-chip)",
  },
  font: {
    display: "var(--font-display)",
    /** @deprecated there is no monospace in this world; it aliases `display` */
    mono: "var(--font-display)",
  },
  /**
   * The type ramp. A surface picks a step; it never invents one. If a size is not here, it is
   * wrong.
   *
   * `display` is the ceiling — nothing may exceed it, on any surface, at any viewport. `micro` is
   * the floor — anything smaller snaps up to it.
   *
   * Descending, by the size each step reaches at its widest:
   * display → score → section → figure → title → heading → subhead → row → lead → body → small
   * → label → micro
   */
  text: {
    display: "var(--text-display)",
    /** Major section headings: the step between `display` and `title`. */
    section: "var(--text-section)",
    /** The one headline numeral. */
    score: "var(--text-score)",
    /** Large counts beside body copy: a smaller sibling of `score`, between it and `title`. */
    figure: "var(--text-figure)",
    title: "var(--text-title)",
    heading: "var(--text-heading)",
    /** Card and panel sub-heads: the step between `heading` and `row`. */
    subhead: "var(--text-subhead)",
    row: "var(--text-row)",
    /** The sub-line under a poster statement: the step between `row` and `body`. */
    lead: "var(--text-lead)",
    body: "var(--text-body)",
    small: "var(--text-small)",
    /** Uppercase labels, paired with `--tracking-label`. */
    label: "var(--text-label)",
    /** The floor of the ramp. */
    micro: "var(--text-micro)",
  },
  radius: {
    sm: "var(--radius-sm)",
    tile: "var(--radius-tile)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    card: "var(--radius-card)",
    xl: "var(--radius-xl)",
    band: "var(--radius-band)",
    pill: "var(--radius-pill)",
    /** @deprecated use `band` */
    field: "var(--radius-band)",
    /** @deprecated use `pill` */
    full: "var(--radius-full)",
  },
  shadow: {
    soft: "var(--shadow-soft)",
    card: "var(--shadow-card)",
    pop: "var(--shadow-pop)",
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
