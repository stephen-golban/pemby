# Phase 12: the self-improving loop and hired share cards

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` D14, D24, D26, D27, section 6
- `docs/research/13-claude-code-github-action.md` (all of it)
- `docs/phases/handoffs/11-handoff.md` and the beta feedback collected so far

## Goal

Beta flags and outcome reports turn into anonymized GitHub issues. When the owner labels one, a Claude
Code GitHub Action proposes a fix PR with new eval cases, and a maintainer-run eval workflow posts the
eval score before and after. Users who landed a role can share a card that earns them a free month.

## In scope

1. **Issue digest.** A daily worker job groups flags and "rejected for location" reports into
   misclassification patterns and opens GitHub issues through a dedicated bot account or GitHub App.
   Issues contain no personal data: anonymized job text excerpts, the expected vs actual tier, counts.
   One issue per pattern; update instead of duplicating.
2. **Fix workflow.** `anthropics/claude-code-action@v1` (check the latest release and docs first)
   triggered only when a maintainer applies the `pemby:fix` label, with `if:` checks on the label, the
   issue author (our bot) and the labeler. Auth with the owner's `claude setup-token` token as a repo
   secret; an API key fallback documented. Limits: max turns, job timeout, concurrency 1. The prompt
   treats the issue body as untrusted data. The job receives no OpenRouter keys and no private prompts
   or private config. It only proposes changes: rules, public eval label cases in `eval/`, and a PR
   description. No `pull_request_target`, no `allowed_non_write_users`, no bot wildcard. The owner
   merges by hand. If a fix needs a private prompt change, the PR says so and the owner applies it.
3. **Eval workflow.** A separate `workflow_dispatch` workflow that only maintainers can run, under
   standard GitHub permissions. It holds the OpenRouter key and private-config access, runs the
   eligibility accuracy check on a PR branch, and posts the before and after numbers as a PR comment.
4. **Share cards.** "Landed a role?" generates a share image and page ("Started as <role>, remote
   <way of working> from <country>. Matched with Pemby.") with the user's choice of what to show. Sharing
   grants a free month once. Cards go through /impeccable; images are rendered in code (for example an
   OG image route), not generated per user.
5. **Landing proof.** With the user's consent, approved user stories can appear on the landing page.
   Nothing invented.

## Owner tasks

- Create the bot identity for opening issues: a GitHub App or a machine account.
- Install the Claude GitHub app on the repo.
- Add the `claude setup-token` token and the eval workflow secrets as repo secrets.

## Suggested work orders

- A (opus): issue digest job using the owner's bot identity. Owns `apps/worker/src/digest/`.
- B (opus): the fix workflow file and its prompt. Owns `.github/workflows/pemby-fix.yml` and its prompt file.
- C (opus): share cards, share page, reward, landing proof slot, through /impeccable. Owns those routes.
- D (opus): the maintainer-only eval workflow. Owns `.github/workflows/pemby-eval.yml`.

A fresh subagent runs a D16 wording review over the share card, share page and landing proof copy.

Adversarial review (fresh, blind, required): the workflows' trigger conditions, secret exposure
including that the fix job gets no OpenRouter keys or private config, who can run the eval workflow,
prompt-injection handling, permissions.

## Checkpoint with the owner

The owner labels one real digest issue and reviews the resulting PR.

## Definition of done

- A real digest issue exists with no personal data (the owner confirms).
- A labeled issue produced a PR; an unlabeled issue and an issue by a non-bot author did not trigger a run (show the skipped runs).
- The fix workflow job has no OpenRouter or private-config secrets; a maintainer run of the eval workflow posted before and after numbers as a comment on that PR.
- A share card renders and grants the month once; the D16 wording review found no violations, or they were fixed.
- Account export and deletion cover the tables this phase adds: share cards and user stories.
