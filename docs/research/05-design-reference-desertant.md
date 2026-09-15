# 05 — Design reference: desertant.com

Researched 2026-09-15. Source: Desert Ant Labs (on-device AI models and SDKs), https://desertant.com/.
Purpose: write down what the founder likes about this site so it can guide Pemby's UI work later (built with the `impeccable` skill). This is a description of the reference. It is not a Pemby design.

**Method.** I downloaded the raw HTML, both stylesheets (`/brand/index.css`, 95 KB, and `/assets/site.css`, 76 KB) and all JS (`/assets/main.js`, `/brand/js/effects.js`, `nav.js`, `copy.js`, `pinboard.js`), plus the subpages `/models/`, `/models/voz/`, `/about/`, `/blog/` and `/docs/`. I took screenshots with a locally cached Playwright/Chromium (nothing installed) and read computed styles in that browser. Unless marked **(inferred)**, every value below comes from the source. **(inferred)** means I judged it from the screenshots.

**Screenshots** (`docs/research/desertant/`):

| File | What |
|---|---|
| `home-desktop-1440-fold.png`, `home-desktop-1440-full.png` | Homepage, 1440 px |
| `home-mobile-390-fold.png`, `home-mobile-390-full.png` | Homepage, 390 px @2x |
| `home-desktop-1440-models-menu.png` | "Models" mega-menu open |
| `home-desktop-1440-card-hover.png` | Model-grid card hover (Align card, faun fill) |
| `home-desktop-1440-prefers-dark.png` | Same page emulating `prefers-color-scheme: dark`. Identical to light. |
| `model-voz-desktop-1440-{fold,full}.png`, `model-voz-mobile-390-{fold,full}.png` | Model detail page: stats, benchmark table, code blocks |
| `about-desktop-1440-{fold,full}.png`, `about-mobile-390-{fold,full}.png` | About page: stat panels, bar comparison |

---

## 1. Aesthetic and mood

- **Warm off-white "paper" canvas** (`#fbfaf4`) with near-black ink (`#0e1113`). There is no pure white page and no pure black text. The whole thing reads like a printed lab catalog or a zine, not a SaaS template.
- **Two typefaces doing opposite jobs.** A tight, heavy grotesk (Inclusive Sans, semibold, tracked in hard) carries headlines, names, buttons and nav. **Monospace (JetBrains Mono) is the default body font**, used for paragraphs, ledes, tags and footnotes. That split makes the site feel engineered and honest while the headlines stay friendly.
- **Muted, earthy product colors** (sage, teal-grey, dusty pink, terracotta, sand, forest). Each product gets one. Nothing is saturated except terracotta and clay red.
- **Editorial photography with a hand-made layer.** The portraits are film-toned, with motion blur or long exposure, and carry handwritten scribbles or white hand-drawn outlines on top (for example "so today we're gonna talk about" over the Voz portrait, and a loose outline around a face on Clear) **(inferred)**.
- **Texture instead of gradients.** The only "effect" in the homepage hero is an SVG film-grain/stipple filter on the words "Little brains". There are no glows, no glassmorphism and no gradient meshes.
- **Physical, playful objects.** Feature cards are slightly rotated "trading cards" that overlap in a fan. Inspiration prompt cards are pinned at small angles like a corkboard.
- **Big whitespace, low density on marketing pages. Real numbers and tables on detail pages.** The mood is calm confidence: few words, specific claims.

## 2. Typography

### Families (from `@font-face` in `/brand/index.css`, self-hosted, `font-display: swap`)

| Token | Stack | Files |
|---|---|---|
| `--font-family-display` | `"Inclusive Sans", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif` | `inclusive-sans-var.woff2` and `inclusive-sans-var-italic.woff2`, variable weight axis `300 700` |
| `--font-family-mono` | `"JetBrains Mono", SFMono-Regular, ui-monospace, Menlo, monospace` | `jetbrains-mono-{400,500,600,700}.woff2` |
| `--font-family-ui` | `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui, sans-serif` | defined, but I saw no homepage element using it |

- `body` is set to **mono**: `font-family: var(--font-family-mono); font-size: 1rem; line-height: 1.7`.
- `h1`–`h6` use the display family at `font-weight: 600` with `text-wrap: balance`. `p` gets `text-wrap: pretty`.
- The critical inline CSS falls back to `"Inclusive Sans", system-ui` on body before the stylesheet loads, and both Inclusive Sans regular and JetBrains Mono 400 are preloaded.
- Rendering: `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`, `font-feature-settings: "kern" 1, "liga" 1`. Numeric tables use `font-variant-numeric: tabular-nums`.

### Scale tokens

`--font-size-2xs .6875rem (11px)` · `xs .75rem (12)` · `sm .875rem (14)` · `base 1rem (16)` · `lg 1.125rem (18)` · `xl 1.5rem (24)` · `2xl 2rem (32)` · `3xl 2.5rem (40)` · `4xl 3.5rem (56)` · `5xl 4.5rem (72)` · `6xl 6rem (96)` · `7xl 7.5rem (120)`

Line-height tokens: `display .9`, `tight 1.06`, `snug 1.2`, `normal 1.4`, `relaxed 1.7`.
Letter-spacing tokens: `display -.06em`, `tighter -.04em`, `tight -.03em`, `wide .04em`, `wider .06em`, `widest .18em`.
Weights: 300 / 400 / 500 / 600 / 700. In practice only **400 (mono), 500 (claims, footer links) and 600 (all display)** appear.
Measure token: `--font-measure: 46rem`.

### Roles actually used (CSS plus computed values at 1440 px)

| Role | Family | Size | Weight | Line-height | Tracking | Case |
|---|---|---|---|---|---|---|
| Hero H1 `.hero-h1` | Inclusive Sans | `clamp(3.25rem, 8.6vw, 7.5rem)` (120px at 1440) | 600 | **.85** | **-.06em** | Sentence |
| Model-page title `.hero-model-title` | Inclusive Sans | `clamp(2.75rem, 8vw, 7.5rem)` | 600 | **.73** | -.06em | Sentence |
| H2 | Inclusive Sans | `clamp(1.75rem, 3.2vw, 2.5rem)` | 600 | 1.2 | -.04em | Sentence |
| H3 | Inclusive Sans | 1.5rem | 600 | 1.2 | -.03em | Sentence |
| Hero sub / lede | JetBrains Mono | 1.125rem | 400 | 1.4 / 1.7 | 0 | Sentence |
| Body paragraphs | JetBrains Mono | 1rem | 400 | 1.7 | 0 | Sentence |
| Feature-card name `.fc-name` | Inclusive Sans | 2.125rem (34px) | 600 | 1.15 | -.04em (-1.36px) | Title |
| Card name `.card-name` | Inclusive Sans | 1.5rem | 600 | 1.2 | -.03em | Title |
| Card claim | Inclusive Sans | 1rem | 500 | 1.4 | -.01em | Sentence |
| Tag / pill `.fc-tag`, `.card-kind`, `.tag` | JetBrains Mono | .75rem (12px) | 400–500 | 1.3 | **+.06em** (0.72px) | **UPPERCASE** |
| Eyebrow `.eyebrow`, `.stat-label`, table `thead th` | JetBrains Mono | .75rem / .6875rem | 500 | — | +.06em | **UPPERCASE** |
| Buttons `.btn` | Inclusive Sans | 1.125rem | 600 | 1.2 | -.04em | Sentence |
| Nav `.site-nav` | Inclusive Sans | 1rem | 600 | 1.2 | -.03em | Title |
| Brand wordmark | Inclusive Sans | 1.15rem | 600 | 1.2 | -.04em | Title |
| Stat value `.stat-value` | Inclusive Sans | `clamp(2.5rem, 4vw, 3.5rem)` | 600 | 1 | -.04em | — |
| Footnotes `.stat-detail`, `.spec` | JetBrains Mono | .6875rem | 400 | 1.4–1.5 | 0 | Sentence |

Pattern: display type is tracked **negative** and set very tight. Mono micro-labels are tracked **positive** and uppercase. Mono is never set negative, and the display face is never uppercased.

## 3. Color

### Core tokens (`@layer tokens :root` in `/brand/index.css`)

| Token | Hex | Role |
|---|---|---|
| `--color-cream` | `#fbfaf4` | Page canvas (`--color-bg-canvas`), `theme-color` meta |
| `--color-cream-dark` | `#f2f1eb` | Default card fill (`.card`, `.use-case`) |
| `--color-paper` | `#fcfbf7` | `--color-bg-surface` (menus, code blocks) |
| `--color-white` | `#ffffff` | `--color-bg-raised` |
| `--color-ink` | `#0e1113` | Text, primary button fill, focus ring |
| `--color-black` | `#000000` | Accent press |
| `--color-mist` | `#57606a` | `--color-text-muted` |
| `--color-text-secondary` / `--color-accent-hover` | `#2c3134` | Secondary text; primary-button hover |
| `--color-text-faint` | `#9aa1a5` | Disabled, "beta" labels |
| `--color-bg-sunken` | `#f2f1ea` | |
| `--color-bg-inset` | `#e9e8e0` | |
| `--color-bg-placeholder` | `#ededed` | |
| Borders | `rgba(14,17,19,.1)` subtle · `.2` default · ink strong | Hairlines are 1px ink at 10% |

Alpha helpers: `--color-ink-5/10/60` and `--color-cream-5/10/60`. Hover and tint surfaces use `rgba(14,17,19,.05)`.

### Product / theme palette (each model owns one; used for card fills, hover fills, model-page heroes)

| Token | Hex | Ink on it |
|---|---|---|
| `--color-sage` | `#adb49c` | ink |
| `--color-teal` | `#c3d3ce` | ink (also `::selection` bg) |
| `--color-forest` | `#181e1d` | cream |
| `--color-terracotta` | `#db704c` | ink |
| `--color-sand` | `#d6d0c3` | ink |
| `--color-warm-grey` | `#b7b6b4` | ink |
| `--color-clay-red` | `#d53712` | cream |
| `--color-dark-teal` | `#1c525d` | cream |
| `--color-dusty-pink` | `#b6969d` | ink |
| `--color-light-peach` | `#f8dbca` | ink |
| `--color-faun` | `#cec4bb` | ink |
| `--color-cool-grey` | `#dcdedf` | ink |
| `--color-stone` | `#b4aea6` | ink |
| `--color-dark-grey` | `#666967` | cream |

Each theme defines `-fill`, `-ink`, `-sub` (secondary text as ink or cream at 55–90% alpha) and `-line` (10–15% alpha), for example `--color-theme-dark-teal-sub: rgba(251,250,244,.7)`. Components read `--theme`, `--theme-ink`, `--theme-sub` and `--theme-line`, so one class (`.theme-sage`) re-skins a whole panel.

### Signal colors (defined; I did not see them on the marketing pages)

`--color-signal-success #3c8a52` · `warning #c2691a` · `danger #be3a2e` · `info #1e8c8c`

### Other hex values found in the source

`/assets/site.css` also contains `#efeae0`, `#1c1a17` and `#0e111333`. I did not trace which selectors use them. `/brand/index.css` uses `#00000052` (feature-card hover shadow), `#0000001a` (pin hover shadow), `#fbfaf414`, `#fbfaf48c` and `#0e111359` (placeholder icon).

### Light/dark behavior

- The site is **light-only in practice**. Neither stylesheet contains `prefers-color-scheme` (0 occurrences), `:root` sets `color-scheme: light`, and emulating dark mode renders identically (see the screenshot).
- A **dark token set exists** under `[data-theme=dark]`: canvas becomes forest `#181e1d`, surface `#1f2624`, raised `#262e2c`, sunken `#121716`, inset `#2b3331`, text cream, secondary `#d7dbd9`, muted `#9aa5a1`, faint `#6e7975`, selection `#324246`, and the accent flips to cream. No fetched page sets `data-theme`. Dark is designed but not shipped.
- "Dark" moments come from **dark theme panels inside the light page**: the forest, dark-teal and ink feature cards, and the full-bleed dark-teal Voz hero.
- `site.css` derives a muted text color with `color-mix(in srgb, var(--color-text-primary) 72%, var(--color-bg-canvas))` instead of a fixed grey.

## 4. Layout, spacing, density

- **Container:** `.col` has `max-width: var(--container-xl)` = **1172px**, centered (measured x = 134px at 1440). Other tokens: `sm 640`, `md 820`, `lg 1080`, `2xl 1480`.
- **Gutter:** `--gutter: clamp(1.25rem, 5vw, 4rem)`. Header inset `clamp(1.25rem, 3vw, 2.5rem)`. Header height `clamp(5rem, 5vw + 2.5rem, 6.875rem)`.
- **Top padding before content:** `--col-pad-top: clamp(6.5rem, 14vh, 13.25rem)`, so the hero sits well below the nav.
- **Section rhythm on the homepage:** `.col--home { gap: clamp(4rem, 9vw, 7rem) }`, about 112px between sections at desktop. Article pages use `clamp(4rem, 8vw, 6.25rem)`.
- **Spacing scale:** 4px base (`--space-1 .25rem` … `--space-48 12rem`) with half-steps 5, 7, 14, 18 and 25.
- **Text columns stay narrow.** Section copy is capped at `max-width: 602px` (`.intel-copy`, `.try-copy`), prose at 900px and docs at `46rem`. On desktop, headline and paragraph sit left-aligned in the left half, with empty space to the right **(inferred)**.
- **Homepage structure:**
  1. Header: brandmark left; nav right (Models mega-menu, Docs, Blog, About, Contact).
  2. Hero: two-line H1 plus a single mono sub-line. No CTA buttons in the hero.
  3. **Feature-card fan**: full-bleed (`width: 100vw; margin-inline: calc(50% - 50vw)`), 412px-wide cards at aspect `377/550`, overlapping by `-16px`, horizontally scrollable with a hidden scrollbar, drag-to-scroll on mouse, and initial scroll centered.
  4. "We're building the intelligence layer for every app." H2, a mono paragraph, then a **3-column `.card-grid`** (`gap: 1rem`) of 15 model cards (2 columns, then 1, at breakpoints). Beta cards are outlined and transparent, with name and claim at 50% opacity.
  5. "Try it for free. No tokens. No logins." H2, mono copy, then a button row: one solid, two outline.
  6. Footer: 6-column grid (Company / Platforms / Follow / Audio / Text / Vision), a hairline, a mono note, and a language switcher.
- **Model detail page** (`/models/voz/`): full-bleed theme-colored hero at `108svh` with bottom radius `64px`, split into content left and photo right (the photo fades into the theme color via a gradient). Then prose, a stats grid (2x2 bordered stat tiles next to an audio "replay" panel), a benchmark table, use cases (big photo plus three text cards), inspiration prompt cards, a bullet list ("What the model does"), an example app with a code block, Getting started (install and code blocks with copy buttons), and a specs `dl`.
- **Radii are large and soft:** `--radius-md 8`, `lg 12`, `xl 16` (buttons), `2xl 24` (cards), `3xl 32` (feature cards, panels, nav dropdown), `pill 40`.
- **Shadows are sparse and very diffuse:** `--shadow-card: 0 20px 76px rgba(0,0,0,.15)`, `--shadow-photo: 0 20px 100px rgba(0,0,0,.25)`, `--shadow-lg: 0 12px 30px rgba(0,0,0,.15)` (menus). Flat grid cards have no shadow at all.
- **Density:** marketing pages are sparse, with about 3–5 blocks per screen **(inferred)**. Detail pages are much denser: 11px mono footnotes, a 7-row table, and 4 stat tiles on one screen. Type contrast keeps them readable.
- **Breakpoints (max-width):** 1180, 1100, 1000, 900, 860 (nav collapses to a hamburger with a full-screen overlay), 760, 700, 680, 640, 560, 520, 440, and a few in rem. Some rules are guarded by `@media (hover: none)`.

## 5. Motion and interaction

No animation library. All motion is CSS transitions or keyframes plus hand-written vanilla JS.

**Duration and easing tokens**

| Token | Value |
|---|---|
| `--duration-instant` | 80ms |
| `--duration-fast` | .14s (nav hover, button color) |
| `--duration-base` | .22s (card hover) |
| `--duration-slow` | .34s (feature-card tilt, shadow) |
| `--duration-slower` | .52s |
| `--duration-loader` | 2.2s |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` (expo-like) |
| `--ease-in` | `cubic-bezier(.5, 0, .9, .2)` |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` |

Under `prefers-reduced-motion: reduce`, every duration token is set to `0ms`, and `effects.js` checks the same media query and skips its effects.

**Page-load reveal.** An inline head script adds `.js`, then adds `.ready` after two `requestAnimationFrame`s. Elements with `.rise` start at `opacity: 0; translateY(10px)` and transition over `.4s var(--ease-out)`, with staggered delays `.d0`–`.d7` = 30, 80, 130, 180, 230, 290, 360 and 460ms. This runs once, top to bottom, on load, not on scroll.

**Hover states**

- Grid `.card`: background changes from `#f2f1eb` to **that model's theme color**, with `translateY(-2px)`, over `.22s`. Text flips to cream on dark themes. The pill background becomes `color-mix(ink 15%)`. This is the site's signature interaction.
- `.feature-card.tilt--settle:hover`: `rotate(calc(var(--tilt) * .7)) translateY(-8px) scale(1.02)`, and the shadow deepens to `0 32px 100px #00000052` (.34s ease-out). On the homepage fan, `site.css` resets card transforms and rotation is removed at mobile width (flat cards in the 390px screenshot). I did not map exactly which media query wraps those overrides.
- Inline `--tilt` values on the homepage cards: -4.77°, 0°, -2.6°, 3.2°, 7.83°, -1.17°, 5.42°.
- `.pin` (prompt cards): at rest `rotate(var(--tilt))`; on hover `rotate(0) translateY(-6px)` with `0 16px 32px #0000001a`, and action buttons fade in.
- `.prompt-card`: `translateY(-2px)` plus `--shadow-sm`. Clicking copies the prompt, and a "Copied to clipboard" overlay fades in for 1400ms.
- Nav links: `opacity: .6` on hover. The dropdown chevron rotates 180°.
- `.btn`: color change only, plus `:active translateY(1px)`.
- Links: underline `1px`, `text-underline-offset: .18em`.
- Focus: `outline: 2px solid ink; outline-offset: 3px` everywhere.

**Scroll-driven.** The model-page hero uses native CSS scroll timelines: `animation: hero-lift; animation-timeline: scroll(root block); animation-range: 0 80vh`, with `@keyframes hero-lift { to { transform: translateY(-40vh) } }` and easing `cubic-bezier(.4,0,.6,1)`. The next section overlaps the hero with a `-40vh` margin. There is no JS scroll listener anywhere (`effects.js` contains no "scroll").

**Canvas / SVG "text effects"** (`/brand/js/effects.js`, about 29 KB, framework-free IIFE exposed as `window.DALEffects`)

- Registry of `data-effect` names: `strike, underline, underline-thick, bubble, scribble, rays, contour, draw, marker, circle, box, focus, ticks, wave, redact, cut, question, blur, noise, pixelate, outline, pulse, wipe, dissolve, speak`.
- SVG marks (underline, scribble, circle…) are generated as wobbly, seeded-random hand-drawn paths and animated by `stroke-dashoffset` with `cubic-bezier(0.45, 0, 0.2, 1)`, at about 90ms per 100px, clamped to 450–2600ms.
- Canvas effects (`noise`, `pixelate`, `wipe`, `speak`, …) draw text into a 2D canvas (DPR capped at 2) with rAF easing functions (cubic out, cubic in-out). For example, `wipe` runs 900ms, `speak` 520ms, and `pixelate` defaults to 1400ms.
- Triggers: an IntersectionObserver reveal (`threshold .15`, `rootMargin 0 0 -10% 0`), and a replay on `pointerenter` only for `(hover: hover) and (pointer: fine)`.
- In use on the pages I fetched: `speak` on /models/voz/ and `outline` on /about/.
- **No WebGL** (the string does not appear).
- **Hero grain.** Homepage "Little brains" and About "The cerebellum" use `.fx-grain`: three stacked copies of the text, each filtered through inline SVG filters (`#da-grain-back`, `#da-grain-front`, `#da-grain-paper`). The filters use `feGaussianBlur` (stdDeviation 17.6 / 5.4 / 4.0), `feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="6"`, and an arithmetic composite, which gives a spray-paint stipple halo around solid letters. The effect is static.

**Other.** The mega-menu is a native `<details>`/`<summary>` panel (`radius-3xl`, `shadow-lg`, 3-column grid of 40px photo thumbnails plus name and kind). The language switcher is a listbox popover. The Voz page has an audio "replay" widget (`/assets/replay.js`) with a device toggle (iPhone 17 Pro / M3 Ultra) and a running clock. The homepage hides the fan scrollbar (`scrollbar-width: none`).

## 6. Imagery, iconography, illustration

- **Photography:** square WebP (1632px plus 816px srcset), editorial portraits of young, diverse people. They are film-graded with muted tones and grain, often motion-blurred or double-exposed, and colored to match the card's theme **(inferred)**.
- **Hand-made overlays:** white or cream handwritten words and loose outline strokes laid over photos (`.fc-deco` positioned per card, e.g. `.fc--clear .fc-deco { left: 28.4%; top: 21%; width: 39%; rotate(3.5deg) }`). They make the AI product feel human **(inferred)**.
- **Photo-to-color fades:** `.fc-img--bleed:before` fades the card color over the top 38% of the photo using relative color syntax `rgb(from var(--fc-bg) r g b / 0)`. The model hero fades the photo in from the left over 54% of its width.
- **Nav thumbnails:** 40px, radius 8, photo crops.
- **Brandmark:** a 40×38 rounded square (rx 9) at 10% ink with a solid pixel-grid "ant" glyph built from rectangles. It sits at 23×22 in the header.
- **Icons:** few, thin (1.5–2.4px stroke), round caps. A custom mask-image chevron, globe, caret, arrow and document icons on buttons, and the Hugging Face emoji logo on "Model card". There is no icon library.
- **Data illustration:** outlined bars (`.board-fill` with a 2px ink border, filled only for "us"), dot rows, and a tall outlined rectangle versus a thin line in the About "470x less energy" panel. The charts are drawn in the same ink-on-theme language as the type.

## 7. Copywriting voice

- **Short, declarative, concrete.** "Little brains in every product." "Studio sound, no cloud bill." "Rough sketch. Perfect shape." "Try it for free. No tokens. No logins."
- **Numbers do the persuading:** "Transcribe 10 minutes of audio in 2s on an iPhone", "4.7x faster than Whisper", "470x less energy for the same job", "free up to 100k monthly active devices per platform".
- **Honest caveats in small print.** The benchmark note says Voz loses to Whisper on most sets and wins on meetings. "The iPhone timings and the whisper.cpp comparison are our own runs and are not on the card yet." Methodology is always given in a mono footnote.
- **Metaphor used sparingly and explained:** "the cerebellum for every product", with a paragraph on what the cerebellum actually does.
- **Speaks to builders:** "Copy a prompt into your coding agent and go." An `llms.txt` catalog is linked. Product names are one-word nicknames (Voz, Uhm, Emo, Gist, Redact).
- Sentence case everywhere. Uppercase is reserved for mono labels. No exclamation marks and no hype adjectives beyond "lightning fast".

## 8. Tech-stack signals

- **No JS framework.** The pages are static HTML (Organization and other JSON-LD in `<script type="application/ld+json">`). JS is small vanilla IIFEs and ES modules (`nav.js` 1.2 KB, `copy.js` 0.9 KB, `pinboard.js` 0.6 KB, `main.js` 8.6 KB, `effects.js` 29 KB, plus `replay.js` on model pages). No React, Next, Astro, GSAP, Lenis, Framer Motion or Three.js strings were found.
- **Modern CSS:** cascade `@layer critical, tokens, base, components, utilities`; `color-mix()`; relative color syntax `rgb(from …)`; `:has()`; `text-wrap: balance/pretty`; `animation-timeline: scroll()`; `100svh`; CSS custom-property design tokens. The brand system lives at `/brand/` (tokens, components, effects) and is separate from site-specific `/assets/site.css`.
- Code blocks carry `.shiki` classes, so syntax highlighting is Shiki, probably at build time since no Shiki runtime is loaded **(inferred)**. Minified output suggests a bundler or SSG pipeline **(inferred; not identifiable)**.
- **Hosting:** Cloudflare (`server: cloudflare`, `cf-ray` headers). i18n in 12 locales via path prefixes, with a `lang` cookie set by the switcher.
- Accessibility care: `aria-expanded` on toggles, Escape closes menus, `:focus-visible` rings, 44px minimum language items, 24px minimum footer link targets, reduced-motion support, and no-JS fallbacks for `.fx-grain`.

## 9. What makes it feel premium, and what Pemby should borrow or avoid

### Why it feels premium

1. **Restraint in color with one strong idea.** The canvas is cream and ink. All the color comes from a curated muted palette, one color per product, shown on hover and in heroes.
2. **Type contrast.** Huge, tight, negatively tracked grotesk against small, airy, positively tracked mono labels. The mono body signals "engineers wrote this".
3. **A complete token system** (color roles, per-theme sub and line alphas, spacing, radii, durations, easings) applied consistently, so every page feels like one object.
4. **Tactility:** real grain, hand-drawn marks, rotated cards, very soft long shadows.
5. **Evidence-first copy** with footnoted methodology and admitted weaknesses. That builds trust.
6. **Quiet, fast motion:** 140–340ms transitions, expo-out easing, a single 400ms load stagger, and nothing that follows the scroll except one hero lift.

### Borrow for Pemby

- **The cream/ink neutral base and role-based tokens** (`bg-canvas / surface / raised / sunken / inset`, `text-primary / muted / faint`, 10%/20% ink hairlines). They carry over directly to an app shell and are easy on the eyes in long job-search sessions.
- **Display sans plus mono pairing, used by role:** mono for metadata such as salary ranges, locations, tech stacks, dates posted, and status pills (uppercase, +.06em). Display face for job titles, company names and headings. Mono labels suit a developer and IT audience. **Use mono for metadata, not body text, inside the app**; see Avoid.
- **The per-entity theme pattern** (`--theme`, `--theme-ink`, `--theme-sub`, `--theme-line`) for categories or pipeline stages (e.g. Saved / Applied / Interviewing / Offer), used sparingly: hover fills, a stage chip, a panel accent.
- **Data components:** `.table` (mono, 14px, uppercase 11px headers, tabular nums, hairline rows, highlighted "is-us" row with a dot), `.stat` tiles with a big display number, uppercase label and mono footnote, and `.board` outlined bar comparisons. These map straight onto job-match scores, salary comparisons and application funnels.
- **Honest, footnoted voice** for anything algorithmic: explain match scores, show data sources and dates, admit uncertainty. That is the trust lever a job product needs.
- **Card hover to theme fill with a 2px lift over 220ms**, `:active translateY(1px)` on buttons, 2px ink focus rings with 3px offset, and the reduced-motion token zeroing.
- **Large, soft radii (16–24px) with near-zero shadows on in-flow cards.** Keep strong shadows only for overlays (menus, popovers).
- **Plain-spoken copy:** short declaratives with a concrete number ("Apply to 12 roles in 5 minutes"-style claims only if true).

### Avoid, or keep to marketing pages only

- **Mono as the paragraph font inside the app.** At 16px/1.7 it is wide and slows scanning of long job descriptions. Use the sans (or a readable text face) for descriptions and reserve mono for data.
- **Hero line-heights of .73–.85 and -.06em tracking** anywhere outside a landing-page hero. They break with long job titles and localization.
- **Rotated or fanned cards, pinboard tilts, and drag-to-scroll carousels in the app.** They hurt alignment, scanability and keyboard use in dense lists. They are acceptable as a single landing-page flourish.
- **Grain filters and canvas text effects** in functional UI. They are decoration and cost performance (`feTurbulence` with 6 octaves, per-element canvases). At most one on a marketing hero.
- **Light-only shipping.** Developers expect dark mode. Desert Ant already defines a forest-based dark token set but does not use it; Pemby should ship both and honor `prefers-color-scheme`.
- **Density of marketing pages.** About 112px section gaps and 602px text columns are wrong for an app. Pemby's app needs a tighter spacing scale (8–16px row rhythm), multi-column list/detail layouts and sticky filters.
- **Low-contrast "sub" colors.** Some theme sub-text alphas (e.g. cream at 55% on forest) and 11px mono footnotes in muted grey may fall short of WCAG AA for body-critical information. Check contrast before borrowing.
- **Stock-editorial portrait photography** as a core motif. It fits a consumer-flavored AI brand; for job search it risks looking like fake "success" imagery. Prefer real company logos, data and product UI.
