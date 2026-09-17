# Eligibility accuracy check

The one test-like thing in Pemby (PLAN D24). It holds about 60 real job posts that the owner and the
lead labeled by hand, plus a script that runs the eligibility pipeline on them and scores it.

Scope: Moldova (MD) plus two more target countries the owner picks (Ukraine UA and Georgia GE for
now), for the ways of working `b2b-contractor` and `eor-employee`. Local and paid programs are
out of scope for now. The country set is a parameter (`--countries MD,UA,GE`, known codes in
`src/countries.ts`).

## Tiers (PLAN D2)

| Tier     | Meaning                                                                    |
| -------- | -------------------------------------------------------------------------- |
| `green`  | Hires from your country: the post or company says so.                      |
| `yellow` | Likely: region or worldwide wording, contractor/EOR openness, no blockers. |
| `white`  | Unclear: no evidence either way. Never read as open.                       |
| `red`    | Excluded: country or region list without you, citizenship, on-site abroad. |

Label each (country, way of working) pair on its own. A post can be `green` for B2B and `red` for
EOR.

## What counts as a mistake

Zero false greens matters more than overall accuracy.

- **False green**: the pipeline says `green`, the label is `yellow`, `white` or `red`.
- **False red**: the pipeline says `red`, the label is `green` or `yellow`.

## Files

| Path                        | What                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `labels/<id>.json`          | One labeled post: public post snapshot plus a tier for every pair.      |
| `candidates/session-N.json` | Posts pulled for labeling session N, with key sentences. Not labels.    |
| `src/schema.ts`             | Zod schemas of both formats.                                            |
| `src/pull-candidates.ts`    | Picks candidates from the staging database (read-only).                 |
| `src/sheet.ts`              | Builds the local HTML labeling sheet from a candidates file.            |
| `src/import-labels.ts`      | Validates a sheet export and writes `labels/<id>.json`.                 |
| `src/pipeline.ts`           | `EligibilityPipeline` adapter interface and the `baseline-white` floor. |
| `src/run.ts`                | Runs a pipeline on all labels and prints the scores.                    |

Snapshots are public post text. Emails and phone numbers are replaced with `[email]` and `[phone]`
when a post is pulled. No applicant data goes in here.

## Workflow

Commands run from the repo root. `@pemby/eval` scripts run inside `eval/`, so relative paths are
relative to `eval/`.

1. **Pull candidates** (about 80, so about 60 survive triage), split into two balanced sessions:

   ```sh
   RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/eval eval:pull
   ```

   Only open, non-demo, canonical jobs (`duplicate_of_job_id is null`). Each post gets one bucket:
   `emea`, `eu-work-authorization`, `europe-region`, `contractors-worldwide`, `bare-remote`,
   `country-list`, `us-only`, `latam-or-other-region`, `timezone-only`, `mentions-target-country`,
   `onsite-hybrid-elsewhere`. At most 2 posts per company. `why` says which heuristic matched;
   "(weak match)" means it was a fallback pick. The seed (`--seed`, default 5) makes a re-pull
   pick the same posts while the data is unchanged; `--seed` also accepts an arbitrary string,
   hashed to a number, for a distinct reproducible order. `--count` sets the total (default 80).
   `--session N` pulls a single `candidates/session-N.json` instead of splitting into two, and
   `--exclude-labeled` drops every job id already in `labels/*.json` or the existing session 1/2
   files, capping companies already used there to 1 post in the new pull.

   Session 3 is a holdout set, pulled with `--session 3 --exclude-labeled` so it never overlaps
   sessions 1 and 2. Engine, prompt or scoring changes are never tuned against it; it is only run
   once a candidate pipeline is otherwise settled, for the model comparison and the final report.

2. **Build the labeling sheet** outside the repo, since it is a working file:

   ```sh
   pnpm --filter @pemby/eval eval:sheet candidates/session-1.json /path/to/scratch/label-session-1.html \
     [--prefill proposed.json]
   ```

   Open it in a browser (it works from `file://`, makes no network calls, and autosaves in
   localStorage). Keys: `j`/`k` post, `h`/`l` pair, `g y w r` (or `1`-`4`) set the tier and move
   on, `a` accept the proposed tiers, `s` skip the post, `n` note, `d` description, `Esc` leave a
   note. Proposed tiers (prefill) are dashed and do not export until confirmed. Prefill format:
   `{ "<post id>": { "MD": { "b2b-contractor": "green", "eor-employee": "white" } } }`.
   **Export labels** downloads or copies the labeled, non-skipped posts.

3. **Import** the export:

   ```sh
   pnpm --filter @pemby/eval eval:import /path/to/labels-session-1.json --session 1
   ```

   Nothing is written if any post is invalid. Existing files need `--force`.

4. **Run** a pipeline:

   ```sh
   pnpm --filter @pemby/eval eval:run --pipeline baseline-white
   pnpm --filter @pemby/eval eval:run --pipeline-module ./path/to/adapter.ts \
     --json /path/to/scratch/report.json --report-md ../docs/eval/report.md
   ```

   It prints accuracy, the confusion matrix, every false green and false red (label id, country,
   way, expected, got, reason), accuracy per bucket and per pair, latency, and cost when the
   adapter reports usage. `--json` includes label ids and reasons, so keep it local.
   `--report-md` is numbers only and safe to commit.

## Labels

Rubric (owner-approved 2026-09-17). Tiers are set per (country, way of working) pair. Countries:
MD, UA, GE (the country).

1. **Worldwide without engagement type.** "Worldwide", "anywhere" or "across the globe" with no
   engagement type is yellow. Green needs worldwide wording plus an engagement type that fits the
   way ("contractors worldwide" makes B2B green; "employees in any country via EOR" makes EOR
   green).
2. **Employee posts and B2B.** If an employee-style post opens a region that includes the country
   and says nothing about contractors, B2B gets the same tier as EOR, capped at yellow. An explicit
   exclusion (for example, "no contractors") still overrides this.
3. **Time zone bands.** A band that leaves the country out is red when it is required ("must", "to
   be considered") and yellow when it is only preferred or recommended.
4. **Regions.** Europe, EMEA and Eastern Europe are yellow for MD, UA and GE, Georgia included. A
   region alone never makes green. EU, EEA and Schengen are red for all three.
5. **Named country or city.** A named country or city with no engagement type is green for both
   ways. Mark such posts low confidence for the owner.

**Provenance (`labeledBy`).** `owner+lead` means the owner and the lead labeled directly.
`ai-pair+lead` means two independent AI labelers applied the owner-approved rubric above, with
disagreements adjudicated by the lead (owner decision 2026-09-17, to save the owner's time). All 78
current `labels/*.json` files are `ai-pair+lead`. Agreement between the two AI labelers before
adjudication was 220/240 (session 1) and 238/240 (session 2).

## Adding a pipeline

Implement `EligibilityPipeline` from `src/pipeline.ts`: `evaluate(snapshot, countries, ways)`
returns one verdict `{ country, wayOfWorking, tier, reason }` per pair, either as an array or as
`{ verdicts, usage: { costUsd, inputTokens, outputTokens, calls } }`. Register it in `PIPELINES`, or
pass a module whose default export is the pipeline with `--pipeline-module`. A missing verdict or a
thrown error counts as `none`, which is always wrong.
