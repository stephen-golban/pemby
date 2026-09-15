# 13. Claude Code GitHub Action for the misclassification-fix loop

Researched 2026-09-15. Sources are primary only: the `anthropics/claude-code-action` repo (README, `docs/`, `action.yml`, `src/`), code.claude.com docs, Anthropic pricing and legal pages, and GitHub docs. Quotes are verbatim. Anything I could not confirm from a primary source is marked **UNVERIFIED**.

Short URL keys used below:

- `[GHA-doc]` https://code.claude.com/docs/en/github-actions
- `[setup]` https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md
- `[security]` https://github.com/anthropics/claude-code-action/blob/main/docs/security.md
- `[usage]` https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
- `[faq]` https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md
- `[action.yml]` https://github.com/anthropics/claude-code-action/blob/main/action.yml
- `[auth]` https://code.claude.com/docs/en/authentication
- `[legal]` https://code.claude.com/docs/en/legal-and-compliance

---

## 1. Current setup

### Version

- Use the moving major tag `anthropics/claude-code-action@v1`. Every example in `[GHA-doc]` uses it.
- The latest release is **v1.0.225**, published 2026-09-15T00:44:47Z. Releases ship almost daily: v1.0.222 came out on 09-11, v1.0.223 on 09-12 and v1.0.224 on 09-14. Source: https://api.github.com/repos/anthropics/claude-code-action/releases
- `@beta` is legacy. To upgrade, "Change `@beta` to `@v1`", "Replace `direct_prompt` with `prompt`", and move `max_turns`/`model` into `claude_args` (`[GHA-doc]` "Upgrade from beta").
- Given that release pace, pin to a full commit SHA and let Dependabot bump it. This is general GitHub hardening advice. I did not re-fetch GitHub's hardening guide for this note, so the citation is **UNVERIFIED**.

### Modes and triggers

There are two modes (`[GHA-doc]` "Interactive and automation modes"):

- **Interactive mode** applies "when the workflow provides no `prompt` input". Claude waits for the trigger phrase, `@claude` by default, "in an issue or pull request comment, in a pull request review, or in the body or title of a newly opened issue".
- **Automation mode** applies "when the workflow provides a `prompt` input". Claude "runs without waiting for a mention". Results go to the run log unless the prompt tells Claude to post and a posting tool is allowed.

How each trigger is handled, per `src/github/validation/trigger.ts` and `src/modes/detector.ts` in the repo:

| Trigger | Supported? | Evidence |
|---|---|---|
| `issues: opened` | Yes. In interactive mode it fires when the title or body contains the trigger phrase. With a `prompt` it always runs. | `trigger.ts`: "If prompt is provided, always trigger"; the phrase is regex-matched on issue body and title. `[usage]` example: `issues: types: [opened, assigned, labeled]` |
| `issues: labeled` | Yes. Input `label_trigger`: "The label name that triggers the action when applied to an issue". The default in `action.yml` is `"claude"`. | `[usage]` inputs table; `[action.yml]` lines 15-18; `trigger.ts` compares `payload.label.name` case-insensitively |
| `issues: assigned` | Yes, via `assignee_trigger` | `[usage]` |
| `@claude` mention | Yes, on `issue_comment`, `pull_request_review_comment` and `pull_request_review` | `[GHA-doc]` "Respond to @claude mentions" |
| `schedule` | Yes, in automation mode (`prompt` required). "GitHub runs scheduled workflows only from the default branch and, in public repositories, disables the schedule after 60 days without repository activity." | `[GHA-doc]` "Run on a schedule" |
| `workflow_dispatch` | Probably yes. `[security]` says "`workflow_dispatch`, `repository_dispatch`, and `schedule` events are not checked separately". But `docs/custom-automations.md` still lists "`workflow_dispatch` - Manual workflow triggers (coming soon)". The docs contradict each other, so a dispatch-driven automation run is **UNVERIFIED** until tested. | https://github.com/anthropics/claude-code-action/blob/main/docs/custom-automations.md |

A trap for Pemby's design is that bot-created issues do not trigger workflows:

- GitHub docs: "events triggered by the `GITHUB_TOKEN` will not create a new workflow run, with the following exceptions: `workflow_dispatch` and `repository_dispatch` events always create workflow runs." Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- `[faq]` says the same: "The `github-actions` user cannot trigger subsequent GitHub Actions workflows."

So if the daily job opens issues with `GITHUB_TOKEN`, an `issues: opened` workflow never fires. Section 4 turns this into a feature.

### Required GitHub App and permissions

Setup:

- Quick setup is `/install-github-app` inside `claude`. "You must be a repository admin to install the GitHub app and add secrets" (README: https://github.com/anthropics/claude-code-action).
- Manual setup is to install https://github.com/apps/claude, add a secret, and copy `examples/claude.yml` (`[setup]`).

What the app grants:

- The action relies on three of the app's permissions: "**Contents**: read and write", "**Issues**: read and write" and "**Pull requests**: read and write" (`[GHA-doc]` Manual setup).
- The official app is shared with Code Review and web auto-fix. Installing it grants Actions RW, Checks RW, Contents RW, Discussions RW, Issues RW, Members R, Metadata R, Pull requests RW, Repository hooks RW, Statuses R and **Workflows RW**. "GitHub doesn't let you accept a subset." (`[GHA-doc]` "GitHub App permissions")
- The sources disagree about Workflows. `[faq]` still says "The GitHub App for Claude doesn't have workflow write access", while `[security]` lists Workflows RW as "requested but not yet actively used". Treat the official app as able to write workflows.
- For least privilege, create a **custom GitHub App** with only Contents, Issues and Pull requests. "A custom app covers only the Claude Code GitHub Action" (`[GHA-doc]`; manifest and steps in `[setup]` "Using a Custom GitHub App").

Workflow `permissions:` in the doc examples:

```yaml
contents: write
pull-requests: write
issues: write
id-token: write   # "required for the Claude Code GitHub Action's default GitHub App authentication"
actions: read     # optional, lets Claude read CI results
```

Source: `[GHA-doc]`. GitHub notes: "If you specify the access for any of these permissions, all of those that are not specified are set to `none`." Source: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

What the action can and cannot do with PRs:

- In interactive mode Claude "Creates commits on a branch and links back to a prefilled PR creation page". It cannot approve PRs or merge branches. Source: https://github.com/anthropics/claude-code-action/blob/main/docs/capabilities-and-limitations.md
- In automation mode, whether Claude can open the PR itself depends on the tools you allow. The exact tool name for creating a PR (for example `mcp__github__create_pull_request`, or `Bash(gh pr create:*)`) is **UNVERIFIED**. The docs only show `mcp__github__list_commits` and `mcp__github__list_issues`.

---

## 2. Authentication options

### Options at a glance

| Option | Input | Source |
|---|---|---|
| Claude API key | `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` | `[GHA-doc]`, `[setup]` |
| Subscription OAuth token | `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` | `[GHA-doc]`, `[setup]` |
| Workload Identity Federation (no static key) | `anthropic_federation_rule_id`, `anthropic_organization_id` (+ optional service account and workspace IDs), plus `id-token: write` | `[setup]` "Workload Identity Federation" |
| Amazon Bedrock | `use_bedrock: "true"` | `[GHA-doc]` "Use a cloud provider" |
| Google Cloud Agent Platform (formerly Vertex) | `use_vertex: "true"` | same |
| Microsoft Foundry | `use_foundry: "true"` | same |

For the cloud providers: "With all three providers, you authenticate through OIDC identity federation instead of a Claude API key" (`[GHA-doc]`). "Bedrock, Vertex, and Microsoft Foundry use OIDC authentication exclusively" (https://github.com/anthropics/claude-code-action/blob/main/docs/cloud-providers.md). `/install-github-app` quick setup does not cover them, and they need a custom GitHub App (`[setup]`).

### Subscription token (`claude setup-token`)

Anthropic documents this path for GitHub Actions:

- `[GHA-doc]`: "`CLAUDE_CODE_OAUTH_TOKEN`: an OAuth token that authenticates with your Claude subscription, available on Pro, Max, Team, and Enterprise plans. Generate one by running `claude setup-token` locally."
- `[auth]` "Generate a long-lived token": "For CI pipelines, scripts, or other environments where interactive browser login isn't available, generate a one-year OAuth token with `claude setup-token`". Also: "This token authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan. It can only make model requests".
- `[auth]` precedence list, item 5: "`CLAUDE_CODE_OAUTH_TOKEN` ... Use this for CI pipelines and scripts where browser login isn't available."
- `[GHA-doc]` "Manage costs": "If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing."
- `[GHA-doc]` org setup: "authenticate with an API key ... rather than an OAuth token, since an OAuth token is tied to the subscription of the person who ran `claude setup-token`."

**Is it allowed?** For the founder's own repo, Anthropic's docs explicitly document it for CI. The governing terms still matter:

- `[legal]`: Claude Code use is governed by the "Consumer Terms of Service - for Free, Pro, and Max users".
- Consumer Terms §3(7) prohibits accessing the Services "through automated or non-human means, whether through a bot, script, or otherwise", "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it" (https://www.anthropic.com/legal/consumer-terms). The Claude Code docs above are the explicit permission for the CI token.
- `[legal]`: "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code". Also: "Anthropic does not permit third-party developers ... to route requests through Free, Pro, or Max plan credentials on behalf of their users."
- `[legal]`: "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."

Whether a daily, unattended fix bot counts as "ordinary, individual usage" is **UNVERIFIED**. The docs neither forbid nor bless a specific volume. The token must never serve Pemby's end users: it only runs maintenance on the founder's own repo.

**Usage limits on the subscription:**

- "Both Pro and Max plans offer usage limits that are shared across Claude and Claude Code, meaning all activity in both tools counts against the same usage limits." Source: https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- The pricing page describes a rolling five-hour window: "Pro gives you at least 5x more usage per 5-hour session than Free. Max gives you 5x or 20x more usage per 5-hour session than Pro." It also mentions weekly caps. Source: https://claude.com/pricing
- Hitting "You've hit your session limit" or "You've hit your weekly limit" blocks further use until reset, unless usage credits are on (https://code.claude.com/docs/en/costs).

The practical effect is that CI runs eat into the founder's interactive Claude Code budget, and a limit hit makes the CI run fail.

**Risks on a public repo:**

- The token is personal and lasts a year. If it leaks through prompt injection or logs, it spends the founder's subscription.
- `[security]` recommends short-lived tokens where possible and warns about `show_full_output`: "These logs are publicly visible in GitHub Actions for public repositories!"

### Bedrock and Vertex for a cash-poor founder

Both bill per token to the cloud account (https://code.claude.com/docs/en/costs, "Cloud providers"). They are only worth it if Pemby already has cloud credits. The setup cost is OIDC plus a custom app.

---

## 3. Cost

### GitHub Actions minutes

- "GitHub Actions usage is **free** for **self-hosted runners** and for **public repositories** that use standard GitHub-hosted runners." Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- "Larger runners are always charged for, even when used by public repositories" (same page). Stick to `ubuntu-latest`.
- The default job timeout is "360" minutes (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Set a much lower value.

### Token cost

Per-token list prices (https://platform.claude.com/docs/en/about-claude/pricing):

| Model | Input | 5m cache write | Cache hit | Output |
|---|---|---|---|---|
| Claude Opus 5 | $5 / MTok | $6.25 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Sonnet 5 | $2 / MTok | $2.50 / MTok | $0.20 / MTok | $10 / MTok |
| Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $0.10 / MTok | $5 / MTok |

The same page says Sonnet 5's $2/$10 "is now the standard price" and the planned September 2026 increase "will not occur". Claude 4.7 and later models use a tokenizer that "produces approximately 30% more tokens for the same text".

Anthropic publishes no per-run figure for the Action. The only benchmark is "the average cost is around $13 per developer per active day" for interactive enterprise use (https://code.claude.com/docs/en/costs). That does not map to one CI task.

**Illustrative estimate (UNVERIFIED, my own assumptions).** Assume one fix run is about 20-30 turns: roughly 150k tokens of fresh input and cache writes, 1.5M tokens of cache reads, and 40k output.

- Sonnet 5: 0.15M × $2.50 + 1.5M × $0.20 + 0.04M × $10 ≈ **$1.10**
- Opus 5: 0.15M × $6.25 + 1.5M × $0.50 + 0.04M × $25 ≈ **$2.70**

Measure real runs from the `modelUsage` result output before trusting either number.

With the subscription token, runs cost no marginal dollars but consume plan limits (section 2).

### Ways to cap spend

Documented controls:

- `claude_args: "--max-turns N"`. CLI: "Limit the number of agentic turns ... Exits with an error when the limit is reached. No limit by default." Source: https://code.claude.com/docs/en/cli-reference
  - The action parses `max-turns` out of `claude_args` and passes it to the SDK (`base-action/src/parse-sdk-options.ts` lines 207-208 in the repo), so this cap works in the Action.
- `--model claude-sonnet-5` (or `haiku`). Without it, the Action "uses the Claude Code default model" (`[GHA-doc]` "Pass CLI arguments").
- `--max-budget-usd 3.00`. CLI: "Maximum dollar amount to spend on API calls before stopping (print mode only)" (cli-reference).
  - The action forwards unknown `claude_args` flags to the CLI as `extraArgs` (`parse-sdk-options.ts`), but I did not confirm that the SDK path enforces this flag. **UNVERIFIED.** With an OAuth token the dollar figure is only a local estimate.
- Job `timeout-minutes`. `[GHA-doc]`: "Set workflow-level timeouts to avoid runaway jobs". The repo's `examples/issue-triage.yml` uses `timeout-minutes: 10`.
- `concurrency`. `[GHA-doc]`: "Use GitHub's concurrency controls to limit parallel runs". GitHub: "only a single job or workflow using the same concurrency group will run at a time."
- A Console workspace spend limit, for API keys: "set workspace spend limits on total Claude Code spend" (https://code.claude.com/docs/en/costs). This is the only hard dollar ceiling on the Anthropic side.
- A short `CLAUDE.md`. `[GHA-doc]`: "Keep your `CLAUDE.md` concise, since Claude reads it on every run".
- Pemby-side volume control: cap the daily job at N issues and one agent run per issue.

---

## 4. Security on a public repo

### Who can trigger the action

- `[security]`: "The action can only be triggered by users with write access to the repository. This is checked for issue, pull request, comment, and review events". Also: "`workflow_dispatch`, `repository_dispatch`, and `schedule` events are not checked separately — GitHub itself requires write access to dispatch a workflow, and scheduled runs have no external actor."
- `[GHA-doc]` "Who can trigger runs" describes two checks:
  - "**Write access**: on issue and pull request events, the triggering user must have write access".
  - "**Human actor**: on every event, the Claude Code GitHub Action rejects a bot actor unless you list it in `allowed_bots` ... This check also applies to scheduled runs, which GitHub attributes to a repository user, usually the one who last changed the workflow's `cron` schedule."
- Source detail: the checked actor is `GITHUB_ACTOR`, meaning **who performed the event**. For `issues: labeled` that is the person who applied the label, not the issue author (`src/github/validation/permissions.ts`, `actor.ts`). A maintainer labeling a bot-authored issue therefore passes both checks.

### `allowed_non_write_users` (avoid)

`[security]`:

- "**This is a significant security risk and should only be used for workflows with extremely limited permissions**".
- It "Only works when `github_token` is provided as input".
- It adds a "best-effort scrub" of secrets from subprocess environments. That "reduces but does not eliminate prompt injection risk".
- "**Do not use a personal access token**" with it.

The repo's `examples/issue-triage.yml` uses `allowed_non_write_users: "*"`, but only with `contents: read` and `issues: write`. A code-writing workflow must not do this.

### `allowed_bots` (avoid `'*'`)

`[security]`:

- "**Allowed bots are not checked for repository permissions.** ... On a **public repository**, external parties — including GitHub Apps created by anyone — may be able to trigger workflow events such as opening issues ... If your workflow listens on those events and `allowed_bots` is set to `'*'`, any such App can invoke this action with a prompt it controls."
- "Prefer an explicit list over `'*'`".

### Prompt injection from issue text

- `[security]`: "External contributors may include hidden instructions through HTML comments, invisible characters, hidden attributes, or other techniques." The action strips "HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities, but new bypass techniques may emerge."
- `include_comments_by_actor` limits "which users' comments are passed to Claude". `exclude_comments_by_actor` filters bots out (`[security]`, `[usage]`).
- By default Claude "cannot execute Bash commands unless explicitly allowed". In automation mode "Claude has no shell or GitHub API access until you grant the tools the prompt needs, with `--allowedTools`" (capabilities doc; `[GHA-doc]`).

**Pemby-specific point:** our own bot writes the issues, but the anonymized job-post examples are **third-party text** from employers and aggregators, and the user flags are user input. Treat the whole issue body as untrusted even though a trusted account wrote it.

Mitigations that follow from the docs:

- Allow only file edit tools and the exact test commands.
- Give no network or `gh` tools beyond what is needed.
- Grant minimal `permissions:`.
- Never set `show_full_output`.
- Require human review before merge.

### Secrets on forks and `pull_request_target`

- GitHub: for fork PRs, "secrets are not passed to the runner when a workflow is triggered from a forked repository. The `GITHUB_TOKEN` has read-only permissions". Also: "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities." Source: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- `[security]`: "`pull_request_target` and `workflow_run` execute with the **base repository's secrets**", and "**Do not check out an untrusted ref into the workspace root before this action.**"
- `[GHA-doc]`: "On public repositories, GitHub withholds secrets from runs triggered by fork pull requests".
- For Pemby, the fix workflow triggers on `issues` events, not PRs, so neither applies. Do not add `pull_request_target`.

### Limiting runs to bot-created issues with a maintainer-applied label

GitHub's `GITHUB_TOKEN` rule (section 1) means a bot-opened issue fires nothing. Only a human label event triggers the fix. Combine that with job-level `if:` guards on the webhook payload.

- `github.event.label.name == 'autofix-approved'` checks the label. `label_trigger` is also compared in `trigger.ts`, but with a `prompt` set the action "always trigger[s]", so the workflow `if:` is the real gate.
- `github.event.issue.user.login == 'github-actions[bot]'` (or the custom app's `<app>[bot]`) checks the issue came from our bot.
- `github.event.sender.login` in a hard-coded maintainer list checks who applied the label. GitHub docs: "Most webhook payloads include a `sender` property identifying the user who triggered the event" (https://docs.github.com/en/webhooks/webhook-events-and-payloads). The action's write-access check is a second layer.
- Restricting who can apply labels at all: on GitHub only triage or write roles can label. The exact role matrix is **UNVERIFIED** here (not fetched).

### Merge gate

- GitHub branch protection: "require that all pull requests receive a specific number of approving reviews before someone merges" (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- Claude "cannot approve pull requests" (capabilities doc).
- On a solo repo, a required approving review can block the founder's own PRs. Whether an admin bypass or a ruleset fits better is a config choice I did not verify.
- If you pass `github_token: ${{ secrets.GITHUB_TOKEN }}`, CI won't run on Claude's commits: "GitHub doesn't trigger workflows on commits made with the default `GITHUB_TOKEN`" (`[GHA-doc]` Troubleshooting). Use the Claude App or a custom app token instead.
- For `GITHUB_TOKEN` to create PRs at all, a repo setting is needed: "Allow GitHub Actions to create and approve pull requests" (https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

---

## 5. OpenRouter or other non-Anthropic endpoints

### What the action passes through

- `action.yml` line 342 forwards `ANTHROPIC_BASE_URL: ${{ env.ANTHROPIC_BASE_URL }}` and `ANTHROPIC_CUSTOM_HEADERS` to Claude Code. So setting `ANTHROPIC_BASE_URL` in the job `env:` reaches the CLI.
- There is no `base_url` input.
- `docs/configuration.md` says: "When `ANTHROPIC_BASE_URL` points to an Anthropic-compatible API gateway, Claude Code may not be able to verify that the gateway supports a model's native 1M context window" (https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md).
- `action.yml` does **not** forward `ANTHROPIC_AUTH_TOKEN`, which is the bearer credential Claude Code uses for gateways (`[auth]` precedence item 2). Only `ANTHROPIC_API_KEY` (sent as `X-Api-Key`) is forwarded. Whether a job-level `ANTHROPIC_AUTH_TOKEN` still reaches the subprocess is **UNVERIFIED**; the action's own comment claims its step `env:` "shadows the calling workflow's job-level env vars".

### Anthropic's position

From https://code.claude.com/docs/en/llm-gateway:

- "Any gateway that exposes a supported API format works. Anthropic doesn't endorse, maintain, or audit third-party gateway products, and doesn't support routing Claude Code to non-Claude models through any gateway."
- Supported formats are "Anthropic Messages" (`/v1/messages`, selected by `ANTHROPIC_BASE_URL`), Bedrock InvokeModel and Vertex rawPredict (https://code.claude.com/docs/en/llm-gateway-protocol).
- The gateway must forward `anthropic-beta` and `anthropic-version` unchanged. Otherwise features fail with `400` errors or prompt caching silently stops ("the conversation bills as uncached input on every turn").
- If only `ANTHROPIC_BASE_URL` is set and a saved subscription login is active, "its usage limits and billing apply".

### Verdict

- **Claude models through an Anthropic-Messages-compatible gateway:** technically works. Anthropic does not support or audit it.
- **Non-Claude models (GPT, Qwen and so on) through OpenRouter:** explicitly **not supported** by Anthropic.
- **OpenRouter's Anthropic-format endpoint:** whether it exists, and whether it forwards `anthropic-beta`, `cache_control` and streaming pings correctly, is **UNVERIFIED**. I did not consult OpenRouter's docs because they were outside the allowed sources.
- **Recommendation:** use an Anthropic API key or the subscription token for this Action, and keep OpenRouter for Pemby's runtime parsing (see `07-openrouter-integration.md`).

---

## Recommended secure workflow design

**Flow.**

1. The daily job (existing Pemby code, `GITHUB_TOKEN`, `issues: write` only) opens `misclassification` issues. This triggers no workflows.
2. The founder reads an issue and applies the label `autofix-approved`.
3. That human event starts the fix workflow below.
4. Claude pushes a branch and opens a PR.
5. CI runs, branch protection holds the merge, and the founder merges by hand.

```yaml
# .github/workflows/autofix.yml  (outline; no secrets inline)
on: { issues: { types: [labeled] } }
concurrency: { group: autofix, cancel-in-progress: false }
jobs:
  fix:
    if: >-
      github.event.label.name == 'autofix-approved' &&
      github.event.issue.user.login == 'github-actions[bot]' &&
      contains(fromJSON('["<founder-login>"]'), github.event.sender.login)
    runs-on: ubuntu-latest          # standard runner = free on public repos
    timeout-minutes: 30
    permissions: { contents: write, pull-requests: write, issues: write, id-token: write }
    steps:
      - uses: actions/checkout@<full-sha>            # base branch, no PR ref
      - uses: anthropics/claude-code-action@<v1.0.x-sha>
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}  # or anthropic_api_key + Console spend limit
          prompt: "/fix-misclassification ISSUE: ${{ github.event.issue.number }}"  # repo skill; issue text is DATA
          claude_args: >-
            --model claude-sonnet-5 --max-turns 30
            --allowedTools "Read,Edit,Write,Bash(pnpm test:*),Bash(pnpm vitest:*),Bash(git add:*),Bash(git commit:*),Bash(git push:*)"
```

**Rules for the design:**

1. **Trigger only on a human label.** Bot-opened issues can't fire workflows, and `if:` checks the label, the bot author and the maintainer `sender`. Leave `allowed_bots` and `allowed_non_write_users` unset.
2. **Pin both actions to commit SHAs** and let Dependabot bump them. The action releases almost daily.
3. **Use least-privilege tokens.** Prefer a custom GitHub App with only Contents, Issues and Pull requests over the official app, which also grants Workflows RW. Don't pass `GITHUB_TOKEN` as `github_token`, or CI won't run on Claude's commits.
4. **Credentials:** start with `CLAUDE_CODE_OAUTH_TOKEN`, which costs nothing extra but shares the founder's plan limits and is a one-year personal token. Switch to an API key in a dedicated Console workspace with a spend limit if volume grows or the account-risk tradeoff changes.
5. **Cap spend:** `--max-turns`, `timeout-minutes: 30`, a single `concurrency` group, Sonnet 5 by default, and at most N labeled issues per day.
6. **Treat issue content as untrusted.** The `.claude/skills/fix-misclassification` skill tells Claude that job-post text is test data. The only write actions are adding fixtures, editing the parser rule or prompt, running tests, and pushing a `claude/` branch.
7. **Allowlist tools** to file edits plus exact `pnpm test` and git commands. Give no `curl`, no general `gh`, no MCP servers, and never set `show_full_output` or `ACTIONS_STEP_DEBUG`.
8. **No PR-triggered agent runs:** no `pull_request_target`, no `workflow_run` on fork PRs, and never check out an untrusted ref.
9. **Protect the merge:** protect `main` with required CI status checks and a manual merge. Put `.github/workflows/` and `.claude/` under CODEOWNERS so Claude-authored changes there stand out in review.
10. **Before relying on the flow, verify the UNVERIFIED items:** `--max-budget-usd` enforcement, the automation-mode PR-creation tool name, and `workflow_dispatch` in automation mode.
