# 10 — OpenRouter free models: what Pemby can run for $0, and what it cannot

Researched 2026-09-15. Question: can Pemby's four AI tasks run on free (`:free`) OpenRouter models, especially NVIDIA Nemotron, with cheap paid models as the fallback? The tasks are T1 job-post enrichment, T2 CV parsing, T3 embeddings and T4 application kits. Companion to `07-openrouter-integration.md`, which covers auth, SDKs, structured-output mechanics and terms. That ground is not repeated here.

**Method.** Only first-party sources:

- **OpenRouter APIs**, fetched with `curl` today: `GET /api/v1/models` (446 models), `GET /api/v1/embeddings/models` (33 models), `GET /api/v1/models/{id}/endpoints` and `GET /api/v1/endpoints/zdr` (869 ZDR endpoints).
- **OpenRouter docs**, read as raw Markdown (`.md` suffix), plus `openrouter.ai/openapi.json`.
- **OpenRouter internal JSON** that its own docs pages load:
  - `/api/frontend/v1/all-providers`, the source of the table on the Provider Logging page;
  - `/api/frontend/v1/stats/model-uptime-recent`, the source of the chart on the Uptime page;
  - endpoint `dataPolicy` objects embedded in model-page HTML.
- **Model cards**: Hugging Face `README.md` files for each model.
- **History**: Wayback Machine snapshots of `/api/v1/models`, June 2025 to September 2026.

WebSearch was unavailable (session budget exhausted), so no secondary write-ups were used.

**Evidence grades**

- **[R]** Read raw: JSON, Markdown or HTML source. Quotes are exact.
- **[S]** Read through a summarising fetch tool. First-party, but wording may be paraphrased.
- **UNVERIFIED**: my inference, an undocumented field, or not confirmed first-hand.

---

## TL;DR

1. **There are 20 `:free` models right now.** The only strong general-purpose ones are four NVIDIA Nemotron models and two Google Gemma 4 models.
   - No free Qwen, DeepSeek, Llama, Kimi, gpt-oss or Mistral model exists today. All of them had free variants in the past, and all have been removed.
   - The one GLM variant (`z-ai/glm-5.2:free`) is capped at a 32K context and has no `response_format`.
2. **The free daily cap is too small for T1.** Free models allow **20 requests/minute** and **50 requests/day**. Buying at least **$10** of credits (all time) raises the cap to **1,000 requests/day** [R]. T1 needs 2,000–5,000 calls a day, so free models can cover 20–50% of it at most.
3. **Every free Nemotron endpoint is served by NVIDIA, whose data policy is `"training": true, "retainsPrompts": true`** [R], under the "NVIDIA API Trial Terms of Service". That is acceptable for T1, where job posts are public and contain no personal data. It is **disqualifying for T2, T3 (CV vectors) and T4.**
4. **Free models can be used with ZDR enforced, but only a few, and none of the useful ones.** The ZDR endpoint list contains `z-ai/glm-5.2:free` (Decart) and three InclusionAI Ling 3.0 Flash domain fine-tunes (Novita). It contains **no Nemotron and no Gemma free endpoint.**
5. **Free variants are short-lived.** Between June 2025 and today, over 100 `:free` IDs disappeared, including every DeepSeek, Qwen 3, Llama 3.3/4, gpt-oss and Kimi free variant. `minimax/minimax-m3:free` was listed on 2026-09-02 and is gone by 2026-09-15. `dots-studio/dots-3-note-preview:free` carries `expiration_date: 2026-09-30`.
6. **Free endpoints are less available.** Three-day availability of the free variants, from OpenRouter's uptime JSON (field semantics UNVERIFIED):
   - Nemotron 3 Super: 84.9%
   - Nemotron 3.5 Lightning: 93.1%
   - Nemotron 3 Ultra: 75.2%
   - Gemma 4 31B: 97.6%

   Paid gpt-oss-120b endpoints mostly sit at 99–100% one-day uptime.
7. **Paid models are cheap enough that "free" saves little.** At the list prices below, running all of T1 on `openai/gpt-oss-120b` costs about **$9–22/month**. A free-first mix saves under $10/month and adds a second model to evaluate and monitor.
8. **Embeddings: three free models exist, but all are served by providers that train on inputs.** Jobs and CVs must share one embedding space, so use one paid ZDR model for both: `qwen/qwen3-embedding-8b` at **$0.01/M tokens**, about $1–2/month.
9. **Recommended launch spend is about $8–44/month for all four tasks.** The routing table is at the end.

---

## 1. `:free` models on OpenRouter today

Source: `GET https://openrouter.ai/api/v1/models`, filtered to `pricing.prompt == 0 && pricing.completion == 0` [R]. That filter returns 23 models: 20 `:free` IDs, plus `openrouter/free` (the random free router) and two Google Lyria music-generation previews that are irrelevant here. Provider, quantization, uptime and status come from `GET /api/v1/models/{id}/endpoints` [R]. Data policy comes from `/api/frontend/v1/all-providers`, cross-checked against the free endpoint's `dataPolicy` on the model page [R].

"RF" means `response_format` and "SO" means `structured_outputs`, both from the `supported_parameters` field. "Tools" means `tools`.

### 1a. General-purpose candidates

| Model ID | Context (max output) | RF | SO | Tools | Provider (quant) | 1-day uptime, status | Provider data policy |
|---|---|---|---|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b:free` | 262,144 (235,929) | yes | yes | yes | Nvidia (unknown) | 96.3%, status −2 | trains, retains prompts |
| `nvidia/nemotron-3.5-lightning:free` | 1,000,000 (65,536) | **no** | **no** | yes (`tool_choice: required` supported) | Nvidia (nvfp4) | 98.5%, status 0 | trains, retains prompts |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1,000,000 (65,536) | **no** | **no** | yes | Nvidia (unknown) | 97.6%, status 0 | trains, retains prompts |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256,000 (65,536) | no | no | listed, but `supports_tool_choice` is all false | Nvidia | 83.7%, status −2 | trains, retains prompts |
| `google/gemma-4-31b-it:free` | 262,144 (32,768) | yes | no | yes | Google AI Studio | 99.4%, status 0 | no training; retains prompts 55 days |
| `google/gemma-4-26b-a4b-it:free` | 262,144 (32,768) | yes | no | yes | Google AI Studio | 99.2%, status 0 | no training; retains prompts 55 days |
| `z-ai/glm-5.2:free` | 32,768 (29,491) | no | no | no (reasoning only) | Decart (fp4) | 89.8%, status 0 | no training, no retention; **ZDR-listed** |
| `liquid/lfm-2.5-2.6b:free` | 65,536 (8,192) | yes | yes | yes | Liquid (fp8) | 99.8% | trains, retains prompts |
| `nex-agi/nex-n2.5-pro:free` | 262,144 (235,929) | yes | yes | yes | Nex AGI (fp8), HQ CN, DC SG | 97.1%, status −2 | retains prompts 30 days |
| `nex-agi/nex-n2.5-mini:free` | 262,144 (235,929) | yes | yes | yes | Nex AGI (bf16) | 87.5%, status −5 | retains prompts 30 days |
| `dots-studio/dots-3-note-preview:free` | 512,000 (460,800) | yes | yes | yes | AtlasCloud (fp8) | 99.99% | retains prompts; **`expiration_date` 2026-09-30** |
| `thinkingmachines/inkling:free` | 1,048,576 (262,144) | no | no | yes (`tool_choice` all false) | Thinking Machines (nvfp4) | 99.97% | trains, including `trainingOpenRouter: true` |
| `thinkingmachines/inkling-small:free` | 1,048,576 (262,144) | no | no | yes (`tool_choice` all false) | Thinking Machines (nvfp4) | 99.95% | same as above |
| `openrouter/free` (router) | 200,000 | yes | yes | yes | random free model | n/a | inherits the chosen model's policy |

### 1b. Specialised or poor fits

| Model ID | Why it does not fit Pemby |
|---|---|
| `nvidia/nemotron-3.5-content-safety:free` | A 4B guardrail classifier (128K context, no RF, no tools). It could screen user-supplied text, but it is not an extractor. |
| `cohere/north-mini-code:free`, `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free` | Coding-agent models with no RF. Cohere retains prompts 30 days; Poolside retains prompts. |
| `inclusionai/ling-3.0-flash-fin:free`, `-sante:free`, `-vl:free` | Finance, health and vision fine-tunes. No RF. Served by Novita and **ZDR-listed**. |

Notes:

- **Status codes are undocumented.** `status` is 0 for healthy endpoints and negative for some (−2, −5). The meaning of the negative codes is UNVERIFIED; they line up with the lower uptime numbers.
- **The GLM free variant is cut down.** `z-ai/glm-5.2` is described as a "1M-token context window" model, but the free Decart endpoint is capped at 32,768 tokens [R].
- **Nemotron 3 Super's model ID carries a wrong date.** Its canonical slug is `nvidia/nemotron-3-super-120b-a12b-20230311`. That date is clearly wrong (Wayback first shows the free variant on 2026-04-01) and is harmless.
- **Paid Nemotron endpoints use other providers, and some are ZDR.** From the ZDR list [R]:
  - Nemotron 3.5 Lightning: CoreWeave, DeepInfra, Phala.
  - Nemotron 3 Super: DeepInfra, DekaLLM.
  - Nemotron 3 Ultra: BaseTen, DeepInfra, Venice.
- **Structured-output support varies by endpoint.** For paid Nemotron 3 Super, DeepInfra lists `structured_outputs: false` and DekaLLM lists `true`. The docs state: "Support is determined per endpoint, not just per model … Endpoint support can also change over time." [R]. Use `provider.require_parameters: true`.
- **Lightning's free endpoint needs a forced tool call.** It has no `response_format`, so JSON extraction there means defining the schema as a function's parameters and sending `tool_choice: required`. That works, but schema enforcement on NVIDIA's side is UNVERIFIED.

---

## 2. Free-tier rate limits

Source: <https://openrouter.ai/docs/api_reference/limits.md> [R]. The page renders constants `FREE_MODEL_RATE_LIMIT_RPM = 20`, `FREE_MODEL_NO_CREDITS_RPD = 50`, `FREE_MODEL_HAS_CREDITS_RPD = 1000` and `FREE_MODEL_CREDITS_THRESHOLD = 10`.

> **Free usage limits**: If you're using a free model variant (with an ID ending in `:free`), the following limits apply:
>
> | Credits purchased (all time) | Requests per minute | Requests per day |
> |---|---|---|
> | Less than 10 | 20 | 50 |
> | At least 10 | 20 | 1000 |
>
> **DDoS protection**: Cloudflare's DDoS protection will block requests that dramatically exceed reasonable usage.

From the FAQ, <https://openrouter.ai/docs/faq.md> [R]:

> For free models, rate limits are determined by the credits that you have purchased. If you have purchased at least 10 credits, your free model rate limit will be 1000 requests per day. Otherwise, you will be rate limited to 50 free model API requests per day.

> These models have low rate limits (50 requests per day total) and are usually not suitable for production use.

Other documented behaviour [R]:

- **Credits are one-time.** "Credits purchased (all time)" means a single $10 top-up unlocks 1,000 requests a day permanently.
- **A negative balance blocks free models too.** "you may see 402 errors, including for free models."
- **Hitting a limit returns 429 with headers.** A platform-limit 429 carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. "Successful inference responses do not include `X-RateLimit-*` headers." Use `GET /api/v1/key` (`is_free_tier`, `limit_remaining`) to monitor.
- **Two sources of 429.** One is OpenRouter's own limits. The other is "The upstream provider, when the provider serving your request is rate limiting or at capacity", and in that case fallback routing retries other providers.

Open questions:

- **Scope of the daily cap.** It appears to be per account, not per API key: the FAQ says "requests per day total", and the threshold is based on account purchases. Whether extra keys or workspaces get separate caps is UNVERIFIED.
- **Embedding models.** Whether `:free` embedding models count against the same 1,000/day cap is UNVERIFIED. The docs only say "a free model variant (with an ID ending in `:free`)", which would include them.

**Implication for T1.** 1,000 requests/day at 20 RPM covers about 20–50% of launch volume. A queue that meters free calls at ≤20/minute and sends the overflow to a paid model is required.

---

## 3. Data policy of free endpoints, privacy settings, ZDR

### 3.1 What OpenRouter itself does

Source: <https://openrouter.ai/docs/guides/privacy/data-collection.md> [R].

> Any prompt retention on OpenRouter is always opt-in. OpenRouter has never shared, sold, or licensed underlying prompt data to any third party.

> OpenRouter does not store your prompts or responses, *unless* you opt in to one or both of the following: **Private Input & Output Logging** … Off by default. **OpenRouter Use of Inputs/Outputs** … In exchange, you receive a 1% discount on all model usage. Off by default.

> *Anonymous Input Categorization: OpenRouter samples a small number of prompts for categorization to power our reporting and model ranking. If you are not opted in to OpenRouter use of inputs/outputs, any categorization of your prompts is stored completely anonymously and never associated with your account or user ID. The categorization is done by model with a zero-data-retention policy.*

GDPR note: this sampling applies to CV prompts too. It needs a line in Pemby's privacy notice and DPA review; see `07-openrouter-integration.md` §7.

### 3.2 Provider-side training and retention

Source: <https://openrouter.ai/docs/guides/privacy/provider-logging.md> [R].

> On your account settings page, you can set whether you would like to allow routing to providers that may train on your data (according to their own policies). There are separate settings for paid and free models.

> If you opt out of training in your account settings, OpenRouter will not route to providers that train.

> OpenRouter does not have routing rules that change based on data retention policies of providers … Any user of OpenRouter can ignore providers that don't meet their own data retention requirements.

**Per-request control**, from <https://openrouter.ai/docs/guides/routing/provider-selection.md> [R]:

> `data_collection` — "allow" | "deny" — default "allow" — Control whether to use providers that may store data.
> * `allow`: (default) allow providers which store user data non-transiently and may train on it
> * `deny`: use only providers which do not collect user data

**The same toggles on guardrails (per API key).** From `openrouter.ai/openapi.json` [R]:

- `enable_free_model_training`: "Whether this guardrail allows free endpoints that train on request data."
- `enable_free_model_publication`: "Whether this guardrail allows free endpoints that publish prompts."
- `enable_paid_model_training`: "Whether this guardrail allows paid endpoints that train on request data."

The exact label text on the logged-in settings page (for example "allow free endpoints that may train on inputs") could not be fetched without an account: UNVERIFIED. The API fields above are the authoritative names.

**Data policies of the providers behind today's free models** (`dataPolicy` from `/api/frontend/v1/all-providers`, the JSON the Provider Logging page renders) [R]:

| Provider | Serves (free) | `training` | `retainsPrompts` | `retentionDays` | Other |
|---|---|---|---|---|---|
| NVIDIA | all Nemotron `:free` models, `nemotron-3-embed-1b:free`, `llama-nemotron-embed-vl-1b-v2:free` | **true** | **true** | not stated | `requiresUserIDs: true`; ToS: "NVIDIA API Trial Terms of Service" |
| Google AI Studio | Gemma 4 `:free` | false | true | 55 | the free endpoint's own `dataPolicy` on the model page matches |
| Liquid | `lfm-2.5-2.6b:free`, `lfm-2.5-embedding-350m:free` | **true** | true | not stated | model description: "Successful OpenRouter requests and embeddings may be retained and used to train…" |
| Thinking Machines | Inkling `:free` | **true** | true | not stated | `trainingOpenRouter: true` (meaning UNVERIFIED); ToS is a "free research API tier" |
| Nex AGI | Nex N2.5 `:free` | false | true | 30 | HQ CN, datacenter SG |
| AtlasCloud | Dots 3 Note `:free` | false | true | not stated | |
| Cohere | North Mini Code `:free` | false | true | 30 | |
| Poolside | Laguna `:free` | false | true | not stated | |
| Decart | `glm-5.2:free` | false | false | n/a | ZDR-listed |
| NovitaAI | Ling 3.0 Flash `:free` | false | false | n/a | ZDR-listed |

The per-endpoint `dataPolicy` in the model-page HTML matched the provider defaults for the `variant: "free"` endpoints of `nemotron-3.5-lightning` and `gemma-4-31b-it` [R]. The ZDR page warns that "a provider's general policy may differ from the specific policy for a given endpoint", and "If OpenRouter is not able to establish or ascertain a clear policy for a provider or endpoint, we take a conservative stance and assume that the endpoint both retains and trains on data" [R].

### 3.3 Zero Data Retention

Source: <https://openrouter.ai/docs/guides/features/zdr.md> [R].

> Zero Data Retention (ZDR) means that a provider will not store your data for any period of time.

> Providers that do not retain your data are also unable to train on your data. However we do have some endpoints & providers who do not train on your data but *do* retain it (e.g. to scan for abuse or for legal reasons).

> You can enforce ZDR globally, per model group, per guardrail, or per request.

**Model groups.** There are five: Anthropic, OpenAI, Google, SpaceXAI and "All other models". For example, Google "Removes AI Studio endpoints (Vertex remains available)", and OpenAI "Removes first-party OpenAI endpoints (Azure remains available)". Guardrail fields: `enforce_zdr_anthropic`, `enforce_zdr_openai`, `enforce_zdr_google`, `enforce_zdr_xai`, `enforce_zdr_other`.

**How the per-request flag combines with account settings.** The docs:

> The request-level `zdr` parameter operates as an "OR" with your account-wide and guardrail ZDR settings. If any is enabled, ZDR enforcement will be applied. This means the per-request parameter can only be used to ensure ZDR is enabled for a specific request, not to override or disable account-wide or guardrail enforcement.

> ZDR enforcement only applies to provider routing for inference requests. It does not apply to plugins and tools you choose to enable, such as web search.

**Can a free model be used with ZDR enforced?** Technically yes. `GET /api/v1/endpoints/zdr` [R] lists these free LLM endpoints:

- `z-ai/glm-5.2:free` (Decart)
- `inclusionai/ling-3.0-flash-fin:free`, `-sante:free` and `-vl:free` (Novita)

(There are also non-LLM `deepgram/flux-tts:free` and `fish-audio/s2.1-pro-free:free`.)

**No Nemotron, Gemma, Liquid, Nex, Dots or Inkling free endpoint is in the ZDR list, and no free embedding model is.** With ZDR on, a request to `nvidia/nemotron-*:free` has no eligible endpoint. The docs' 503 description ("No available model provider meets your routing requirements") suggests that is the failure mode; the exact error is UNVERIFIED.

**Consequences for Pemby:**

- **T2, T3 and T4 cannot use any useful free model.** Free GLM 5.2 is ZDR-eligible but has a 32K context and no JSON mode.
- **A ZDR switch at account level would also block T1's free Nemotron calls.** Keep account-level ZDR off and enforce ZDR with a **guardrail on the personal-data API key**, plus `provider.zdr: true` on every T2/T3/T4 request.
- **Give T1 its own key.** Its guardrail sets `enable_free_model_training: true`. How account-level and guardrail training toggles combine is not documented the way ZDR's OR rule is: UNVERIFIED, so test it with a dry request.

---

## 4. Quality evidence for structured extraction (T1/T2)

**No model card fetched reports a JSON-schema or structured-extraction benchmark.** The closest proxies are instruction following (IFEval, IFBench, Multi-Challenge), function calling (BFCL) and tool use (τ-bench). NVIDIA's cards list "Synthetic Structured Outputs" and `Nemotron-RL-agent-structured-outputs-v1` among their training data [R]. That shows training on the skill, not a measured score. All numbers are vendor-reported. **Nothing here replaces the hand-labelled eval in the routing table.**

### 4.1 Free candidates (numbers from their own Hugging Face cards) [R]

| Model (OpenRouter free ID) | Instruction following | Tool use / function calling | Other | Card languages |
|---|---|---|---|---|
| Nemotron 3 Super 120B-A12B (`nvidia/nemotron-3-super-120b-a12b:free`) | IFBench (prompt) 72.58; Scale AI Multi-Challenge 55.23; Arena-Hard-V2 (hard prompt) 73.88 | TauBench V2 average 61.15 (airline 56.25 / retail 62.83 / telecom 64.36) | MMLU-Pro 83.73; RULER-500 @128k 96.79; MMLU-ProX 79.35 | EN, FR, DE, IT, JA, ES, ZH |
| Nemotron 3.5 Lightning 30B-A3B (`nvidia/nemotron-3.5-lightning:free`) | IFBench (loose) 71.88, against Gemma 4 26B-A4B 77.25, Qwen 3.6 35B-A3B 63.71, Nemotron 3 Super 71.92 and GPT-OSS-20B 68.50 (same table) | τ³-bench (banking) 9.28 | MMLU Pro 81.94; GPQA Diamond 75.44 | EN, ES, FR, DE, IT, JA |
| Nemotron 3 Ultra 550B-A55B (`nvidia/nemotron-3-ultra-550b-a55b:free`) | IFBench (prompt loose) 81.7, against DS-v4-Flash 82.0 and Qwen-3.5-397B 78.2 | TauBench V3 average 70.9 (DS-v4-Flash 73.7) | MMLU-Pro 86.8 | EN, FR, ES, IT, DE, JA, HI, KO, PT-BR, ZH |
| Gemma 4 31B (`google/gemma-4-31b-it:free`) | IFEval/IFBench not in card | Tau2 (average over 3) 76.9% | MMLU Pro 85.2%; GPQA Diamond 84.3% | multilingual (not re-checked) |
| Gemma 4 26B-A4B (`google/gemma-4-26b-a4b-it:free`) | IFBench 77.25 (per NVIDIA's Lightning card) | Tau2 68.2% | MMLU Pro 82.6% | as above |

Nemotron 3 Nano 30B-A3B is paid-only now; its free variant was removed after 2026-08-03. Its card reports BFCL v4 53.8, IFBench (prompt) 71.5 and TauBench V2 average 49.0 [R]. It is the only Nemotron 3 card with a BFCL number.

**Reasoning mode.** All Nemotron 3 / 3.5 cards say "Configurable on/off via chat template (`enable_thinking=True/False`)" [R]. How OpenRouter's `reasoning` parameter maps onto this on NVIDIA's free endpoint is UNVERIFIED. With reasoning on, output tokens and latency grow.

### 4.2 Cheap paid comparisons

Prices are list prices from `/api/v1/models` in $ per million tokens, input/output [R]. The ZDR column comes from `/api/v1/endpoints/zdr` [R].

| Model ID | $/M in | $/M out | Context | RF/SO/Tools | ZDR endpoints exist? | Benchmark evidence found |
|---|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | 0.037 | 0.17 | 131,072 | yes/yes/yes | yes: DeepInfra, Groq, Cerebras, Bedrock eu-west-1, Vertex, Crusoe, Nebius, others | OpenAI card has no IFEval/BFCL table. The Qwen3.5-9B card reports GPT-OSS-120B at IFEval 88.9, IFBench 69.0, MMLU-Pro 80.8 (Qwen-run) |
| `openai/gpt-oss-20b` | 0.03 | 0.13 | 131,072 | yes/yes/yes | yes | Qwen-reported: IFEval 88.2, IFBench 65.1. NVIDIA-reported: IFBench 68.50 |
| `deepseek/deepseek-v4-flash-0731` | 0.06 | 0.12 | 1,310,720 | yes/yes/yes | yes: DeepInfra, BaseTen, CoreWeave, Together, others | V4-Flash card: MMLU-Pro 86.4. Nemotron Ultra card: IFBench 82.0, TauBench V3 average 73.7. Qwen3.8 card: IFBench 79.2 for V4-Flash-0731 |
| `nvidia/nemotron-3.5-lightning` (paid) | 0.08 | 0.20 | 262,144 | yes/yes/yes | yes: CoreWeave, DeepInfra, Phala | see 4.1 |
| `nvidia/nemotron-3-super-120b-a12b` (paid) | 0.08 | 0.45 | 262,144 | yes/yes/yes (SO only on DekaLLM) | yes: DeepInfra, DekaLLM | see 4.1 |
| `qwen/qwen3.5-9b` | 0.10 | 0.15 | 262,144 | yes/yes/yes | not in ZDR list | own card: IFEval 91.5, IFBench 64.5, BFCL-V4 66.1, TAU2 79.1, MMLU-ProX 76.3 |
| `qwen/qwen3.5-flash-02-23` | 0.065 | 0.26 | 1,000,000 | yes/yes/yes | **no** (Alibaba only) | none found |
| `qwen/qwen3.8-flash` (HF: Qwen3.8-Flash-Next) | 0.15 | 0.47 | 1,000,000 | yes/yes/yes | **no** | own card: IFBench 81.3 |
| `qwen/qwen3-30b-a3b-instruct-2507` | 0.048 | 0.193 | 262,144 | yes/yes/yes | yes: SiliconFlow, Nebius, DekaLLM | own card, last column: IFEval 84.7, BFCL-v3 65.1, TAU2-Retail 57.0 (column-to-model mapping not re-checked: UNVERIFIED) |
| `z-ai/glm-5.3-flash` | 0.075 | 0.25 | 1,310,720 | yes/yes/yes | yes: many | card has no such table |
| `google/gemini-2.5-flash-lite` | 0.10 (0.05 flex) | 0.40 (0.20 flex) | 1,048,576 | yes/yes/yes | yes: **Vertex EU** and Vertex | no Google card fetched. The Qwen3.5-9B card reports only vision/document scores (OmniDocBench 1.5: 79.4; CC-OCR: 72.9) |
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | 1,048,576 | yes/yes/yes | yes: Vertex EU, US, global | none fetched (UNVERIFIED) |
| `openai/gpt-5-nano` | 0.05 | 0.40 | 400,000 | yes/yes/yes | yes: Azure, Azure swedencentral | none fetched (UNVERIFIED) |
| `mistralai/mistral-small-2603` (Mistral Small 4, 119B) | 0.15 | 0.60 | 262,144 | yes/yes/yes | yes: **Mistral EU**, `mistral/zdr`, Venice | card claims "native function calling and JSON output"; no numbers |
| `mistralai/ministral-8b-2512` | 0.15 | 0.15 | 262,144 | yes/yes/yes | yes: Mistral EU and ZDR | not checked |
| `google/gemma-4-31b-it` (paid) | 0.09 | 0.34 | 262,144 | yes/yes/yes | yes: DeepInfra, CoreWeave, Together, others | see 4.1 |

**Reading the evidence:**

- **Free Nemotron 3 Super is no weaker than the cheap paid tier on these proxies.** Its IFBench of ~72 sits alongside gpt-oss-120b's 69 and Qwen3-30B-2507's range. It trails DeepSeek V4 Flash (79–82) and Nemotron 3 Ultra (82).
- **Benchmarks are not the deciding factor for T1.** Its eligibility fields (countries, contractor vs employee, timezone, visa) are a domain judgment task that no public benchmark measures, and small differences on IFBench will not predict accuracy there. The deciders are the rate cap, availability and the data policy.
- **On evidence alone, gpt-oss-120b and DeepSeek V4 Flash 0731 are the strongest cheap paid picks for T1.** They are the cheapest models with ZDR endpoints and many providers.

---

## 5. Embeddings

Source: `GET https://openrouter.ai/api/v1/embeddings/models` (33 models) [R]. Dimensions come from model cards or OpenRouter descriptions as noted. The embeddings API reference documents a `dimensions` request field ("The number of dimensions for the output embeddings") and `input_type` [R]. Whether each provider honours `dimensions` is UNVERIFIED.

### 5.1 Free embedding models (all three are from providers that train)

| Model ID | $/M | Context | Dimensions | Provider | Data policy | Uptime (1d) |
|---|---|---|---|---|---|---|
| `nvidia/nemotron-3-embed-1b:free` | 0 | 32,768 | 2048, sliceable to 1024/512 (card of `nvidia/Nemotron-3-Embed-1B-BF16`; OpenRouter lists no HF ID, so the weights match is UNVERIFIED) | Nvidia | trains, retains | 100% |
| `nvidia/llama-nemotron-embed-vl-1b-v2:free` | 0 | 131,072 | 2048 (card) | Nvidia | trains, retains | 100% |
| `liquid/lfm-2.5-embedding-350m:free` | 0 | 512 | 1024 (description and card); 11 languages, no RO/RU | Liquid | trains; "may be retained and used to train" | 100% |

### 5.2 Paid embedding models

| Model ID | $/M | Context | Dimensions (source) | ZDR endpoints |
|---|---|---|---|---|
| `perplexity/pplx-embed-v1-0.6b` | 0.004 | 32,000 | 1024, MRL (card) | yes (Perplexity int8) |
| `baai/bge-base-en-v1.5`, `intfloat/e5-base-v2`, `thenlper/gte-base`, `sentence-transformers/all-mpnet-base-v2` | 0.005 | 512 | 768 | not in ZDR list |
| `sentence-transformers/all-minilm-l6-v2` / `-l12-v2` / `paraphrase-minilm-l6-v2` | 0.005 | 512 | 384 | not in ZDR list |
| `baai/bge-m3` | 0.01 | 8,194 | 1024 | not in ZDR list |
| `baai/bge-large-en-v1.5`, `intfloat/e5-large-v2`, `intfloat/multilingual-e5-large`, `thenlper/gte-large` | 0.01 | 512 | 1024 | not in ZDR list |
| **`qwen/qwen3-embedding-8b`** | **0.01** | 32,768 | "Up to 4096, supports user-defined output dimensions ranging from 32 to 4096" (card) | **yes: Nebius, DeepInfra, SiliconFlow** |
| `qwen/qwen3-embedding-4b` | 0.02 | 32,768 | up to 2560 (UNVERIFIED, card not fetched) | yes (DeepInfra) |
| `openai/text-embedding-3-small` | 0.02 | 8,192 | 1536 (API-reference example; OpenAI docs not fetched) | yes (Azure) |
| `voyageai/voyage-4-lite` | 0.02 | 32,000 | 2048/1024/512/256 (OpenRouter description) | not in ZDR list |
| `perplexity/pplx-embed-v1-4b` | 0.03 | 32,000 | 2560 (card) | yes |
| `voyageai/voyage-4` | 0.06 | 32,000 | description truncated (UNVERIFIED) | no |
| `mistralai/mistral-embed-2312` | 0.10 | 8,192 | 1024 | yes (Mistral EU, ZDR) |
| `openai/text-embedding-ada-002` | 0.10 | 8,192 | 1536 (UNVERIFIED) | not checked |
| `openai/text-embedding-3-large` | 0.13 | 8,192 | 3072 (UNVERIFIED) | yes (Azure) |
| `google/gemini-embedding-001` | 0.15 | 20,000 | UNVERIFIED | yes (Vertex us-central1) |
| `mistralai/codestral-embed-2505` | 0.15 | 8,192 | code model | yes |
| `google/gemini-embedding-2` / `-2-preview` | 0.20 | 8,192 | UNVERIFIED | yes (Vertex EU, US, global) |
| `voyageai/voyage-4-large`, `voyage-code-4`, `voyage-multimodal-3.5` | 0.12 | 32,000 | n/a | no |

**Decision logic for T3:**

1. Candidate and job vectors must come from the same model. A cosine between spaces from different models is meaningless.
2. CV vectors derive from personal data, so they need ZDR.
3. Therefore both jobs and CVs go through one ZDR model. No free embedding model qualifies.

`qwen/qwen3-embedding-8b` wins: $0.01/M, three ZDR providers, 32K context, MRL down to small dimensions. `perplexity/pplx-embed-v1-0.6b` is the cheaper alternative at $0.004/M and 1024 dimensions, with a single provider.

---

## 6. Availability and reliability of free endpoints

### 6.1 Documented stance [R]

- Free Variant page: "Free variants provide access to models without cost, but may have different rate limits or availability compared to paid versions."
- Free Models Router page: "Free model availability changes frequently." Its listed limitations include "**Availability**: Free model availability can vary; some may be temporarily unavailable" and "**Performance**: Free models may have higher latency during peak usage".
- The same page still advertises "DeepSeek R1 (free)", which is no longer listed in `/api/v1/models`. Treat the docs' model examples as stale.
- FAQ: free models "are usually not suitable for production use".
- No deprecation notice for free variants appears in `/docs/changelog.md`, which only covers API schema changes. Removals happen silently.

### 6.2 Uptime, measured today [R]

The 1-day and 30-minute figures come from the `endpoints` API (`uptime_last_1d`, `uptime_last_30m`). The 3-day figure is the `availability` field of `/api/frontend/v1/stats/model-uptime-recent?permaslug=…&variant=free`. That endpoint is internal and loaded by the docs' Uptime page; the `variant=free` parameter and field semantics are UNVERIFIED, but the returned numbers differ from the non-free query.

| Endpoint | 1-day uptime | 30-min uptime | 3-day "availability" (free variant) |
|---|---|---|---|
| `nemotron-3-super-120b-a12b:free` | 96.3% | 92.2% | 84.9% |
| `nemotron-3.5-lightning:free` | 98.5% | 99.2% | 93.1% |
| `nemotron-3-ultra-550b-a55b:free` | 97.6% | 95.1% | 75.2% |
| `nemotron-3-nano-omni…:free` | 83.7% | 80.4% | not fetched |
| `gemma-4-31b-it:free` | 99.4% | 100% | 97.6% |
| `glm-5.2:free` | 89.8% | 98.9% | not fetched |
| paid `gpt-oss-120b` (best endpoints) | 99.8–100% (CoreWeave, AkashML, Groq, Cerebras, BaseTen) | n/a | n/a |
| paid `nemotron-3.5-lightning` | 99.8–100% (CoreWeave, DeepInfra, Phala) | n/a | n/a |

Each free Nemotron has **a single provider (NVIDIA)**, so OpenRouter has no other endpoint to fail over to within the same free model.

### 6.3 Free variants removed in the past

Source: Wayback Machine snapshots of `https://openrouter.ai/api/v1/models`, diffed against today's list [R, archived copies]. A model is "last seen" at the latest snapshot that lists it, so removal happened sometime before the next snapshot.

| Snapshot | Total models | `:free` models |
|---|---|---|
| 2025-06-05 | 324 | 68 |
| 2025-09-04 | 318 | 56 |
| 2025-12-06 | 337 | 30 |
| 2026-02-01 | 347 | 32 |
| 2026-04-01 | 348 | 25 |
| 2026-06-06 | 344 | 23 |
| 2026-08-03 | 337 | 14 |
| 2026-09-02 | 421 | 18 |
| **2026-09-15 (live)** | 446 | **20** |

Removed free variants relevant to Pemby (last snapshot that listed each):

- **DeepSeek.** `deepseek-r1:free`, `deepseek-chat-v3-0324:free` and `deepseek-chat-v3.1:free` (2025-09-04); `deepseek-r1-0528:free` (2026-02-01).
- **Qwen.**
  - `qwen3-235b-a22b:free` (2025-12-06);
  - `qwen3-14b/30b-a3b/8b:free` (2025-09-04);
  - `qwen3-4b:free` (2026-02-01);
  - `qwen3-coder:free` and `qwen3-next-80b-a3b-instruct:free` (2026-06-06);
  - `qwen3.6-plus-preview:free` (2026-04-01 only).
- **Llama.** `llama-4-maverick:free` and `llama-4-scout:free` (2025-09-04); `llama-3.3-70b-instruct:free` (2026-06-06).
- **gpt-oss.** `gpt-oss-120b:free` (2026-06-06); `gpt-oss-20b:free` (2026-08-03).
- **Kimi.** `kimi-k2:free` (2026-02-01); `kimi-k2.6:free` (2026-06-06 only).
- **GLM.** `glm-4.5-air:free` (2026-06-06).
- **Gemma.** `gemma-3-4b/12b/27b-it:free` (2026-04-01).
- **Mistral.** `mistral-small-3.1-24b-instruct:free` (2026-02-01); `mistral-small-3.2-24b-instruct:free` (2025-09-04).
- **NVIDIA.**
  - `llama-3.1-nemotron-ultra-253b-v1:free` (2025-09-04);
  - `llama-3.3-nemotron-super-49b-v1:free` (2025-06-05);
  - `nemotron-nano-9b-v2:free`, `nemotron-nano-12b-v2-vl:free` and `nemotron-3-nano-30b-a3b:free` (2026-08-03).
- **MiniMax.** `minimax-m2.5:free` (2026-04-01); `minimax-m2.7:free` and `minimax-m3:free` (2026-09-02 only, **gone within 13 days**).

The longest-lived current free LLM is `nvidia/nemotron-3-super-120b-a12b:free`, present in every snapshot since 2026-04-01 (about 5.5 months). NVIDIA's free models are the most persistent family in the record, but the older Nemotron free variants were withdrawn when newer ones arrived.

**Design rule.** Treat any `:free` ID as able to vanish with no notice.

- Always send a `models: [free, paid]` fallback array. "The `models` parameter lets you automatically try other models if the primary model's providers are down, rate-limited, or refuse to reply due to content moderation" [R].
- Alert when the free share of traffic drops.

---

## Recommended model routing

### Volume and token assumptions (mine, not measured)

**T1 (job-post enrichment)**

- 2,000 / 3,500 / 5,000 posts a day.
- 2,350 input tokens per call (a 1,750-token post plus 600 tokens of system prompt and schema).
- 350 output tokens, with reasoning off.

**T2 (CV parsing)**

- 10 / 55 / 100 CVs a day.
- 3,300 input tokens and 1,200 output tokens per CV.

**T3 (embeddings)**

- 1,200 tokens per job and 2,500 tokens per CV.
- One-time backfill: $0.60 per 50,000 jobs on qwen3-embedding-8b.

**T4 (application kits)**

- 5 / 15 / 30 kits a day.
- 8,000 input and 2,500 output tokens per kit, summed across its calls.

**All tasks**

- 30-day months at list prices.
- Costs exclude retries, reasoning tokens and OpenRouter's platform fee on credit purchases (see `07-openrouter-integration.md` §6).
- With reasoning on, T1 on gpt-oss-120b at 1,200 output tokens costs $17.5 / $30.5 / $43.6 a month.

### Routing table

**T1: job-post enrichment** (public data, 2k–5k posts a day)

- **Primary:** `nvidia/nemotron-3-super-120b-a12b:free`, with `response_format: json_schema, strict: true`. Metered to 20 RPM and at most ~950 requests a day. Chosen because it is the only strong free model whose free endpoint has `structured_outputs`.
- **Fallback:** `openai/gpt-oss-120b` ($0.037/$0.17), with `require_parameters: true`, for overflow above the cap and for failures. Then `deepseek/deepseek-v4-flash-0731` ($0.06/$0.12). If Nemotron loses the eval, make gpt-oss-120b the primary and drop the free tier.
- **Privacy setting:**
  - a dedicated "public-data" API key;
  - a guardrail with `enable_free_model_training: true`;
  - no ZDR on this key;
  - never send user data on this key.
  - Buy $10 of credits once to unlock 1,000 requests a day.
- **Monthly cost:**
  - Free-first hybrid: **$4 / $11 / $18**, the overflow on gpt-oss-120b. The ~15% of free calls that fail also fall back and add a little.
  - All-paid gpt-oss-120b: **$9 / $15 / $22**.
  - All-paid DeepSeek V4 Flash: $11 / $19 / $27.
- **Eval plan:**
  - Hand-label **60 real posts** covering these cases:
    - 20 with tricky eligibility (e.g. "EU only", "US/CA contractors", "UTC±3", "no visa sponsorship", LATAM-only, "anywhere except…");
    - 20 routine posts;
    - 10 non-English or HTML-heavy posts;
    - 10 with a salary range.
  - Score per field. Countries and regions use set-F1. Employment type, visa and seniority use exact match. Timezone window is correct only if both ends match.
  - Run 5 models: nemotron-3-super:free, nemotron-3.5-lightning:free (forced tool call), gpt-oss-120b, deepseek-v4-flash-0731 and gemini-2.5-flash-lite.
  - Run each model 3 times to measure variance, and log the schema-valid rate.
  - Pass bar: at least 95% eligibility-field accuracy and 100% schema-valid output after one retry. Pick the cheapest model that passes.
  - Re-run monthly on a 20-post canary set.

**T2: CV parsing** (personal data, 10–100 CVs a day)

- **Primary:** `google/gemini-2.5-flash-lite` ($0.10/$0.40), with `provider: { zdr: true, data_collection: "deny", require_parameters: true }`, preferring the Vertex EU endpoint. The provider-order syntax for a regional endpoint is UNVERIFIED; check it in `07` §5.
- **Fallback:** `mistralai/mistral-small-2603` ($0.15/$0.60; ZDR endpoints `mistral/eu` and `mistral/zdr`). Then `openai/gpt-oss-120b` on a ZDR provider.
- **Privacy setting:** a separate "personal-data" API key, with a guardrail setting `enforce_zdr_google`, `enforce_zdr_openai`, `enforce_zdr_anthropic` and `enforce_zdr_other` to true, and free-model training off. Also send `zdr: true` on every request. No `:free` model is ever eligible here.
- **Monthly cost:** **$0.25 / $1.35 / $2.45** on Flash-Lite; $0.40 / $2.20 / $4.00 on Mistral Small 4 EU.
- **Eval plan:**
  - Build **30 CVs**, synthetic or consented. Only these may ever touch a non-ZDR model during testing. Include:
    - English, Romanian and Russian CVs;
    - one-column and two-column layouts;
    - text extracted from scanned PDFs;
    - career gaps and freelance work.
  - Hand-build a gold JSON profile for each.
  - Score exact match on contact fields and dates (normalised), set-F1 on skills and titles, and the hallucinated-field rate (target 0).
  - Compare 3 ZDR models (Flash-Lite EU, Mistral Small 4 EU, gpt-oss-120b) and pick the best on the hallucination rate first.

**T3: embeddings** (all jobs and all CVs)

- **Primary:** `qwen/qwen3-embedding-8b` ($0.01/M), with `zdr: true`. Store 1024 dimensions: request `dimensions: 1024`, and if the provider ignores it, truncate and L2-normalise (MRL).
- **Fallback:** the same model on another ZDR provider (Nebius, DeepInfra, SiliconFlow). OpenRouter fails over automatically. **Never fall back to a different embedding model** without re-embedding the whole corpus.
- **Privacy setting:** the personal-data key (ZDR). Use it for jobs too, so both sides share one model.
- **Monthly cost:** **$0.73 / $1.30 / $1.88**, plus about $0.60 per 50,000-job backfill.
- **Eval plan:**
  - Take 20 synthetic CVs and a pool of 300 labelled jobs. Hand-mark the relevant jobs for each CV.
  - Compare recall@20 and nDCG@10 for qwen3-embedding-8b (4096 against 1024 dimensions), pplx-embed-v1-0.6b and text-embedding-3-small.
  - `nemotron-3-embed-1b:free` may be tested on synthetic data only, as a baseline.
  - Choose before indexing anything.

**T4: application kits** (Pass holders, personal data, quality writing)

- **Primary:** `anthropic/claude-haiku-4.5` ($1/$5), with `zdr: true` (Bedrock eu-west-1 or Vertex europe).
- **Fallback:** `openai/gpt-5-mini` ($0.25/$2; ZDR via Azure and Azure swedencentral). Then `mistralai/mistral-medium-3.1` ($0.40/$2; Mistral EU/ZDR).
- **Privacy setting:** the personal-data key (ZDR) plus `data_collection: "deny"`.
- **Monthly cost:** **$3 / $9 / $18** on Haiku 4.5; $1 / $3 / $6 on gpt-5-mini.
- **Eval plan:**
  - Take 12 CV×job pairs. Generate a kit with each of 3 models: Haiku 4.5, gpt-5-mini and Mistral Medium 3.1.
  - Run a blind side-by-side, ranked by the founder plus one recruiter on a 4-point rubric:
    1. no invented facts, each bullet traceable to a CV field;
    2. tailoring to the post;
    3. tone and concision;
    4. screening answers that respond to the question.
  - Any fabricated claim fails the model.
  - Pick the cheapest model within a rank of the best. No benchmark for this writing quality was found, so this eval is the only evidence.

**Total at launch** (sum of the low and high columns above): about **$8–40/month free-first** or **$13–44/month all-paid**. T1 dominates at the high end of volume.

### Build notes that follow from this research

1. **Put the model IDs in config.**
   - Free variants disappear without notice (§6.3).
   - The fallback array `models: [primary, fallback]` belongs on every call.
   - Watch the `model` field in responses so you can see when traffic silently moves to the paid fallback.
2. **Use two API keys with two guardrails.**
   - The public-data key may reach training free endpoints.
   - The personal-data key enforces ZDR in every model group.
   - Account-level ZDR would block T1's free Nemotron, because ZDR settings combine with OR (§3.3).
3. **Meter free calls in the queue itself:** 20 RPM, and a daily counter reset at UTC midnight. When and in which timezone the daily counter resets is UNVERIFIED.
4. **Handle 429s by route.** A 429 carrying `X-RateLimit-*` headers comes from OpenRouter's free cap: route to paid immediately. A provider 429 is retried by OpenRouter first.
5. **Re-check before each deploy.** Run `GET /api/v1/models` (filter `:free`), look at `expiration_date`, and check `GET /api/v1/endpoints/zdr` for the chosen T2/T3/T4 endpoints. Both are public, unauthenticated JSON.

---

## Sources

- OpenRouter API (fetched 2026-09-15):
  - <https://openrouter.ai/api/v1/models>
  - <https://openrouter.ai/api/v1/embeddings/models>
  - `https://openrouter.ai/api/v1/models/{id}/endpoints`
  - <https://openrouter.ai/api/v1/endpoints/zdr>
  - <https://openrouter.ai/openapi.json>
- OpenRouter internal JSON used by its docs pages:
  - <https://openrouter.ai/api/frontend/v1/all-providers>
  - `https://openrouter.ai/api/frontend/v1/stats/model-uptime-recent?permaslug=…`
- OpenRouter docs:
  - <https://openrouter.ai/docs/api_reference/limits.md>
  - <https://openrouter.ai/docs/faq.md>
  - <https://openrouter.ai/docs/guides/privacy/data-collection.md>
  - <https://openrouter.ai/docs/guides/privacy/provider-logging.md>
  - <https://openrouter.ai/docs/guides/features/zdr.md>
  - <https://openrouter.ai/docs/guides/routing/provider-selection.md>
  - <https://openrouter.ai/docs/guides/routing/model-variants/free.md>
  - <https://openrouter.ai/docs/guides/routing/routers/free-router.md>
  - <https://openrouter.ai/docs/guides/routing/model-fallbacks.md>
  - <https://openrouter.ai/docs/guides/features/structured-outputs.md>
  - <https://openrouter.ai/docs/guides/features/guardrails.md>
  - <https://openrouter.ai/docs/guides/best-practices/uptime-optimization.md>
  - <https://openrouter.ai/docs/api_reference/embeddings.md>
  - <https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings.md>
  - <https://openrouter.ai/docs/changelog.md>
- OpenRouter model pages (HTML with embedded endpoint `dataPolicy`):
  - <https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free>
  - <https://openrouter.ai/nvidia/nemotron-3.5-lightning:free>
  - <https://openrouter.ai/google/gemma-4-31b-it:free>
- Hugging Face model cards (`/raw/main/README.md`):
  - nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8
  - nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16
  - nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16
  - nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16
  - nvidia/Nemotron-3-Embed-1B-BF16
  - nvidia/llama-nemotron-embed-vl-1b-v2
  - google/gemma-4-31B-it
  - google/gemma-4-26B-A4B-it
  - openai/gpt-oss-120b
  - mistralai/Mistral-Small-4-119B-2603
  - deepseek-ai/DeepSeek-V4-Flash
  - deepseek-ai/DeepSeek-V4-Flash-0731
  - Qwen/Qwen3.5-9B
  - Qwen/Qwen3.8-Flash-Next
  - Qwen/Qwen3-30B-A3B-Instruct-2507
  - Qwen/Qwen3-Embedding-8B
  - zai-org/GLM-5.3-Flash
  - LiquidAI/LFM2.5-Embedding-350M
  - perplexity-ai/pplx-embed-v1-0.6b
- Wayback Machine, `https://web.archive.org/web/{ts}id_/https://openrouter.ai/api/v1/models` for ts = 20250605100521, 20250904192312, 20251206224151, 20260201232250, 20260401095816, 20260606045727, 20260803065634, 20260902084534.
- Not consulted: build.nvidia.com (NVIDIA's own trial API terms page was not fetched; the ToS URL comes from OpenRouter's provider record). WebSearch was unavailable.
