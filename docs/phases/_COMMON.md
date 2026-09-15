# Rules for every Pemby phase session

Read this before your phase file. It applies to every phase.

## Your role

You are the lead for one phase. You follow `~/.claude/CLAUDE.md`: plan the phase, split it into
work orders, run independent orders as parallel `Agent` subagents with clear file ownership, review
every diff yourself, and commit only after the owner approves. You do not write project source
yourself. You may write plan, work-order, handoff and progress markdown.

The owner is a senior engineer (7 years) and the founder. They are present for checkpoints and commit
approvals. They care most about earning money soon and building a public reputation, so keep
momentum and don't gold-plate.

## Read first, every time

1. `docs/PLAN.md` for decisions. Do not reopen a decision without asking the owner.
2. Your phase file.
3. The latest file in `docs/phases/handoffs/` and any handoff your phase depends on.
4. `docs/PROGRESS.md` for the progress page URL and staging details (created in phase 01).
5. Only the research files your phase lists. Don't read all of them.

## Hard rules

- **No test suites.** Workers do not write unit, integration or E2E tests. Proof is typecheck, lint,
  build and a real run of the changed flow (browser for UI, a script or curl for workers and APIs).
  The only exception is the eligibility accuracy check in `eval/`.
- **Optimistic UI.** Every user mutation updates the screen immediately and rolls back on failure,
  using TanStack Query mutations with `onMutate` and rollback, or React `useOptimistic`.
- **Design goes through /impeccable only.** Any UI work invokes the `impeccable` skill and follows its
  flow. desertant.com is a binding brand reference (`docs/research/05-design-reference-desertant.md`).
- **Never use Higgsfield.** For image generation use Codex CLI, verified on 2026-09-15:
  `codex exec --skip-git-repo-check -C <dir> --sandbox workspace-write -i <ref.png> -- "<prompt>"`.
  The `--` is required, otherwise `-i` swallows the prompt and nothing happens with exit 0. The image
  is saved to `~/.codex/generated_images/<session>/`; confirm the file really exists where you expect.
- **Wording rules (PLAN D16).** In UI copy, emails, bot messages, metadata and posts, Pemby is "AI
  job-matching software; you apply yourself". Never: job board, recruiter, recruitment, placement,
  get hired, guaranteed job, auto-apply, scrape, beat the ATS, "we write your CV".
- **Privacy.** Anything containing personal data (CVs, profiles, kits, CV embeddings) uses the private
  OpenRouter key with zero data retention. The public key only ever sees public job posts. Extract CV
  text ourselves; never send files to OpenRouter PDF plugins. The same per-request ZDR applies when a
  user's own OpenRouter key is used.
- **Public repo.** The repo is public AGPL-3.0. Never commit secrets, prompts, scoring weights or
  source lists. Use the private config mechanism chosen in phase 01.
- **English copy, i18n-ready.** All user-facing strings go through the i18n layer from phase 01.
- **Verify before relying.** Research items marked UNVERIFIED that your phase depends on get checked
  against the primary source first. Library versions and APIs are checked against current docs, not
  memory.
- **Railway work uses the `use-railway` skill.** GitHub: never run `gh auth switch`.
- **Model routing for workers.** Opus for judgment and multi-file work, Sonnet for well-specified
  mechanical edits, Haiku for lookups. Effort never above `high`. State the model in each order.

## Progress visibility

- After every completed work unit: deploy to staging (`staging.pemby.app`) if it touches a running
  service. From phase 04 onward, such a unit also deploys to production, behind the owner-only access
  gate from phase 01. Then update the progress page. It is a claude.ai artifact; its URL is in `docs/PROGRESS.md`.
  Read it with the Artifact tool, then republish with `url`. It shows screenshots of changed screens
  (desktop 1440 and mobile 390), done / in progress / next against this phase, links to try things on
  staging, known issues, and decisions waiting on the owner.
- Check the artifact's comments at the start of the session and after each unit; act on those sent to
  Claude and resolve the ones you addressed.
- Once a day of active work, send the owner a short summary (PushNotification if available, otherwise
  in the conversation).

## Review and commit

- Review every worker diff in full. Call a fresh, blind adversarial reviewer for risky changes: auth,
  payments, personal data, migrations, the eligibility engine, webhooks, or anything too big to hold in
  your head. Say in one line when you skip it and why.
- Re-run the proof yourself (typecheck, lint, build, the flow) and check exit codes.
- Ask the owner before each commit. Commit messages end with the attribution line from the session's
  system reminder.

## Close-out

A phase is done when its definition of done is met with evidence and the owner has approved the
commits. Then:
1. Write `docs/phases/handoffs/NN-handoff.md`: what shipped (commits), deviations from the plan and
   why, new env vars and services, UNVERIFIED items resolved or still open, known issues, and notes
   for the next phase. Keep it under 150 lines and use file paths, not pasted code.
2. Update the phase's Status cell in `docs/PLAN.md` section 7.
3. Update the progress page to show the phase complete.
4. Tell the owner which phase file to start next, in a fresh session.

If the context gets heavy before the phase is done, stop at a clean boundary, write the handoff with
what remains, and tell the owner to continue in a fresh session with the same phase file.
