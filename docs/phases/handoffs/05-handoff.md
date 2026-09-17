# Phase 05 handoff: AI layer, enrichment, eligibility engine

Written 2026-09-17. Built, reviewed and running on staging and production. **Remaining: the production
enrichment backfill (owner said "not yet") and the 24h worker stability window.**

## What shipped (all on `main`, CI green)

| Commit | Unit |
|---|---|
| `a090d6e` | `@pemby/ai` runtime: `runStructuredTask` (JSON schema, zod, one repair retry, client-side fallbacks, one `ai_usage` row per attempt, cost from the response or estimated), daily cap guard, owner cap alert (Telegram, Resend fallback), `routing.json` in private config; migrations 0004 (enum) and 0005 |
| `7c3bb9f` | `packages/core/src/eligibility`: `rules/`, `regions/`, `engine/`, `llm/`, `signals.ts` |
| `980f38e` | Worker jobs `enrich.*` and `company-evidence.*`, scripts `enrich:once`, `company-evidence:once` |
| `239f225` | `eval/` (122 labels, runner, pipelines), model comparison report, PLAN D19 amended |
| `fa9f88d` | Company evidence "all over the world" wording; the script recomputes job tiers after writes |

Private config `stephen-golban/pemby-private` commit `08aa152`, tag **`config-v0.3.0`**: prompts
`job-enrichment` 0.3.1, `company-evidence` 0.2.2.

## Definition of done

| Item | Status |
|---|---|
| Eval report with chosen routing | `eval/reports/2026-09-17-model-comparison.md` (numbers only) |
| Enrichment on staging sample | Done: 37 jobs (25 newest + 12 varied), no errors, $0.31 per 1,000 jobs |
| Enrichment in production over all open jobs | **Pending, owner decision.** Worker ready; set `ENRICH_ENABLED=true` (suggested `ENRICH_SWEEP_LIMIT=100`, `ENRICH_CONCURRENCY=4`: ~1 day, ~$2.70) |
| `ai_usage` totals shown | Staging this phase: about $0.04 in total (evidence in the session scratchpad, summary on the progress page) |
| Cap tested by lowering it | Done on staging: `AI_DAILY_CAP_USD=0`, the sweep logged `skipped=capped`, no `ai_usage` rows, one Telegram alert delivered (`ai_cap_alerts.delivered_via=telegram`) |
| Two dry ZDR requests | Public key → `nvidia/nemotron-3-super-120b-a12b:free`: 200. Private key → same model: 404 `No endpoints found matching your data policy (Zero data retention)`, `failed_routing_step: Filter by Data Policy` |
| Company evidence rows with source pages | Staging: 10 companies, 40 rows (Wikimedia, PostHog, Canonical, Temporal). Production sweep enabled, first run 2026-09-18 04:20 UTC |
| 10 enriched jobs on the progress page | Done (version 10) |

## Accuracy and cost (final engine `engine-2026-09-17.7`, rules `rules-2026-09-17.5`)

| Pipeline | Tuning (78 posts) | Holdout (44, no longer blind) | False greens | Per 1,000 jobs |
|---|---|---|---|---|
| Rules only | 88.5%, greens 8/15 | 83.0%, greens 4/9 | 0 | $0 |
| Rules + gpt-oss-120b (**production**) | 82.9%, greens 8/15, 9 false reds | 79.5%, greens 4/9, 5 false reds | 0 | $0.36 (staging measured $0.31) |
| Rules + Gemini 3.1 Flash-Lite (fallback) | 83.8%, greens 2/15 | 79.9%, greens 2/9 | 0 | $4.66 |
| Rules + Nemotron free (dropped) | 54.3% (35–52% of posts failed) | 38.3% | 0 | $0 |

Company evidence extraction on 12 hand-checked companies: Gemini 7/7 correct, gpt-oss 6/7 (one wrong green).

## Deviations from the phase file, and why

1. **Labeling by AI, not the owner** (owner request). Owner set the rubric (4 rules, `eval/README.md`);
   two blind Opus labelers per session, lead adjudicated (agreement 220/240, 238/240, 264/264). Labels say
   `ai-pair+lead`. Same model family, so errors can correlate.
2. **Holdout set added** (session 3, 44 posts) because the engine was tuned on sessions 1–2; it was run
   once frozen, then re-scored after two engine bug fixes, so it is no longer blind.
3. **Routing changed from PLAN D19**: gpt-oss-120b primary for enrichment, Gemini for careers pages,
   Nemotron free dropped (owner decision).
4. **Two keys for green**: a rules green needs an agreeing model reading and no unexplained location text
   (`rules.unaccounted`). Company evidence is capped at yellow (`COMPANY_EVIDENCE_MAX_TIER`) until its
   extractor has its own eval. Result of three blind adversarial reviews (false greens), all confirmed
   findings fixed; attack scripts kept in the session scratchpad, not the repo.
5. **Eval ways**: only `b2b-contractor` and `eor-employee`; the worker computes those plus freelance and
   relocation-visa for `TARGET_COUNTRIES`; `local` and `paid-program` are not computed yet.

## New env vars, services, config

- Worker: `AI_DAILY_CAP_USD` (0–3, lowers only), `OWNER_ALERT_EMAIL`, `ENRICH_ENABLED`, `ENRICH_SWEEP_LIMIT`,
  `ENRICH_SAMPLE_MAX_JOBS`, `ENRICH_CONCURRENCY`, `COMPANY_EVIDENCE_ENABLED`, `COMPANY_EVIDENCE_MAX_AGE_DAYS`,
  `COMPANY_EVIDENCE_SWEEP_LIMIT` (all in `.env.example`).
- Staging worker: `AI_DAILY_CAP_USD=1`, `ENRICH_ENABLED=false`, `ENRICH_SAMPLE_MAX_JOBS=67`, references to shared
  OpenRouter, owner chat id and Resend vars, `TELEGRAM_BOT_TOKEN=${{bot.TELEGRAM_BOT_TOKEN}}`.
- **Production `worker` service** (new): `APP_ENV=production`, `PRIVATE_CONFIG_REF=config-v0.3.0`,
  `INGEST_DISABLED_ATS=smartrecruiters`, `ENRICH_ENABLED=false`, `COMPANY_EVIDENCE_ENABLED=true`, shared references
  (production bot token confirmed as `@pemby_app_bot`). First ingest: 300 boards, 7,381 jobs, no errors.
- **Start commands** (worker prod and staging, bot staging): `cd apps/<app> && exec node --import tsx src/index.ts`,
  draining 30 s. pnpm 12 does not forward SIGTERM (pnpm#9948), so `pnpm --filter … start` never shut down
  gracefully. Set via GraphQL `environmentPatchCommit`; `railway environment edit` silently did nothing.
- DB: migrations 0004/0005 applied on staging and production (tables `ai_cap_alerts`; new columns on `ai_usage`,
  `job_enrichment`, `job_eligibility`, `eligibility_evidence`, `companies`).

## UNVERIFIED items

- Resolved (research 10 "Verified in phase 05"): request fields, `usage.cost` by default, free quota per account
  resetting 00:00 UTC, ZDR refusal is 404, structured outputs for gpt-oss and Gemini.
- Still open: whether free embedding models share the free daily quota; how `reasoning` maps on NVIDIA's free
  endpoint; `native_tokens_*` vs `tokens_*` in `/generation` (use native; not yet in research 10).

## Known issues

- **Secrets exposure (owner to decide on rotation):** a worker's `railway variable list --json` printed production
  values (DB URL, OpenRouter keys, Telegram token, Resend key) into its local session transcript. Not written
  anywhere else.
- The model lowers overall accuracy versus rules alone (more yellows become white/red); tune in phase 07.
- Greens are rare by design; "Georgia" in a list stays white/yellow unless Tbilisi or the country is explicit.
- Evidence excerpts sometimes quote company boilerplate instead of the deciding line (e.g. unexplained-text caps).
- 24h worker stability is unproven: redeploys this session restarted it (latest staging worker `983181ef`,
  production `c26bd6a9`). No crash or OOM seen; peak memory 576 MB staging, 430 MB production.
- Company evidence finds statements for 3–4 of 10 companies; GitLab's country table is often missed.
- Staging and production share OpenRouter keys; each environment caps only its own spend (2 × cap combined).
- Enrichment `ENRICH_SAMPLE_MAX_JOBS` counts the 30 demo `job_enrichment` rows on staging.

## Notes for next phases

- Matching (07) reads `job_eligibility` (scope = country code, `reason`, `evidence`, `engine_version`); reason keys
  and params for i18n are in `packages/core/src/eligibility/engine/reasons.ts`. Only pairs for `TARGET_COUNTRIES`.
- Flags (09): call `requestCompanyEvidenceRecheck(boss, companyId, "flag")`; after evidence writes,
  `recomputeEligibilityForCompany` rebuilds tiers without model calls.
- Re-run the eval after any rules, engine or prompt change: `pnpm --filter @pemby/eval eval:run --pipeline rules-only
  --sessions 1,2`; LLM pipelines replay from `eval/.cache/` (gitignored) or cost ~$0.03 per run on gpt-oss.
