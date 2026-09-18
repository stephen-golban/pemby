---
name: Pemby
description: AI job-matching software; you apply yourself. Warm ground, heavy grotesk, mono prose, earthy cards on a deep olive field.
colors:
  ground: "#faf6f0"
  surface: "#f4eee4"
  ink: "#14110d"
  ink-soft: "#3b342b"
  line: "rgb(20 17 13 / 0.28)"
  line-strong: "#14110d"
  focus: "#2c4a5e"
  selection: "#efcf8f"
  field: "#2b3323"
  on-field: "#f7f1e6"
  plum: "#875a70"
  on-plum: "#f7f1e6"
  plum-chip: "#d4b3c3"
  ochre: "#d6a24a"
  on-ochre: "#14110d"
  ochre-chip: "#ebc07c"
  inkblue: "#2c4a5e"
  on-inkblue: "#f7f1e6"
  inkblue-chip: "#bfd4e6"
  paper-card: "#fbf8f2"
  on-chip: "#14110d"
  tier-green: "#56733c"
  tier-yellow: "#d1a432"
  tier-white: "#fbf8f2"
  tier-red: "#a54a3b"
  ground-dark: "#191510"
  surface-dark: "#221d17"
  ink-dark: "#f7f1e6"
  ink-soft-dark: "#ddd4c6"
  line-dark: "rgb(247 241 230 / 0.34)"
  line-strong-dark: "#f7f1e6"
  focus-dark: "#efcf8f"
  selection-dark: "#6a4658"
  field-dark: "#272d20"
  plum-dark: "#6a4658"
  plum-chip-dark: "#3f2a35"
  ochre-dark: "#b98a3a"
  ochre-chip-dark: "#5a4219"
  inkblue-dark: "#22394a"
  inkblue-chip-dark: "#152532"
  paper-card-dark: "#211c16"
  on-chip-dark: "#f7f1e6"
  tier-green-dark: "#86a468"
  tier-yellow-dark: "#dcb452"
  tier-white-dark: "#2c261f"
  tier-red-dark: "#c86a57"
typography:
  display:
    fontFamily: "Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.25rem, 1.2rem + 5.4vw, 6.3125rem)"
    fontWeight: 800
    lineHeight: 0.84
    letterSpacing: "-0.024em"
  headline:
    fontFamily: "Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.1rem + 3.6vw, 4.75rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.024em"
  title:
    fontFamily: "Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 0.88
    letterSpacing: "-0.035em"
  heading:
    fontFamily: "Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.8125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Source Code Pro, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "Source Code Pro, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Source Code Pro, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
  card: "30px"
  field: "64px"
  full: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
  "9": "96px"
  gutter: "clamp(16px, 3.4vw, 52px)"
  content-max: "1344px"
  rhythm-top: "clamp(16px, 2.6vw, 40px)"
  rhythm-lead: "clamp(64px, min(14.65vh, 10vw), 150px)"
  rhythm-headline-sub: "clamp(28px, min(5.47vh, 3.65vw), 56px)"
  rhythm-sub-action: "clamp(40px, min(7.8vh, 5.2vw), 80px)"
  rhythm-action-field: "clamp(72px, min(12.7vh, 8.5vw), 130px)"
  rhythm-section: "clamp(88px, 9.8vw, 150px)"
  rhythm-heading-body: "clamp(24px, 2.35vw, 36px)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "52px"
  button-on-color:
    backgroundColor: "{colors.on-inkblue}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "52px"
  button-outline-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "7px 14px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "44px"
  drop-zone:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px 24px 24px"
    height: "156px"
    width: "560px"
  card-plum:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-plum}"
    rounded: "{rounded.card}"
    padding: "36px 32px 32px"
  card-ochre:
    backgroundColor: "{colors.ochre}"
    textColor: "{colors.on-ochre}"
    rounded: "{rounded.card}"
    padding: "36px 32px 32px"
  card-inkblue:
    backgroundColor: "{colors.inkblue}"
    textColor: "{colors.on-inkblue}"
    rounded: "{rounded.card}"
    padding: "36px 32px 32px"
  card-paper:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "44px 44px 36px"
  panel-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "28px 32px 12px"
  chip-job:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  tag-card:
    backgroundColor: "{colors.plum-chip}"
    textColor: "{colors.on-chip}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  count-badge:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "30px"
  stamp-example:
    backgroundColor: "rgb(20 17 13 / 0.86)"
    textColor: "#f7f1e6"
    rounded: "7px"
    padding: "6px 9px 5px"
  nav-link:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "44px"
  field-band:
    backgroundColor: "{colors.field}"
    textColor: "{colors.on-field}"
    rounded: "{rounded.field}"
---

# Design System: Pemby

## Overview

**Creative North Star: "The Few Cards on the Table"**

Pemby sends a handful of matches, never a feed, and the visual system is built to look like that: a flat, warm off-white ground, a heavy friendly grotesk set big and tight, monospace for every sentence of evidence, and a small number of physical, earthy-coloured cards that carry the reason each job can hire you. One deep olive field anchors the lower part of a page and closes every page as the footer. The family resemblance to desertant.com is deliberate and binding; its specific signatures (grain-stippled hero words, full-bleed product carousel, top-right tag pill, its exact cream) are not ours.

Density is low on Persuade surfaces and deliberately opened: the owner's spacing instruction set a generous vertical rhythm, so at least a third of a first viewport is empty ground and there is always more space above a heading than below it. Operate surfaces (onboarding, the Brief, the tracker) keep the same ground, type, colours, radii and ruled-ledger lists, but at working density and with every flourish removed.

The ground is never pure white and ink is never pure black, and the ground carries no paper, newsprint or printed-document texture. Light and dark are the same design; dark is a token swap only. The lockup is the wordmark alone, with no symbol.

**Key Characteristics:**

- Warm flat ground (never #fff) and warm near-black ink (never #000); no textures, no gradients as decoration.
- Rethink Sans for headlines, role names, buttons and numbers; Source Code Pro for all prose, rows, tags and labels.
- Three earthy card fills (plum, ochre, ink-blue) plus an outlined paper card, each with its own tinted chip.
- Very large soft radii (30px cards, 64px field corners) and deep diffuse warm shadows.
- Landing-only flourishes: card tilt, loose hand-drawn marks, colour-graded photographic cards.
- Eligibility tiers are always a colour dot plus a text label, never colour alone.
- Every demonstration carries an unmissable EXAMPLE stamp.

## Colors

A warm, low-saturation palette: cream and brown-black neutrals, one deep olive field, and three muted earthy accents that only appear as whole surfaces, never as thin decoration.

### Primary

- **Deep Olive Field** (`field`): the one large colour surface per page. Full-bleed, large top corners, carrying the match cards on the landing band, the passes on /pricing, and the footer on every page. Type on it is always `on-field` cream in both themes. In dark it deepens to `field-dark` (owner decision 2026-09-17: "Keep #272d20", over the contract's #1e2419).

### Secondary

- **Muted Plum** (`plum`): a card fill with cream type. Light value darkened from the contract's #8d6076 so cream type on it clears WCAG AA. Chip: `plum-chip`.
- **Warm Ochre** (`ochre`): a card fill with ink type; the highlighted pass and the recommended plan. Also the tint for "Pass" columns (30% into `paper-card`) and the drag-over state of the drop zone (18% into `surface`). Chip: `ochre-chip`.
- **Ink Blue** (`inkblue`): a card fill with cream type; the Telegram panel; the current segment on the pass timeline. It doubles as the light-theme `focus` colour and the global `accent-color` for native controls. Chip: `inkblue-chip`.

### Tertiary

- **Eligibility tiers** (`tier-green`, `tier-yellow`, `tier-white`, `tier-red`): green "hires from your country", yellow "likely", white "unclear" (drawn with a `line-strong` edge), red "excluded". Used as 12-14px round swatches beside a mono label, and red as the hand-drawn "closed" underline. Never used as a fill for large areas and never without the label.

### Neutral

- **Warm Ground** (`ground`): the page background everywhere; also the text colour on ink buttons and count badges.
- **Raised Cream** (`surface`): panels, the drop zone, job chips, the kit list, the re-check log.
- **Paper Card** (`paper-card`): the outlined "honest silence" card, message previews, the compare table body. In light it is a hair lighter than ground; in dark it lifts slightly above it.
- **Warm Ink** (`ink`): all body and heading type, primary button fill, strong rules.
- **Soft Ink** (`ink-soft`): secondary notes, table column heads, table-of-contents links, list markers. Used on pricing and legal; body-critical text stays `ink`.
- **Hairline** (`line`): 1px row rules, dashed drop-zone outline, menu borders. **Strong Line** (`line-strong`): 1.5px outlines on paper cards, compare tables and outline pills.
- **Selection** (`selection`): text selection only. **Focus** (`focus`): the 2px focus ring.

### Named Rules

**The Token Swap Rule.** Dark mode changes token values and nothing else: same copy, same content, same spacing, same components. A component that needs a dark-only override (the doodle's inverted artwork is the one exception) is a defect.

**The Whole Surface Rule.** Plum, ochre and ink-blue appear as whole card or panel fills with their paired `on-*` ink, never as text colour, borders, icons or accents on the ground.

**The Label Beside Every Colour Rule.** A tier colour always sits beside its words. Colour alone never carries eligibility.

## Typography

**Display Font:** Rethink Sans (with ui-sans-serif, system-ui), weights 600, 700, 800 loaded
**Body Font:** Source Code Pro (with ui-monospace, SFMono-Regular), weights 400, 500, 600 loaded
**Label/Mono Font:** Source Code Pro, uppercase with wide tracking

**Character:** A tight, heavy, friendly grotesk with a big x-height against a quiet monospace. The grotesk makes claims; the mono shows the evidence.

### Hierarchy

- **Display** (800, fluid to 101px, line-height 0.84, -0.024em): the landing headline and the closing headline. One per page, centred, balanced to two lines.
- **Headline** (800, fluid to 76px, 0.92, -0.024em): section titles, max about 15em wide. Page heroes on pricing and legal use the same voice at up to 88px and 76px.
- **Title** (700, 34px, 0.88, -0.035em): step titles, drop-zone title, plan names. Smaller grotesk titles in the build step down through 29, 26, 24, 21 and 19px for card roles, group labels, FAQ questions and table row heads.
- **Heading** (800, 29px, 1, -0.035em): the wordmark in the top bar (56px in the footer).
- **Body** (400, 16px, 1.6): legal prose (measure 70ch), about text.
- **Body small** (400, 15px, 1.6): the default paragraph size on Persuade surfaces: sub-lines, section intros (58ch), step bodies, table cells.
- **Label** (500, 13px, 0.14em, uppercase): table heads, footer group heads, card tags, the EXAMPLE stamp (600, 12px). Plain 13px mono without caps carries footnotes, message previews and chips.

### Named Rules

**The Two Voices Rule.** Grotesk for claims, names, numbers and button labels; mono for every sentence, row, tag and footnote. Never set a paragraph in the grotesk or a headline in mono.

**The Sentence Case Rule.** Every headline, title and button is sentence case. Uppercase belongs only to small mono labels.

**The Tight Display Rule.** Grotesk sizes above 24px carry negative tracking (-0.015em to -0.035em) and line-height under 1.

## Layout

Content sits in a centred container of `content-max` plus two `gutter`s. Section grammar is shared: each section is padded by `rhythm-section` above, the heading sits over its intro with `rhythm-heading-body` between (always less than the space above), and passages alternate between an asymmetric two-column split (5fr/7fr, 7fr/5fr, 8fr/4fr, 6fr/5fr) and a single centred column.

The first viewport follows the opened rhythm, the owner's explicit instruction: `rhythm-top` above the top bar, `rhythm-lead` of empty ground to the headline, `rhythm-headline-sub`, `rhythm-sub-action`, then `rhythm-action-field` down to the colour field. These values hold at 1536x1024 and ease down on shorter or narrower viewports.

Lists and tables are ledgers: rows divided by 1px `line` rules, generous row padding (12-18px), no zebra striping, no boxed cells. This is the pattern Operate screens should use for the Brief, near-miss groups and the tracker.

Spacing uses the 4-8-12-16-24-32-48-64-96 scale. Responsive behaviour collapses two-column splits to one column between 820 and 1100px, turns the match band from a row of four into a 2-up grid below 1180px and a single column below 680px, and replaces the nav with a disclosure menu below 720px. All interactive targets are at least 44px tall; primary actions are 52px.

### Named Rules

**The Opened Rhythm Rule.** More ground, not less. At least a third of a Persuade first viewport is empty ground, and the space above a heading always exceeds the space below it.

## Elevation & Depth

A hybrid: surfaces are flat and tonal (ground, surface, paper-card) and borders do most of the separating, while physical objects (cards, the drop zone, menus, message previews) lift off with warm, diffuse, downward shadows. No hard offset shadows, no glow, no blur-glass.

### Shadow Vocabulary

- **Soft** (`box-shadow: 0 1px 2px rgb(20 17 13 / 0.04), 0 10px 30px -18px rgb(20 17 13 / 0.18)`): the drop zone, the mobile menu panel, small preview cards and message bubbles.
- **Card** (`box-shadow: 0 2px 6px rgb(20 17 13 / 0.12), 0 34px 60px -24px rgb(20 17 13 / 0.55)`): the colour cards, the honest-silence card, pass cards, the Telegram post, the re-check log.
- In dark both shadows swap to black at higher opacity (0.3/0.6 and 0.35/0.8).

### Named Rules

**The Objects Lift, Panels Sit Rule.** A shadow means "this is a thing you could pick up": a match, a pass, a message. Panels, tables and page sections sit flat on the ground.

## Shapes

Soft, generous, rounded forms. Every card-sized object uses a 30px corner (34px on the single large specimen card, 44px on the wide Telegram panel); panels, the drop zone and logs use 28px; small tiles and inner lists use 20px; chips and badges use 8px; actions, pills, toggles and count badges are fully round. The deep field takes 64px corners (top corners only when it runs to the page edge, like the band and the footer). Message previews have one tight corner (22/22/22/6px, 26/26/26/8px) to read as a chat bubble.

Borders are 1px hairlines for rules and 1.5px for outlines. Dashed strokes mean "drop here" or "not yet": the drop-zone outline, the file slot, the unavailable buy button, the 24-hour-late note.

Loose hand-drawn marks (the sleeping-face doodle, the closure underline) and colour-graded photographs masked into the lower half of a card belong to the landing page only.

## Components

### Buttons

Round, heavy, and short-worded.

- **Shape:** fully round pill (999px), 52px tall.
- **Primary:** ink fill with ground-coloured grotesk label (700, 19px), 24px side padding, optional 18px arrow glyph after the label.
- **On colour:** on a coloured panel the pill inverts to the panel's `on-*` cream with ink type.
- **Hover / Focus:** hover lifts 2px (`duration-fast`, `ease-out`); focus is the global 2px `focus` ring, offset 3px (on colour and on the field the ring takes the surface's ink colour). Reduced motion removes the lift.
- **Outline pill:** 1-1.5px `line` or `line-strong` border, transparent, mono label 13px weight 500 (the near-miss "fix", "Copy", "Start over"). Hover strengthens the border to ink. This is the right secondary action for Operate screens.
- **Icon button:** 44px round, transparent; hover fills with ink at 8%. The theme toggle rotates its icon 180 degrees on theme change.
- **Unavailable:** dashed currentColor border, `cursor: not-allowed`, with plain words saying why ("Not on sale yet").

### Chips and tags

- **Job chip:** `surface` fill, inset 1px `line`, 8px corners, 13px mono. Used for near-miss job names.
- **Card tag:** the card's own tinted chip colour, uppercase mono 500, sitting bottom-left on a colour card.
- **Count badge:** 30px ink circle with ground numerals, tabular figures.
- **Tier verdict:** 14px round swatch plus a mono 500 label, never wrapped.

### Cards / Containers

- **Corner Style:** 30px for colour and pass cards; 28px for panels.
- **Background:** one of plum, ochre, ink-blue with paired `on-*` ink; or `paper-card` with a 1.5px `line-strong` outline for neutral or "nothing today" states.
- **Shadow Strategy:** Card shadow for objects; panels are flat (see Elevation & Depth).
- **Internal Padding:** 36px 32px 32px on pass cards, 44px on the specimen card; landing match cards scale every measurement in container units so the card shrinks as one piece.
- **Match card anatomy:** grotesk role name, mono meta line, a list of criteria each led by a filled ticked square in the card's ink, the tier tag and EXAMPLE stamp stacked bottom-left. Ticks are always filled: a criterion that is met never renders as an empty box.

### Drop zone

The primary action of the product. A 560px-max `surface` panel, 28px corners, 1.5px dashed `line` outline, soft shadow, a 34px upload glyph, a grotesk title and a mono caption. Hover darkens the outline to ink 55% and lifts the glyph 3px; dragging turns the outline solid ink, tints the fill with ochre and scales to 1.012. After a drop it switches optimistically to a pending state with a text link and an outline-pill "back" action.

### Ledger tables and lists

Mono 15px rows separated by 1px `line` rules; uppercase label heads; grotesk 19px row heads where a row has a name. On narrow screens rows stack into grids and the head row hides. Legal tables use a 1.5px `line-strong` rule under the head. Near-miss groups: count badge, grotesk group label, outline-pill fix, then wrapped job chips under a hairline.

### Disclosure (FAQ and mobile table of contents)

Full-width rows divided by hairlines, grotesk question at 21px, a plus icon whose vertical stroke collapses (scaleY to 0) when open, so it reads as a minus.

### Navigation

- **Top bar:** wordmark left at 29px/800; mono 16px links right with 22px gaps, underline on hover, 44px targets; theme toggle at the far right.
- **Mobile (below 720px):** an outline pill "Menu" button opens a panel below the bar: ground fill, 20px corners, `line` border, soft shadow, stacked 52px rows with hairlines. The icon morphs from bars to a cross.
- **Footer:** the deep field with 64px top corners closes every page; 56px wordmark, uppercase mono group heads, 44px link rows in cream.

### EXAMPLE stamp

The synthetic-content marker. Near-black at 86% with a cream 50% hairline and cream uppercase mono 600 text, 7px corners. It is a fixed-colour stamp that reads the same on every fill and in both themes. Every invented company, role, reason, timestamp or message carries one, placed where it cannot be missed.

### Signature motion: the honest-silence settle

The one orchestrated motion. When the "Nothing today" card first scrolls into view from below the fold, its job chips drift in from scattered offsets and settle (1100ms, staggered 90ms), the group heads and stamp rise 10px, and the doodle dozes in. Transforms and opacity only, on `ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`. It plays once and is skipped entirely under `prefers-reduced-motion`. Everything else is a state transition at `duration-fast` (160ms) or `duration-base` (320ms).

Those numbers are the landing and marketing spec. **Operate surfaces run a faster variant:** `duration-base` (320ms), staggered 70ms, and no chip drift, on the same easing, still once only and still skipped under `prefers-reduced-motion`. The Brief's honest-silence card, the profile count line and the onboarding rail all animate the one thing the person opened the page to read, and holding a sentence that explains an empty Brief for over a second costs more than the moment is worth. Owner decision, 2026-09-17. The 1100ms settle stays the spec wherever the motion is the point rather than the delay.

## Do's and Don'ts

### Do:

- **Do** use `ground` for every page background and `ink` for body-critical text in both themes; keep all body text, captions and footnotes at WCAG 2.2 AA contrast.
- **Do** ship light and dark from the same markup by swapping tokens only.
- **Do** set headlines, names, numbers and buttons in Rethink Sans, and every sentence, row, tag and footnote in Source Code Pro.
- **Do** show matches, passes and messages as 30px-corner cards with a paired `on-*` ink and the Card shadow.
- **Do** build Operate lists (the Brief, near misses, the tracker) as hairline-ruled ledgers with outline-pill secondary actions and flat, untilted cards.
- **Do** pair every tier colour with its label and reason.
- **Do** mark every demonstration with the EXAMPLE stamp.
- **Do** keep hit targets at 44px or taller and the focus ring visible at 2px.
- **Do** keep the opened rhythm: more space above a heading than below it, and a third of a Persuade first viewport as empty ground.
- **Do** honour `prefers-reduced-motion` by removing lifts, scales and the settle animation.
- **Do** use the wordmark alone as the lockup.

### Don't:

- **Don't** use pure white (#fff) or pure black (#000) surfaces or type, or add paper, grain or newsprint texture to the ground.
- **Don't** rotate cards, add hand-drawn marks or put photographs in cards outside the landing page; app screens never tilt, because tilt hurts scanning and keyboard use in dense lists.
- **Don't** add a second orchestrated motion to a page; the settle is the signature.
- **Don't** use plum, ochre or ink-blue as text, border or icon colours on the ground.
- **Don't** convey eligibility by colour alone.
- **Don't** create a dark-only layout, copy or spacing change.
- **Don't** add a brand symbol beside the wordmark.
- **Don't** use hard offset shadows, glows or glass blur.
- **Don't** set small mono labels in sentence case or headlines in uppercase.
- **Don't** borrow desertant's own signatures: grain-stippled hero words, a full-bleed product carousel, a tag pill in a card's top-right corner, or its exact cream.
