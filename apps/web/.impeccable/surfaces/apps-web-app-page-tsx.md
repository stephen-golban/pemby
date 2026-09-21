---
version: 1
slug: "apps-web-app-page-tsx"
primary_target: "apps/web/app/page.tsx"
related_targets: ["apps/web/app/pricing/page.tsx","apps/web/components/cv-drop"]
---

## Direction contract

THESIS: The landing page persuades at poster scale with one honest claim — only the work that can
actually hire you — and proves it by showing the product's own verdict on screen. It refuses the warm
editorial print world this site ships today, and it refuses the category's search-bar-and-feed hero
outright, because Pemby has neither.

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

FIRST VIEWPORT: `/` at 1440. The white sheet with rounded corners on the near-black band. Nav row:
circular black logo mark and wordmark at the left, four quiet text links centred, a black pill "Drop
your CV" at the right. Left half: the headline at poster scale in heavy near-black, sentence case,
three lines, with an outlined pill holding a long right arrow set inline after the first line. Beneath
it the subheading in warm grey, then the CV drop as a fully-rounded white pill input with a soft shadow
carrying the file prompt, a divider, the country, and a solid black circular upload button. Right half:
a flat vector figure with binoculars in a yellow top over flat red and blue geometric blocks, with two
white cards at 24px radius layered over it and each other — one showing today's roles with their tier
tiles and a quiet "See the reasons" link, one showing a single verdict with its reason and its
verification age. Across the black band at the foot, three facts, never statistics: the tiers and that
every verdict shows its reason, the 12-hour re-check, and the six ways of working. The approved comp is
`.impeccable/mocks/pin-landing.png`; the world it renders is recorded in
PRODUCT.md; the image it was derived from is third-party, held locally and not published.

FORM: Owner-pinned from a reference image supplied 2026-09-21 and approved at the comp round. Not drawn
from the seeded hand; it overrides seed key 6da647dd, re-roll round 1. The reference is a third-party
job-board landing page: its palette, type, components, illustration language and energy carry over; its
text, claims, statistics, company logos, search bar, employer affordances and information architecture
do not. Specifically banned here and replaced with product truth: any member, company or hire count;
"people got hired"; real company logos; a job search field; "Post a Job"; "Hire".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict,
DESIGN.md, and every shipping raster carrying its provenance.
