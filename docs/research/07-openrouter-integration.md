# 07 — OpenRouter integration (auth, limits, structured output, PDFs, cost, policy)

Researched 2026-09-15. Question: how should Pemby (Next.js, TypeScript) call OpenRouter to parse CVs, extract job posts, reason about eligibility, and draft answers? Pemby's own key is the default, and a user can connect their own OpenRouter account instead.

**Method.** Only first-party sources: OpenRouter docs (openrouter.ai/docs, index at <https://openrouter.ai/docs/llms.txt>), the OpenAPI reference pages, the Terms, Privacy and Pricing pages, OpenRouter's GitHub repos, and the npm registry for version numbers. Every docs URL below also serves raw Markdown if you append `.md`, and I read many pages that way.

**Evidence grades**

- **[R]** Read in the raw Markdown, OpenAPI YAML or HTML source. Quotes are exact.
- **[S]** Read through a summarising fetch tool. The facts are first-party, but a "quote" may be lightly paraphrased. Re-check the wording before relying on it.
- **UNVERIFIED** Not confirmed first-hand, or my inference from the docs rather than something they state.

---

## 1. OAuth PKCE: letting a user connect their own OpenRouter account

Source: <https://openrouter.ai/docs/guides/overview/auth/oauth> [R]

**Step 1: redirect the user.**

```
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256
```

| Query param | Notes |
|---|---|
| `callback_url` | Where the user returns. Localhost callbacks work "on **any port**". Omit it for headless mode, where the code is shown on screen and `code_challenge` becomes required. |
| `code_challenge` | "optional but recommended". For S256 it is the base64url SHA-256 of `code_verifier`. |
| `code_challenge_method` | `S256` (recommended) or `plain`. |
| `key_label` | "Prefills the label of the API key that will be created." |
| `workspace_id` | Preselects a workspace (UUID). The user can change it. |
| `required_workspace_id` | Locks key creation to that workspace. Takes precedence over `workspace_id`. |

After consent, the user is redirected to `callback_url?code=...`.

**Step 2: exchange the code.** `POST https://openrouter.ai/api/v1/auth/keys` with a JSON body:

```json
{ "code": "<CODE>", "code_verifier": "<VERIFIER>", "code_challenge_method": "S256" }
```

- The guide shows `const { key } = await response.json();`. [R]
- The OpenAPI reference lists the response as `key` ("The API key to use for OpenRouter requests") plus `user_id` ("User ID associated with the API key"), with `user_id` marked required. Source: <https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key> [R]
- Codes are single-use and "expire 10 minutes after issuance". [R]
- Documented errors: `400 Invalid code_challenge_method`, `403 Invalid code or code_verifier`, `403 Authorization code expired`, and `405 Method Not Allowed` ("Make sure you're using `POST` and `HTTPS`"). [R]
- The result is a normal user-controlled inference key on the user's own account. Their credits pay for the calls.

**Deep links.** Take the lowercase-hex SHA-256 of the key and use it in `https://openrouter.ai/logs?api_key_hash={hash}` (activity) and `https://openrouter.ai/keys/{hash}` (key settings). "The links only work for the signed-in owner of the API key." [R]

**Spend limits.**
- The browser `/auth` URL in the guide has **no** limit parameter.
- The API reference has a second endpoint, `POST /api/v1/auth/keys/code` ("Create authorization code"). Its body accepts `callback_url` (required), `code_challenge`, `code_challenge_method`, `limit` ("Credit limit for the API key to be created"), `usage_limit_type` (`daily` | `weekly` | `monthly`), `expires_at` (ISO 8601 with seconds), `key_label` (max 100) and `workspace_id`. It returns `data.id` ("The authorization code ID to use in the exchange request"), `app_id` and `created_at`. The spec's global security is a bearer API key. Source: <https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code> [R]. The TypeScript SDK exposes it as `openRouter.oAuth.createAuthCode({ requestBody: { callbackUrl, codeChallenge, codeChallengeMethod: "S256", limit: 100 } })`. Source: <https://openrouter.ai/docs/client-sdks/typescript/sdks/oauth/README> [R]
- **UNVERIFIED:** how this server-created code ties into the user's browser consent, whose key authenticates the call, and whether `/auth` also accepts `limit` as a query parameter. The guide does not document any of this. Test it before designing around per-user caps on connected accounts.
- The user can always set a limit on the key themselves at `/keys/{hash}`. That this settings page lets them edit the limit or delete the key is **UNVERIFIED**: the guide only says it links to "key settings".

**Revocation.**
- The errors reference lists `authentication` for a key that is "missing, invalid, or revoked". Source: <https://openrouter.ai/docs/api_reference/errors-and-debugging> [R]
- `DELETE /api/v1/keys/{hash}` requires a **management key** on the account that owns the key. Source: <https://openrouter.ai/docs/api/api-reference/api-keys/delete-an-api-key> [R] So Pemby cannot revoke a user's key through the API.
- **UNVERIFIED:** any app-initiated revoke endpoint. None was found. In practice, "Disconnect" in Pemby means deleting the stored key and linking the user to `/keys/{hash}`.

---

## 2. Checking a key's remaining credits and limits

- **`GET https://openrouter.ai/api/v1/key`**, authenticated with the key itself. Source: <https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key> [S]
  - `data` contains `label`, `limit` ("Spending limit in USD", or null), `limit_remaining` (null if unlimited), `limit_reset`, `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`, the `byok_usage*` equivalents, `is_free_tier`, `is_management_key`, `include_byok_in_limit`, `creator_user_id` and `expires_at`.
  - The Limits page describes the same endpoint and fields. Source: <https://openrouter.ai/docs/api_reference/limits> [S]
- **Per-key limit only.** `limit_remaining` covers the key's own cap. It does not show the owning account's credit balance.
- **`GET /api/v1/credits`** returns `total_credits` and `total_usage`, but a management key is required. Source: <https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits> [R] A connected user's inference key therefore **cannot** read their account balance. (That the call fails with a plain inference key is inferred from "Management key required"; not tested.)
- **Exhaustion shows up at request time as HTTP 402.** The errors page has `payment_required`: "The account or API key has insufficient credits." [R] The Limits page adds: "If your account has a negative credit balance, you may see 402 errors, including for free models." [S]
- Guardrail budget limits return **403**, not 402. Source: <https://openrouter.ai/docs/guides/features/guardrails> [R]
- **Detection strategy.** Treat 402 on a user key as "exhausted". Optionally pre-check `/api/v1/key` when `limit_remaining` is not null.

---

## 3. Structured outputs and tool calling

Source: <https://openrouter.ai/docs/guides/features/structured-outputs> [S]

- **Request shape:** `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
- **Model support:** "Structured outputs are supported by select models." Filter the models page with `supported_parameters=structured_outputs`. "The same model may be served by multiple providers, and only some of those providers may support structured outputs."
- **To force a capable endpoint:** set `provider: { require_parameters: true }` (default `false`, "Only use providers that support all parameters in your request"). Source: <https://openrouter.ai/docs/guides/routing/provider-selection> [S]
- **Caveat:** "Enforcement varies by provider: some guarantee schema-conforming output, while others translate your schema into their own structured-output format or treat it as a strong hint." Pemby must still validate every response, for example with Zod.
- **Streaming** is supported and yields partial JSON.
- **Response Healing plugin** (`plugins: [{ id: "response-healing" }]`) repairs malformed JSON. It works with `json_schema` or `json_object`, but "Response Healing only applies to non-streaming requests." Source: <https://openrouter.ai/docs/guides/features/plugins/response-healing> [R]

**Tool calling.** Source: <https://openrouter.ai/docs/guides/features/tool-calling> [R]
- OpenAI-style `tools`.
- Find models that support it via `openrouter.ai/models?supported_parameters=tools`.
- `tool_choice` accepts `"auto"`, `"none"`, or a specific function.
- `parallel_tool_calls: false` limits the model to one call at a time. "default is true for most models."

**Which models, specifically:** this changes constantly. Query the Models API or page at build time rather than hard-coding. Listing today's specific models is **UNVERIFIED** and deliberately omitted.

---

## 4. PDF and file input

Source: <https://openrouter.ai/docs/guides/overview/multimodal/pdfs> [R]

**Format.**
- Send a `type: "file"` content part with `file: { filename, file_data }` in `/api/v1/chat/completions`.
- `file_data` is either a public URL or `data:application/pdf;base64,...`.
- "This feature works on **any** model on OpenRouter."
- "When a model supports file input natively, the PDF is passed directly to the model. When the model does not support file input natively, OpenRouter will parse the file and pass the parsed results to the requested model."

**Engines**, set via `plugins: [{ id: "file-parser", pdf: { engine } }]`:

| Engine | What it does | Cost |
|---|---|---|
| `mistral-ocr` | "Best for scanned documents or PDFs with images" | $2 per 1,000 pages ($2.20 at the US rate) |
| `cloudflare-ai` | Converts to markdown with Cloudflare Workers AI | Free |
| `native` | Only for models with native file input | Charged as input tokens |
| `pdf-text` | Deprecated; redirected to `cloudflare-ai` | — |

- **Default:** "OpenRouter will default first to the model's native file processing capabilities, and if that's not available, we will use the `mistral-ocr` engine."
- **OCR is always billed to OpenRouter credits:** "OCR costs apply to all requests, including BYOK. OpenRouter uses its own Mistral key for OCR (not your BYOK key)."
- **Image cap:** Mistral OCR returns at most 8 images per PDF. Extra images are dropped, but all text is kept.
- **Skip re-parsing:** the response can include file `annotations`. Send them back in follow-up requests to avoid parsing (and paying for) the same PDF again.

**DOCX.**
- The chat PDF docs never mention DOCX. They only say "You can send both PDFs and other file types in the same request."
- The **Files API** (beta) accepts "DOCX, XLSX, and PPTX documents" with a 100 MiB maximum and a 10 GiB workspace quota. It "has no separate charge", and files "do not expire". Its documented consumer is sandbox containers (`file_ids`), and it "works on the global endpoint only"; in-region endpoints return 403. Source: <https://openrouter.ai/docs/guides/features/files-api> [R]
- **UNVERIFIED:** whether a DOCX `file` part in chat completions is parsed.
- **Plan:** convert DOCX to text server-side before calling OpenRouter.

---

## 5. Routing, fallbacks, caching, usage accounting

**Model fallbacks.** Source: <https://openrouter.ai/docs/guides/routing/model-fallbacks> [S]
- Pass `models: [...]` in priority order. "If the first model returns an error, OpenRouter will automatically try the next model."
- Fallback triggers include context-length errors, moderation flags, rate limiting and downtime.
- "Requests are priced using the model that was ultimately used, which will be returned in the `model` attribute of the response body."

**Provider routing** (`provider` object). Source: <https://openrouter.ai/docs/guides/routing/provider-selection> [S]
- `order`, `allow_fallbacks` (default `true`), `require_parameters` (default `false`)
- `data_collection` (`"allow"` | `"deny"`, default `"allow"`)
- `zdr` (boolean), `enforce_distillable_text`
- `only`, `ignore`, `quantizations`, `sort` (price, throughput or latency)
- `preferred_min_throughput`, `preferred_max_latency`, `max_price`

**Prompt caching.** Source: <https://openrouter.ai/docs/guides/best-practices/prompt-caching> [S]
- **Automatic** for OpenAI (min 1024 tokens), DeepSeek, Grok, Moonshot, Groq (Kimi K2), Z.AI and Gemini 2.5+ (implicit).
- **Explicit `cache_control` breakpoints** needed for Anthropic (max 4; 5-minute default TTL or `ttl: "1h"`), Alibaba Qwen and Gemini block-level markers.
- **Pricing:** reads are discounted (e.g. Anthropic 0.1x). Writes may cost more (Anthropic 1.25x for 5 minutes, 2x for 1 hour).
- **Sticky routing:** OpenRouter keeps sending a conversation to the same provider. It expires after 10 minutes idle. `session_id` controls it explicitly: "When provided, OpenRouter uses it as the sticky routing key … Maximum of 256 characters." (`session_id` text [R] from the SDK reference in <https://openrouter.ai/docs/llms-full.txt>.)
- **Usage fields:** `prompt_tokens_details.cached_tokens`, `cache_write_tokens`, `cache_discount`.
- **For Pemby:** put the long static prompt first (system instructions plus the parsed CV). Tailoring many job posts against one CV then gets cache hits.

**Usage accounting.** Source: <https://openrouter.ai/docs/cookbook/administration/usage-accounting> [S]
- "Full usage details are now always included automatically in every response." `usage: { include: true }` and `stream_options.include_usage` are deprecated and have no effect.
- **Fields:**
  - `prompt_tokens`, `completion_tokens`, `total_tokens`
  - `cost` (credits charged)
  - `cost_details.upstream_inference_cost` (BYOK only)
  - `prompt_tokens_details.cached_tokens` / `cache_write_tokens`
  - `completion_tokens_details.reasoning_tokens`
- **Streaming:** usage arrives in the last SSE message.
- **Later lookup:** fetch by generation `id` via `/api/v1/generation`.
- **End-user id:** the API overview types `user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.` Source: <https://openrouter.ai/docs/api_reference/overview> [R] **UNVERIFIED:** whether OpenRouter's analytics group spend by `user`. Record cost per Pemby user in Pemby's own database from `usage.cost`.

**Per-user caps on Pemby's key.** Management keys can `POST /api/v1/keys` with `limit`, `limit_reset` and `include_byok_in_limit`, and `PATCH` or `DELETE` them later. The docs list this use case: "SaaS Applications: Automatically create unique API keys for each customer instance". Source: <https://openrouter.ai/docs/guides/overview/auth/management-api-keys> [S] Guardrails can also add daily, weekly or monthly USD budgets per key. [R]

---

## 6. Platform fees, and BYOK vs "user connects their account"

**Fees.** Source: <https://openrouter.ai/docs/faq> [R] and <https://openrouter.ai/pricing> [S]
- Pay-as-you-go card purchases: "5.5% ($0.80 minimum)". Crypto: 5%.
- "We pass through the pricing of the underlying providers; there is no markup on inference pricing."
- The Pricing page lists **Business at an 8% platform fee** (includes in-region routing) and Enterprise at custom fees (SSO, DPA). [S]
- Refunds only within 24 hours, and "the platform fees are non-refundable". Unused credits may expire after one year. [R]

**BYOK.** Source: <https://openrouter.ai/docs/guides/overview/auth/byok> [S] and FAQ [R]
- **What it is:** an OpenRouter account holder stores *provider* keys (OpenAI, Anthropic, etc.) inside OpenRouter. Routing then uses those provider accounts.
- **Fees:** free up to $25,000 per month of list-price inference on pay-as-you-go ($200,000 on Enterprise). Above that, "5% of what the same model and provider would normally cost on OpenRouter", deducted from OpenRouter credits.
- **Fallback:** by default, if BYOK keys fail, OpenRouter "will fall back to using shared OpenRouter endpoints". "Never use shared capacity" blocks this.
- **Priority:** Prioritized keys first, then OpenRouter endpoints, then Fallback keys.

**How BYOK differs from what Pemby wants.**
- Pemby's "use your own account" is **OAuth PKCE (section 1).** The user's OpenRouter credits pay, and Pemby never sees provider keys.
- **BYOK** is set up by whoever owns the OpenRouter account. Pemby could use it on *its own* account to bill inference to Pemby's direct provider contracts.
- A connected user could also have BYOK configured on their account. That is invisible to Pemby except through `usage.cost_details.upstream_inference_cost`, `is_byok`, and the `byok_usage*` fields on `/key`.
- PDF OCR fees still hit OpenRouter credits either way.

---

## 7. Terms and data protection

**Reselling.** Terms of Service, last updated 2026-08-31, <https://openrouter.ai/terms> [R, HTML source]
- **Prohibited (Section 7):** "access the Site or Service for purposes of reselling API access to Models or otherwise developing a competing service".
- **Contemplated (Section 5.1):** "your Authorized Users, and your customers (to the extent you incorporate the Service into your own products and services)".
- **Flow-down (Section 5.2):** "You will require that all of your Authorized Users and customers access and use the Service and Models only in accordance with this Agreement…". Pemby's own terms must pass on the relevant Model Terms.
- **Reading:** embedding model calls inside a job-search product fits 5.1. Exposing a generic model proxy, or selling credits, would hit Section 7. **This reading is mine, not legal advice.** Confirm with OpenRouter if Pemby ever charges per model call.
- **Licence to OpenRouter:** it gets a license to User Content "solely in connection with operating and providing the Service". Inputs stay yours. [R]

**Personal data (CVs are personal data).**
- **DPA (Terms 10.2):** for commercial, for-profit use, the OpenRouter DPA "is incorporated" into the Terms. [R] The Pricing page lists the Free plan's DPA as "Via Terms of Service" and Enterprise's DPA separately. [S]
- **Privacy policy** (updated 2026-08-31, <https://openrouter.ai/privacy>) [S]:
  - OpenRouter is a controller for its own account data and an intermediary to model providers.
  - EEA/UK transfers rely on adequacy decisions and SCCs.
  - "OpenRouter does not use your Inputs or Outputs for model training."
- **OpenRouter's own logging:** "We do zero logging of your prompts/completions, even if an error occurs, unless you opt-in." [R, FAQ]. The only default storage is metadata such as token counts and latency. The opt-in logging (1% discount) is off by default and must stay off. Source: <https://openrouter.ai/docs/guides/privacy/data-collection> [S] OpenRouter does sample "a small number of prompts for categorization", stored anonymously when you have not opted in. [S]
- **Zero Data Retention (ZDR).** Source: <https://openrouter.ai/docs/guides/features/zdr> [S]
  - Enforce it account-wide in privacy settings, or per request with `provider: { zdr: true }`. The per-request flag can only tighten account settings, never loosen them.
  - List of ZDR endpoints: `GET https://openrouter.ai/api/v1/endpoints/zdr`.
  - In-memory prompt caching is "not considered 'retaining' data".
  - **Caveat for CVs:** "ZDR enforcement only applies to provider routing for inference requests. It does not apply to plugins and tools." That covers the `file-parser` engines, `mistral-ocr` and `cloudflare-ai`. Whether those engines retain data is **UNVERIFIED**.
- **Provider training and retention:** `provider.data_collection: "deny"` or account settings exclude providers that may train or retain data. There are separate controls for paid and free models. Source: <https://openrouter.ai/docs/guides/privacy/provider-logging> [S]
- **EU residency:** In-Region Routing (`https://eu.openrouter.ai/api/v1`) keeps prompts in the EU. It is "available … on the Business and Enterprise plans" (8% fee on Business per the Pricing page). The Files API is unavailable there. Source: <https://openrouter.ai/docs/guides/features/in-region-routing> [S]
- **Free models:** `:free` models allow 50 requests per day (1,000 per day after buying 10 credits). Providers of free models are more likely to train on data. Keep CV traffic off `:free`. (The link between free models and training is **UNVERIFIED** as a general rule; check the per-provider table.)

---

## 8. SDK choice for Next.js

- **Official TypeScript SDK:** `@openrouter/sdk`, npm `latest` = 1.2.123 on 2026-09-15.
  - ESM-only. Call `new OpenRouter({ apiKey }).chat.send({...})`.
  - Includes `oAuth.createAuthCode`, `credits.getCredits` and the key-management methods.
  - Sources: <https://openrouter.ai/docs/client-sdks/typescript/overview> [R], <https://github.com/OpenRouterTeam/typescript-sdk> [S]
  - The docs disagree on call shape: the overview passes `chat.send({ messages, model, ... })` flat, while the OAuth guide wraps it in `chat.send({ chatRequest: {...} })`. Pin the version and check the generated types.
- **Vercel AI SDK provider:** `@openrouter/ai-sdk-provider`, npm `latest` = 3.0.0, peer `ai ^7.0.0` and `zod`. Use `createOpenRouter({ apiKey })` with `generateText`, `streamText`, `generateObject` and tools. The OpenRouter docs recommend it for Next.js ("You can use the Vercel AI SDK to integrate OpenRouter with your Next.js app"). The README says v6 and v5 users should stay on the older 2.x and 1.x lines. Sources: <https://openrouter.ai/docs/guides/community/vercel-ai-sdk> [R], <https://github.com/OpenRouterTeam/ai-sdk-provider> [S]
- **OpenAI SDK:** `new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey, defaultHeaders: { "HTTP-Referer": "<YOUR_SITE_URL>", "X-OpenRouter-Title": "<YOUR_SITE_NAME>" } })`. OpenRouter-only fields such as `models`, `provider` and `plugins` go in the request body as extra fields. Source: <https://openrouter.ai/docs/guides/community/openai-sdk> [R]
- **UNVERIFIED:** how cleanly each SDK passes `plugins` (file-parser), `provider.zdr` and `models[]` in the versions above. Spike this before committing.

---

## Recommended integration design

1. **One server-only `llm` module** wraps every call and takes `{ task, userId, keySource }`. Build it on `@openrouter/ai-sdk-provider` (fits Next.js and Zod) with a raw `fetch` escape hatch for `plugins`, `models[]` and `provider`. Never ship a key to the browser.
2. **Every CV request sends** `provider: { zdr: true, data_collection: "deny", require_parameters: true }`. Also enable ZDR account-wide on Pemby's OpenRouter account and keep prompt logging off.
3. **CV ingest:** convert DOCX to text server-side. Send PDFs as base64 `file` parts to a ZDR model with native file input (`engine: "native"`), so CV data does not go through the `file-parser` plugins that ZDR does not cover. Keep `cloudflare-ai` or `mistral-ocr` as an explicit, disclosed fallback for scanned PDFs. Store the returned `annotations` so a CV is not parsed twice.
4. **Extraction and eligibility** use `response_format: json_schema` with `strict: true`, a `models: [primary, fallback]` list drawn from models whose `supported_parameters` include `structured_outputs`, Zod validation on every response, and one retry (with Response Healing, non-streaming only) on failure.
5. **Cache-friendly prompts:** static instructions, then the parsed CV, then the job post. Pass `session_id` per user and CV so sticky routing keeps cache hits.
6. **Per-user cost ledger** in Pemby's database from `usage.cost`, token counts, cached tokens, `model` and generation `id` on every response. Also send `user: <hashed Pemby user id>` for abuse signals.
7. **Pemby-key users:** mint a per-user sub-key through the management API with a `limit` and `limit_reset`, or enforce quotas in the ledger. Map 402 to "Pemby budget exhausted" and 403 to a guardrail block.
8. **"Connect OpenRouter":** OAuth PKCE (S256, `key_label=Pemby`, verifier held in an httpOnly cookie). Exchange server-side, store `key` and `user_id` encrypted, and show deep links to `/keys/{sha256}` and `/logs`. Spike `/auth/keys/code` with `limit` to see whether a Pemby-suggested cap is possible; it is UNVERIFIED today.
9. **User-key exhaustion:** check `GET /api/v1/key` when `limit_remaining` is not null, and treat 402 as exhausted. Do **not** fall back to Pemby's key silently. Prompt the user to top up, or switch to Pemby credits within their Pemby quota, with explicit consent.
10. **Before launch:** accept the DPA (Terms 10.2), pass the Model Terms on to users in Pemby's own terms, and never expose a generic model proxy (Terms §7). Decide whether EU users need `eu.openrouter.ai`, which requires the Business plan (8% fee) and cannot use the Files API.
