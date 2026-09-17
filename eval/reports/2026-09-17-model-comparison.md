# Job enrichment model comparison

Date: 2026-09-17. Phase 05, item 6. Numbers only: no post text, no label ids.

## Setup

- Pipelines: `rules-only` (rules extractor and engine, no model), and `rules+llm:<model>` (rules,
  one `job-enrichment` call pinned to the model, the LLM-to-signal mapping, then the engine with
  both keys, as in production). Company evidence is not used.
- Model parameters (all `temperature: 0`, `maxOutputTokens: 6000`, structured output with
  `provider.require_parameters: true`, public key):
  - `openai/gpt-oss-120b`: `reasoning.effort: "low"`
  - `nvidia/nemotron-3-super-120b-a12b:free`: `reasoning.enabled: false`
  - `google/gemini-3.1-flash-lite`: `reasoning.effort: "low"` (every endpoint lists
    `structured_outputs`, `response_format` and `reasoning` in the OpenRouter models API)
- Engine and rules: `engine-2026-09-17.6`, `rules-2026-09-17.4`, the same for every run below.
- Prompts: round 1 `job-enrichment@0.3.0+dir-520262d6` (recomputed afterwards from the saved 0.3.0 text), round 2 and holdout
  `job-enrichment@0.3.1+dir-413f1301` (private config, local directory source).
- Labels: every file is `ai-pair+lead` (two independent AI labelers on the owner-approved rubric,
  disagreements adjudicated by the lead). Agreement before adjudication: 220/240 pairs (session 1),
  238/240 (session 2); session 3 agreement is not recorded in `eval/README.md`.
- Countries MD, UA, GE; ways `b2b-contractor` and `eor-employee`. Each post was run once.
- Concurrency: 4 posts at a time, except Nemotron in round 2 and holdout (1 at a time, after
  429s at 4) and Gemini on the holdout (2 at a time, to stop cleanly at the spend limit).

## Metrics

- False green: predicted green, label yellow, white or red. False red: predicted red, label green or
  yellow.
- Green recall: labeled green pairs predicted green. Yellow-or-better recall: labeled green or
  yellow pairs predicted green or yellow.
- A post whose model call failed (error) or stayed invalid after the repair retry gives no verdict
  (`none`), which counts as wrong. "Accuracy, answered posts only" leaves those posts out.
- Schema outcomes are per post: ok, repaired (valid after the one repair retry), invalid (still
  invalid after it), error (the call failed: HTTP 429, 502, 503, 504 or network).
- Cost is OpenRouter's reported `usage.cost`, including failed and repair attempts. Cost per
  1,000 posts extrapolates the mean cost per post.
- Latency is the model call time per answered post (repair retry included), not wall time.

## Tuning set, sessions 1 and 2 (78 posts, 15 labeled green pairs)

### Round 1, prompt 0.3.0

| Metric                                 | rules-only        | gpt-oss-120b      | nemotron-3-super:free | gemini-3.1-flash-lite |
| -------------------------------------- | ----------------- | ----------------- | --------------------- | --------------------- |
| Posts / pairs                          | 78 / 468          | 78 / 468          | 78 / 468              | 78 / 468              |
| Accuracy                               | 88.5% (414/468)   | 85.0% (398/468)   | 37.0% (173/468)       | 82.5% (386/468)       |
| Accuracy, answered posts only          | 88.5% (468 pairs) | 86.1% (462 pairs) | 77.9% (222 pairs)     | 85.8% (450 pairs)     |
| False greens                           | 0                 | 0                 | 0                     | 0                     |
| False reds                             | 3                 | 9                 | 9                     | 9                     |
| Green recall                           | 53.3% (8/15)      | 0.0% (0/15)       | 0.0% (0/15)           | 13.3% (2/15)          |
| Yellow-or-better recall                | 94.0% (142/151)   | 88.7% (134/151)   | 39.1% (59/151)        | 80.8% (122/151)       |
| Schema ok / repaired / invalid / error | n/a               | 77 / 0 / 1 / 0    | 37 / 0 / 0 / 41       | 73 / 2 / 0 / 3        |
| Model calls                            | 0                 | 79                | 79                    | 80                    |
| Cost total                             | $0                | $0.0240           | $0.0000               | $0.3430               |
| Cost per post                          | $0                | $0.00031          | $0.00000              | $0.00440              |
| Cost per 1,000 posts                   | $0                | $0.31             | $0.00                 | $4.40                 |
| Latency per post, mean / p95           | 21 ms / 40 ms     | 18.8 s / 60.4 s   | 4.6 s / 10.7 s        | 13.2 s / 19.5 s       |

| Bucket (posts)              | rules-only | gpt-oss-120b | nemotron-3-super:free | gemini-3.1-flash-lite |
| --------------------------- | ---------- | ------------ | --------------------- | --------------------- |
| emea (8)                    | 62.5%      | 58.3%        | 20.8%                 | 62.5%                 |
| eu-work-authorization (8)   | 100.0%     | 100.0%       | 25.0%                 | 100.0%                |
| europe-region (6)           | 100.0%     | 83.3%        | 25.0%                 | 83.3%                 |
| contractors-worldwide (8)   | 81.3%      | 81.3%        | 31.3%                 | 68.8%                 |
| bare-remote (7)             | 85.7%      | 100.0%       | 42.9%                 | 85.7%                 |
| country-list (6)            | 83.3%      | 83.3%        | 66.7%                 | 83.3%                 |
| us-only (7)                 | 100.0%     | 85.7%        | 28.6%                 | 100.0%                |
| latam-or-other-region (7)   | 100.0%     | 100.0%       | 42.9%                 | 85.7%                 |
| timezone-only (7)           | 81.0%      | 81.0%        | 38.1%                 | 71.4%                 |
| mentions-target-country (7) | 83.3%      | 64.3%        | 35.7%                 | 69.0%                 |
| onsite-hybrid-elsewhere (7) | 100.0%     | 100.0%       | 57.1%                 | 100.0%                |

### Round 2, prompt 0.3.1

The `rules-only` column is the same run as in round 1.

| Metric                                 | rules-only        | gpt-oss-120b      | nemotron-3-super:free | gemini-3.1-flash-lite |
| -------------------------------------- | ----------------- | ----------------- | --------------------- | --------------------- |
| Posts / pairs                          | 78 / 468          | 78 / 468          | 78 / 468              | 78 / 468              |
| Accuracy                               | 88.5% (414/468)   | 85.5% (400/468)   | 54.3% (254/468)       | 83.3% (390/468)       |
| Accuracy, answered posts only          | 88.5% (468 pairs) | 85.5% (468 pairs) | 83.0% (306 pairs)     | 83.3% (468 pairs)     |
| False greens                           | 0                 | 0                 | 0                     | 0                     |
| False reds                             | 3                 | 3                 | 9                     | 9                     |
| Green recall                           | 53.3% (8/15)      | 26.7% (4/15)      | 26.7% (4/15)          | 0.0% (0/15)           |
| Yellow-or-better recall                | 94.0% (142/151)   | 84.8% (128/151)   | 55.6% (84/151)        | 74.2% (112/151)       |
| Schema ok / repaired / invalid / error | n/a               | 76 / 2 / 0 / 0    | 51 / 0 / 10 / 17      | 76 / 2 / 0 / 0        |
| Model calls                            | 0                 | 80                | 89                    | 80                    |
| Cost total                             | $0                | $0.0279           | $0.0000               | $0.3637               |
| Cost per post                          | $0                | $0.00036          | $0.00000              | $0.00466              |
| Cost per 1,000 posts                   | $0                | $0.36             | $0.00                 | $4.66                 |
| Latency per post, mean / p95           | 21 ms / 40 ms     | 16.6 s / 60.1 s   | 5.6 s / 13.8 s        | 8.0 s / 15.5 s        |

| Bucket (posts)              | rules-only | gpt-oss-120b | nemotron-3-super:free | gemini-3.1-flash-lite |
| --------------------------- | ---------- | ------------ | --------------------- | --------------------- |
| emea (8)                    | 62.5%      | 62.5%        | 43.8%                 | 50.0%                 |
| eu-work-authorization (8)   | 100.0%     | 100.0%       | 62.5%                 | 100.0%                |
| europe-region (6)           | 100.0%     | 83.3%        | 50.0%                 | 83.3%                 |
| contractors-worldwide (8)   | 81.3%      | 81.3%        | 37.5%                 | 68.8%                 |
| bare-remote (7)             | 85.7%      | 85.7%        | 42.9%                 | 100.0%                |
| country-list (6)            | 83.3%      | 83.3%        | 66.7%                 | 83.3%                 |
| us-only (7)                 | 100.0%     | 100.0%       | 71.4%                 | 100.0%                |
| latam-or-other-region (7)   | 100.0%     | 100.0%       | 57.1%                 | 100.0%                |
| timezone-only (7)           | 81.0%      | 81.0%        | 52.4%                 | 81.0%                 |
| mentions-target-country (7) | 83.3%      | 64.3%        | 45.2%                 | 54.8%                 |
| onsite-hybrid-elsewhere (7) | 100.0%     | 100.0%       | 71.4%                 | 100.0%                |

## Holdout, session 3 (44 posts, 9 labeled green pairs), prompt 0.3.1, run once

| Metric                                 | rules-only        | gpt-oss-120b      | nemotron-3-super:free | gemini-3.1-flash-lite |
| -------------------------------------- | ----------------- | ----------------- | --------------------- | --------------------- |
| Posts / pairs                          | 44 / 264          | 44 / 264          | 44 / 264              | 44 / 264              |
| Accuracy                               | 83.0% (219/264)   | 82.6% (218/264)   | 38.3% (101/264)       | 81.4% (215/264)       |
| Accuracy, answered posts only          | 83.0% (264 pairs) | 82.6% (264 pairs) | 76.5% (132 pairs)     | 81.4% (264 pairs)     |
| False greens                           | 0                 | 0                 | 0                     | 0                     |
| False reds                             | 0                 | 5                 | 0                     | 6                     |
| Green recall                           | 44.4% (4/9)       | 0.0% (0/9)        | 0.0% (0/9)            | 0.0% (0/9)            |
| Yellow-or-better recall                | 89.4% (76/85)     | 74.1% (63/85)     | 35.3% (30/85)         | 74.1% (63/85)         |
| Schema ok / repaired / invalid / error | n/a               | 44 / 0 / 0 / 0    | 22 / 0 / 1 / 21       | 44 / 0 / 0 / 0        |
| Model calls                            | 0                 | 44                | 46                    | 44                    |
| Cost total                             | $0                | $0.0159           | $0.0000               | $0.1878               |
| Cost per post                          | $0                | $0.00036          | $0.00000              | $0.00427              |
| Cost per 1,000 posts                   | $0                | $0.36             | $0.00                 | $4.27                 |
| Latency per post, mean / p95           | 23 ms / 40 ms     | 17.2 s / 42.9 s   | 5.0 s / 8.6 s         | 9.0 s / 14.7 s        |

| Bucket (posts)              | rules-only | gpt-oss-120b | nemotron-3-super:free | gemini-3.1-flash-lite |
| --------------------------- | ---------- | ------------ | --------------------- | --------------------- |
| emea (4)                    | 100.0%     | 75.0%        | 25.0%                 | 75.0%                 |
| eu-work-authorization (4)   | 100.0%     | 100.0%       | 50.0%                 | 100.0%                |
| europe-region (4)           | 75.0%      | 75.0%        | 25.0%                 | 75.0%                 |
| contractors-worldwide (4)   | 75.0%      | 75.0%        | 50.0%                 | 50.0%                 |
| bare-remote (4)             | 50.0%      | 87.5%        | 25.0%                 | 75.0%                 |
| country-list (4)            | 83.3%      | 50.0%        | 16.7%                 | 75.0%                 |
| us-only (4)                 | 100.0%     | 100.0%       | 75.0%                 | 100.0%                |
| latam-or-other-region (4)   | 66.7%      | 91.7%        | 16.7%                 | 91.7%                 |
| timezone-only (4)           | 75.0%      | 75.0%        | 50.0%                 | 75.0%                 |
| mentions-target-country (4) | 87.5%      | 79.2%        | 62.5%                 | 79.2%                 |
| onsite-hybrid-elsewhere (4) | 100.0%     | 100.0%       | 25.0%                 | 100.0%                |

## Limitations

- Labels come from two AI labelers plus lead adjudication, not from the owner; the labelers and the
  adjudicating lead are the same model family, so shared blind spots are not caught.
- Small n: 78 tuning posts and 44 holdout posts; 15 and 9 labeled green pairs. One green post
  moves green recall by 13 points (tuning) or 22 points (holdout).
- The engine and the rules were tuned on sessions 1 and 2, and the prompt revision (round 2) was
  made after seeing round 1 on the same sessions. Only the holdout is free of that.
- LLM nondeterminism: each pipeline ran once per round, with no repeat runs, so run-to-run
  variance is unmeasured.
- Nemotron's free endpoint failed on many posts (rate limits and provider overload), so its
  quality numbers cover about half the posts and its error rate depends on the time of day and
  on other traffic on the same account.

## Final scoring after engine fixes (not blind for session 3)

After the frozen holdout run above, two engine-side bugs were fixed (Locations-line quotes
weakened below the second-key threshold; split Locations allow-lists counted as restrictions)
plus a timezone overlap wording rule. The LLM outputs were not re-generated: the same cached
model outputs from the runs above were re-scored with the fixed engine, 0 new model calls.
Because the holdout results had already been seen when the engine was fixed, the session 3
numbers in this section are no longer a blind holdout.

Engine and rules: `rules-2026-09-17.5`, `engine-2026-09-17.7`. Prompt (unchanged, cached outputs
only): `job-enrichment@0.3.1+dir-413f1301`. Nemotron was not re-scored (dropped; see "Chosen
routing" below).

### Tuning set, sessions 1 and 2 (78 posts, 15 labeled green pairs)

| Metric                  | rules-only                               | gpt-oss-120b                             | gemini-3.1-flash-lite                    |
| ----------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Accuracy                | 88.5% (414/468)                          | 82.9% (388/468)                          | 83.8% (392/468)                          |
| False greens            | 0                                        | 0                                        | 0                                        |
| False reds              | 3                                        | 9                                        | 9                                        |
| Green recall            | 53.3% (8/15)                             | 53.3% (8/15)                             | 13.3% (2/15)                             |
| Yellow-or-better recall | 94.0% (142/151)                          | 75.5% (114/151)                          | 76.8% (116/151)                          |
| Cost per 1,000 posts    | $0                                       | $0.36                                    | $4.66                                    |
| Rules / engine versions | rules-2026-09-17.5 / engine-2026-09-17.7 | rules-2026-09-17.5 / engine-2026-09-17.7 | rules-2026-09-17.5 / engine-2026-09-17.7 |
| Prompt version id       | n/a                                      | job-enrichment@0.3.1+dir-413f1301        | job-enrichment@0.3.1+dir-413f1301        |

### Holdout, session 3 (44 posts, 9 labeled green pairs)

| Metric                  | rules-only                               | gpt-oss-120b                             | gemini-3.1-flash-lite                    |
| ----------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Accuracy                | 83.0% (219/264)                          | 79.5% (210/264)                          | 79.9% (211/264)                          |
| False greens            | 0                                        | 0                                        | 0                                        |
| False reds              | 0                                        | 5                                        | 6                                        |
| Green recall            | 44.4% (4/9)                              | 44.4% (4/9)                              | 22.2% (2/9)                              |
| Yellow-or-better recall | 89.4% (76/85)                            | 60.0% (51/85)                            | 67.1% (57/85)                            |
| Cost per 1,000 posts    | $0                                       | $0.36                                    | $4.27                                    |
| Rules / engine versions | rules-2026-09-17.5 / engine-2026-09-17.7 | rules-2026-09-17.5 / engine-2026-09-17.7 | rules-2026-09-17.5 / engine-2026-09-17.7 |
| Prompt version id       | n/a                                      | job-enrichment@0.3.1+dir-413f1301        | job-enrichment@0.3.1+dir-413f1301        |

## Chosen routing

Owner decision 2026-09-17: job-enrichment uses `openai/gpt-oss-120b` (reasoning effort low) with
`google/gemini-3.1-flash-lite` fallback. Company-evidence uses `google/gemini-3.1-flash-lite`
with `openai/gpt-oss-120b` fallback. The free `nvidia/nemotron-3-super-120b-a12b:free` route is
dropped: 35–52% failed posts across rounds, and it shares a daily quota.
