---
version: 1
slug: "apps-web-app-brief-page-tsx"
primary_target: "apps/web/app/brief/page.tsx"
related_targets: ["apps/web/app/onboarding/page.tsx","apps/web/app/profile/page.tsx","apps/web/app/settings/page.tsx"]
---

## Direction contract

THESIS: The app wears a bold, high-contrast, friendly product identity and stays a working tool inside
it. It refuses the warm print world this app ships today — mono body text, hairline rules, flat ruled
ledgers — and equally refuses the quiet neutral SaaS dashboard of sidebar, breadcrumb and badge soup.
Owner-pinned from a supplied reference image, which overrides the roll.

OWN-WORLD: Pure white sheet #FFFFFF with generously rounded corners, sitting on near-black #0B0B0B
bands that show at the top and bottom of a page. Ink #101010, secondary #6E6E73. Four flat saturated
accents used as SOLID FILLS and never as tints or gradients: yellow #FFC629, red #F03A3F, blue #1B6BFF,
green #17A35B. Red is a blocker colour only and is never an eligibility verdict. One heavy geometric
grotesk with a large x-height carries everything: display at 800 weight, poster scale, tight tracking
and tight leading, sentence case; body in the same family at 400/500. No serif, no monospace anywhere.
Components: fully-rounded black pill buttons with white text; fully-rounded white pill inputs with a
soft shadow and a solid black circular icon button at the end; white cards at 24px radius with a soft
wide diffuse shadow, layered and overlapping on Persuade surfaces and stacked evenly on Operate ones;
solid accent rounded squares at ~14px radius as icon tiles with white line icons; an outlined pill
holding a long right arrow. Flat vector illustration with bold black outlines and flat accent fills
over simple geometric colour blocks — marketing surfaces only, never inside the app. Eligibility is
never colour alone: a tier tile plus a tinted tier pill plus its word. Motion is short and confident,
cards settling and arrows sliding, zeroed under prefers-reduced-motion. Light is the design; dark is a
token swap of the same world.

STORY: The visitor meets a product that is loud about one honest thing — it only shows work that can
legally hire them — and then gets quiet and precise the moment they are inside it. On the marketing
surfaces the type does the persuading at poster scale and the product is shown doing its job. Inside
the app the same palette and type carry a working screen: what came in, whether it can hire you, why,
and the one thing you are short. They act in the card they are reading. There is never a feed and
never a search.

FIRST VIEWPORT: `/brief` at 1440, on the white sheet, no black band. A light nav row: wordmark at the
left, four text destinations centred with the open one in full-strength heavy ink and the rest in warm
grey, a small black circular button at the right. Then generous space, then the day's result as one
sentence at poster scale in heavy near-black, two lines, nothing above it, with the date and the
freshness line beneath it in warm grey, stating the gate the matcher actually enforces — roles
verified live within the last FRESHNESS_HOURS, interpolated, never a hardcoded number. The 12-hour
figure is the ingest cadence and belongs to the marketing copy, not to this gate. Then the matches as white cards at 24px radius with a
soft wide shadow, stacked with clear gaps, each laid out horizontally: a solid tier-coloured rounded
tile at the far left carrying the tier's own marker, then the role title in heavy ink at large size
with the company beneath it and the tinted tier pill inline, then the reasons as light grey tag pills,
then the gap line in warm grey; at the right end the score as a very large heavy numeral with a black
pill Apply beneath it and Save / Not for me as quiet text links. Below, one full-width near-miss card
carrying "Near misses" in heavy ink and three blocker counts, each a solid accent tile with a large
numeral and its reason. At the foot, the permanent tier legend. The approved comp is
`.impeccable/mocks/pin-brief.png`; the world it renders is recorded in
PRODUCT.md; the image it was derived from is third-party, held locally and not published.

FORM: Owner-pinned from a reference image supplied 2026-09-21 and approved at the comp round. Not drawn
from the seeded hand; it overrides seed key 6da647dd, re-roll round 1, whose assigned direction and
every alternate were declined, as was round one's hand and the Things/Craft/Bear canon rendition that
followed. The reference is a third-party job-board landing page: its palette, type, components,
illustration language and energy carry over; its text, claims, statistics, company logos, search bar,
employer affordances and information architecture do not, because Pemby has no feed, no search, no
employer accounts, no users and no metrics.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict,
DESIGN.md, and every shipping raster carrying its provenance.
