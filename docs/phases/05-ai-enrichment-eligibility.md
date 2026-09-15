# Phase 05: AI layer, job enrichment and the eligibility engine

Read `docs/phases/_COMMON.md` first. This phase builds Pemby's core promise. Take the eligibility
logic seriously and call an adversarial review on it.

## Read first

- `docs/PLAN.md` D2, D3, D11, D16–D19, D24 and section 4
- `docs/research/02-location-eligibility.md` (all of it)
- `docs/research/07-openrouter-integration.md` and `docs/research/10-openrouter-free-models.md`
- `docs/phases/handoffs/04-handoff.md`

## Goal

Every ingested job gets structured enrichment and per-country, per-way-of-working eligibility with
evidence and a human-readable reason. A labeled eval set measures accuracy, and its results pick the
production models. AI spend is metered and capped.

## In scope

1. **`packages/ai`.** OpenRouter client via the Vercel AI SDK provider. Key classes: public, private
   (ZDR enforced by the key's guardrail plus `provider.zdr: true` on every personal-data request), user
   (placeholder for phase 09). Account-level ZDR stays off, because it would block the free Nemotron
   route. Research 07 says to enable ZDR account-wide; follow research 10 on this point instead. Prove
   the setup with one dry request in each direction: the public key reaches the free Nemotron route,
   and a private-key request is refused by a provider without ZDR. Model routing from private
   config with fallbacks on errors, 402 and 429. JSON-schema structured outputs with validation and one
   repair retry. Every call writes `ai_usage` with cost from the response. A daily cap of $3 across
   Pemby-paid keys in production: when reached, new work waits in the queue and the owner gets a
   Telegram alert, a simple sendMessage with the bot token from setup to `OWNER_TELEGRAM_CHAT_ID`. If
   the bot token or chat id isn't set, the alert falls back to an email to the owner through Resend.
   Staging is bounded by its per-key credit limits instead, and staging enrichment runs only on a small
   sample of jobs. The free-model daily quota is per account, so staging must not use the free route
   at volume. Confirm current OpenRouter
   parameter names from the docs before coding (research 10 lists UNVERIFIED items).
2. **Rules first.** Deterministic extraction before any LLM call: explicit country lists, "US only",
   "must be authorized to work in", "EMEA", timezone ranges, salary patterns, and schema.org
   `applicantLocationRequirements` when present. The LLM handles what rules can't settle.
3. **Enrichment prompt and schema** (prompt in private config): seniority, stack, domain, salary,
   employment types, allowed ways of working, eligibility per region/country with the quoted evidence
   span, visa sponsorship, timezone constraints, money-asking red flags (D11).
4. **Eligibility engine in `packages/core`.** Combine rules, LLM output, company evidence and (later)
   user reports into a tier per (job, country, way of working), with a short reason string. Keep
   "unclear" as its own state. Include country groupings (EU, EEA, EMEA, Europe, CIS, LATAM and so on)
   with an explicit decision on whether each contains Moldova and other target countries, documented
   in code comments with sources.
5. **Eligibility accuracy check** in `eval/`. The lead and the owner label about 60 real posts pulled
   from ingestion, for Moldova plus two other target countries the owner picks, for example Ukraine and
   Georgia, and for the B2B and EOR ways of working only. Cover the tricky cases in PLAN (EMEA, EU work
   authorization, contractors worldwide, bare "Remote", careers-page country lists). Local and program
   cases are out of the eval for now. Store labels
   (job text snapshot + expected tier per country and way of working). A script runs the engine on the
   set and prints overall accuracy, false greens and false reds. Labeling needs the owner: split it into
   two sessions of about an hour each.
6. **Model selection.** Run the check with the free Nemotron route and the gpt-oss-120b route. Record
   accuracy, false greens, cost and latency. Pick production routing with the owner. Target to discuss
   with the owner: zero or near-zero false greens matters more than overall accuracy.
7. **Backfill** enrichment for all open jobs in production within the cap.
8. **Company evidence.** A job fetches each company's public careers or hiring-policy pages, for
   example /careers, "where we hire" and remote policy pages, on the public key. It extracts the
   countries the company says it hires in and writes `eligibility_evidence` at company level. The
   "doesn't hire from my country" flag rule (PLAN section 6) re-runs it for re-verification.

## Suggested work orders

- A (opus): `packages/ai` client, key routing, usage ledger, cap and alert. Owns `packages/ai/`.
- B (opus): rules extractor and country groupings. Owns `packages/core/src/eligibility/rules/` and `.../regions/`.
- C (opus): enrichment job, prompt, schema, engine that combines signals. Owns `apps/worker/src/enrich/` and `packages/core/src/eligibility/engine/`. Starts after A and B publish interfaces.
- D (sonnet): eval runner script and label file format. Owns `eval/`. The lead runs labeling with the owner.
- E (opus): company evidence job and its extraction prompt in private config. Owns `apps/worker/src/company-evidence/`. Starts after A publishes the client.

Adversarial review (fresh subagent, blind): the engine and region groupings, looking for false greens.

## Checkpoint with the owner

Labeling session, then the model comparison table and the routing decision.

## Definition of done

- Eval report committed (numbers only, no personal data) with the chosen routing.
- Enrichment runs on staging over a small sample and in production over all open jobs, so the backfill builds up early; `ai_usage` totals shown; cap tested by lowering it temporarily.
- The two dry ZDR requests from item 1 behave as expected (show both responses).
- Company evidence rows exist for a sample of companies, each with its source page.
- A sample of 10 enriched jobs with tier, reason and evidence on the progress page.
- Handoff records accuracy, costs per 1,000 jobs, and remaining UNVERIFIED items.
