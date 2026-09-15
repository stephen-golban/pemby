# 09 — Desert Ant Labs models: fit for Pemby's AI tasks

Researched 2026-09-15. Scope: every model linked from https://desertant.com/models/ (12 "available", 6 "closed beta"), plus the pages they link to: Hugging Face cards, the `desert-ant-core` GitHub repo, the license site, `llms.txt` and `catalog.json`. Comparison prices come from OpenRouter's own `/api/v1/models` and `/api/v1/embeddings/models` endpoints and Railway's pricing page, all fetched today.

Anything marked **UNVERIFIED** is my inference or estimate, or something the page does not state.

## TL;DR

- **Desert Ant Labs ships small, single-purpose, on-device models.** They target phones, browsers and Node. None of them is a general LLM, OCR engine, or text-embedding model.
- **Tasks 1, 3, 4 and 5 get nothing from the catalog.** Nothing extracts text from scanned PDFs, parses a CV into a profile, infers eligibility, seniority or salary, embeds text for matching, or writes cover letters.
- **Only Schemer (structured extraction) comes close to tasks 2 and 3.** It is disqualified for Pemby:
  - closed beta, with no npm package;
  - extractive only (it cannot infer or normalise);
  - a 1,216-token input window;
  - 13 languages, none of them Romanian or Russian.
- **Two models run in Node on linux-x64 and are marginally useful as helpers:**
  - **Tongue:** 2MB pure JS, text language ID.
  - **Redact:** 23M-param PII masking.
  - Neither is one of Pemby's six tasks.
- **Cheap OpenRouter models cost less than a Railway CPU service would.** Enriching 3,000 job posts a day costs roughly **$3–12/month** at today's OpenRouter list prices. One always-on Railway service with 1 vCPU / 1GB costs **~$30/month**, before any engineering time.

## Vendor-level facts (apply to every model)

| Item | Finding | Source |
|---|---|---|
| What they are | "a frontier AI lab for on-device models and inference … specialized models and native SDKs for Apple, Android, and the web" | https://desertant.com/catalog.json |
| Runtimes | "Core ML on Apple, LiteRT (formerly TensorFlow Lite) on Android, and WebAssembly with LiteRT.js on the web." Node: "import the `/native` subpath, which ships prebuilt for linux-x64, linux-arm64, and darwin-arm64." | https://github.com/Desert-Ant-Labs/desert-ant-core (README) |
| Node-capable GA models | Clear, Ear, Emo, Gist, Redact, Shapes, Tongue ("Apple · Android · Linux · Windows · Web · Node"). Clips: "Apple · Linux · Windows" in README, but the model page says Web/Node "Coming soon". Voz, Title, Align, Uhm: Apple (Swift) only. | README model table; model pages |
| Beta models in the SDK | Moderator, Schemer and Toxic appear in the README only with a "Model" (HF) link, with no SDK docs | README |
| npm packages (registry, 2026-09-15) | `@desert-ant-labs/{gist,redact,tongue,emo,ear,clear,shapes,core}` exist at 3.1.0, created 2026-06-24 to 2026-08-28. `schemer`, `toxic`, `voz`, `title`, `clips` **do not exist** on npm. | registry.npmjs.org |
| License | "Desert Ant Labs Source-Available License" v1.0 (dated 3 July 2026). Weights are downloadable from HF, but **not open source**. | https://license.desertant.com/ |
| Grant | "worldwide, royalty-free, non-exclusive, non-transferable, non-sublicensable, perpetual license to use, reproduce, and modify the Models and SDKs, and to embed and distribute them inside your application." | https://license.desertant.com/1.0.txt |
| Free-tier limit | "free while it stays below 100,000 monthly active devices (MAD) per Platform". The limit applies per model and per platform. Above it: commercial license, price not published. | same |
| MAD definition | "a device (for the web, a browser) on which your application calls a Model at least once during a calendar month". Platform = "each operating-system family, and the web … (for example … Linux, and web)". | same |
| Server-side use | Not prohibited. Barred: distributing the models "as a standalone product, model, SDK, or hosted service", reverse engineering, and "distillation". How MAD is counted when Pemby's **server** calls a model for many users is **UNVERIFIED**: it could be one Linux device, or one per end user. It is irrelevant below 100k either way; ask licensing@desertant.com before relying on it. | same |
| Attribution | "we ask that you credit Desert Ant Labs somewhere your users can reasonably find it." | same |
| Maturity signals | `desert-ant-core`: 280 GitHub stars. HF downloads are small (e.g. Redact 3.66k, Gist 1.73k, Schemer not shown). License v1.0 is ~2.5 months old and all SDKs are at 3.1.0. The company is young with a single maintainer org, so vendor risk is real. | GitHub org, HF org page |
| Pricing / API | No hosted API. "Every model is free up to 100k monthly active devices per SDK. Unlimited inference per user." | every model page |

## Per-model records

Legend for Pemby task fit: **S** = strong, **P** = possible, **N** = no. Tasks: 1 CV text/OCR · 2 CV → profile · 3 job enrichment · 4 embeddings · 5 application kits · 6 speech.

### Schemer (closed beta): structured extraction

- **What:** "Extract typed fields from any text against your own schema, on the device, with a field left empty where the text says nothing." It takes plain JSON Schema. Field types: string, number, boolean, datetime, label, array. "Extracted strings are verbatim substrings of the input with character offsets."
- **Modality / size:** text → JSON. 211M params, "pruned mmBERT-base encoder". Files: int4 AWQ 111MB, int8 218MB, ONNX 111MB/80MB, Core ML 84MB.
- **License:** Source-Available 1.0. The HF repo is not gated.
- **Access:** "Closed beta. Request early access on this page." There is no npm package. The page lists Swift/Kotlin/JavaScript, but the README gives only an HF link. Running it on Railway would mean wiring ONNX Runtime for Node and a tokenizer, and re-implementing the "harness post-processing" that nested schemas rely on. **UNVERIFIED** that this is feasible without their SDK.
- **Languages (HF card):** 13 in total: English, French, Spanish, Italian, Portuguese, German, Dutch, Danish, Norwegian, Swedish, Japanese, Chinese, Polish. **No Romanian, Russian or Ukrainian.**
- **Limits (HF card):** max sequence 1,216 tokens, "approximately 1,100 tokens of document content". "Extractive strings only". It is weaker on "judgment labels requiring world knowledge".
- **Claimed benchmarks:** 0.800 overall accuracy (int8) and 0.793 (int4) on 9,021 records of unseen schemas. Absence detection is 0.911, against "18-43%" for prompted LLMs. It beats NuExtract-2.0-2B (0.643) and GLiNER2-multi (0.585), and trails Qwen 3.5 9B (0.812). Latency is "8.1ms per forward pass (Apple Neural Engine, 256-token input)". CPU latency is not published (**UNVERIFIED**). All figures are the vendor's own, with no independent eval.
- **Fit:** 1 N · 2 **P→N** · 3 **P→N** · 4 N · 5 N · 6 N.
  - **Why not 2/3:** CVs and long job posts exceed ~1,100 tokens, so they would need chunking and merging. Pemby's hardest fields are inferences: remote-eligible from Moldova, seniority, salary normalisation, years of experience computed from dates. An extractive model cannot produce those. The missing Romanian and Russian coverage hurts the target market directly.
  - **What it is good at:** its absence detection ("don't invent a salary") is a real strength. Pemby can get most of it from an LLM with a nullable schema plus a verbatim-quote check.

### Redact (GA): PII detection and redaction

- **What:** token classifier that returns redacted text with placeholders (e.g. `[GIVEN_NAME_1]`, `[EMAIL_1]`) plus spans. Entities: names, street/city/ZIP, email, phone, cards, bank/IBAN/routing, IP, URL, passport, driving licence, tax ID, SSN, government ID, IMEI, and ORG (not redacted by default).
- **Size:** 23M params, "6-layer BIOES token classifier, Multilingual-MiniLM lineage". 11.6MB Core ML, 24.5MB int8 LiteRT.
- **Access:** npm `@desert-ant-labs/redact` 3.1.0. The page says "Run Redact in Node over transcripts, logs and uploads as they arrive." The README documents a Lambda `LD_PRELOAD` shim, so serverless Linux has been exercised.
- **Languages:** 27, "all 24 official EU languages plus Norwegian Bokmål, Norwegian Nynorsk, and Icelandic". That includes Romanian (an EU official language) but **not Russian or Ukrainian**.
- **Limits:** HF card: "Max Sequence Length: 256 characters (recommended default)". A CV has to be processed in windows. The SDK may window internally (**UNVERIFIED**).
- **Claimed benchmarks:** "Catches 88.8% of personal data", 99.6% precision. "The one system with higher recall, GLiNER-PII, is 2.3GB." The WebFetch summary also gave competitor recalls (Rampart 61.4%, OpenAI filter 60.2%); I could not find these in the page text (**UNVERIFIED**).
- **Fit:** not one of tasks 1–6. It could be a **privacy pre-step before sending CV text to OpenRouter**. Caveats:
  - 88.8% recall means roughly 1 in 9 PII items still leaks, so it is not a GDPR guarantee.
  - Russian-language CVs are uncovered.
  - Placeholders must be mapped back before generating a tailored CV (task 5).
  - The LLM does not need the name to parse skills, so masking before task 2 is feasible.

  Rating as a helper: **P (later)**.

### Tongue (GA): text language identification

- **What:** returns a language code plus a reliability score, "from just a few words". Speed: "Tens of microseconds per detection".
- **Size / architecture:** "2MB int8 weights, bundled in the package; nothing is downloaded". "Script router plus hashed character n-grams into an int8 linear head".
- **Access:** npm `@desert-ant-labs/tongue`. README: "Tongue is pure JavaScript, no wasm, no LiteRT.js, no native core". That makes it the lowest-ops model here: it runs in the Next.js server or the worker with no native binary.
- **Languages:** 84, "59 decoded by the model, 25 settled by script alone". Russian is implied by the page ("Cyrillic Mongolian is read as Russian"). Romanian is **UNVERIFIED**: not found in page text, and the HF summary did not list it.
- **Claimed benchmarks:** FLORES-200 at 3 words: 0.933, vs 0.887 for a "293MB competitor". 5 words: 0.974. Tweets: 0.992. Stated limits: 1–2 words "often genuinely undecidable"; Malay/Indonesian confusable; "Brand names, numbers, and code are not language".
- **Fit:** not one of tasks 1–6.
  - **As a pre-filter for task 3:** tag each post's language for free and in-process before paying for LLM enrichment, e.g. route or skip languages Pemby doesn't serve.
  - **Minor task 2 aid:** detect CV language to pick the prompt language.

  Job posts are full of stack names, so run it on the description body, not the title. Rating as a helper: **P (MVP-optional)**.

### Gist (GA): topic tagging

- **What:** multi-label topic scores from a fixed 36-topic taxonomy, 101 languages. The topics (HF `taxonomy.json`) are consumer-content categories, e.g. `technology`, `career`, `business`, `finance`, `gaming`, `true-crime`, `beauty`.
- **Size / architecture:** 74MB multilingual (15MB English-only). "Two-stream classifier: a multilingual static embedding plus hashed n-grams", no transformer.
- **Access:** npm `@desert-ant-labs/gist`, Node supported.
- **Claimed benchmarks:** Recall@1 71%, Recall@3 91% "on 572 human-labeled real posts".
- **Fit:** 3 **N**. Nearly every job post Pemby ingests would score `technology`/`career`. It says nothing about stack, seniority or country eligibility. 4 **N**: the internal static embedding is not exposed as a matching embedding (**UNVERIFIED**), and a topic-level vector is too coarse for matching anyway.

### Title (GA, "internal testing"): titles and descriptions

- **What:** a "short factual title and a one or two sentence description for any passage, on Apple silicon". "Fine-tuned from granite-4.0-350m, 6-bit quantized, MLX".
- **Access:** Swift only; "Title runs on Apple silicon only, through MLX."
- **Maturity:** "Title is in internal testing and its card carries no quality figures. No independent review has been completed, and the model sometimes opens a description with a stock phrase its own instruction forbids."
- **Fit:** 5 **N**. It can't run on Railway, it's 350M params, and its fixed output format is not a cover letter or CV.

### Toxic (closed beta): hate-speech triage

- **What:** "Three scores per text: hateful, abusive, threat". XLM-R-base, 12 layers, 159.6M params. 80MB Core ML 4-bit, 91MB LiteRT int4, ~100MB ONNX. 23 European languages (Romanian **UNVERIFIED**). No npm package.
- **Claimed benchmarks:** "0.847 macro F1 on real Multilingual HateCheck across the seven EU languages", vs Shieldstral-1.0-3B at 0.786. False-flag rate on clean text: the summary said "26 to 30%", but I could not find that string in the page text (**UNVERIFIED**). A rate that high would be heavy for any product use.
- **Fit:** all **N**. Pemby has no user-generated public text to moderate at MVP.

### Moderator (closed beta): NSFW image scoring

- **What:** 8.4M params, MobileNetV4-Conv-Medium @384. 7MB (6-bit) to 18MB (fp16), with "fp32 ONNX for browser or server use". Vendor figures: 87.8% NSFW caught, 6.3% false-block.
- **Fit:** all **N**. It could matter only if Pemby ever accepts profile photos.

### Eye (closed beta): image/video frame scoring

- **What:** pick score, quality axes, scene class, tags, perceptual embeddings. Apple (Swift) now, Android/web "planned". No size, architecture or benchmarks published.
- **Fit:** all **N**. It is **not OCR**, so task 1 gets nothing.

### Face (closed beta): face matching and grouping

- **What:** Apple only. No size or benchmarks published.
- **Fit:** all **N**. Face matching also has no place in a hiring product (bias and GDPR special-category data).

### Who (closed beta): audio-visual speaker labelling

- **What:** "Per-turn: speaker id, face track id, normalized face bbox, millisecond timestamps". Apple first. No size or benchmarks published.
- **Fit:** all **N**.

### Voz (GA): speech recognition

- **What:** transcript plus word timestamps. Built on "NVIDIA's Parakeet TDT 0.6B v3". 467MB compiled Core ML. HF license tag: Source-Available 1.0; base weights CC BY 4.0.
- **Access:** "Voz is Apple only … there is no Android, Linux, or web build." Web/Node: "Coming soon". Ships only as `.mlmodelc`.
- **Languages:** 25, **including Romanian, Russian, Ukrainian**. WER ranges from 3.31% (Italian) to 39.46% (Greek) on read speech.
- **Claimed benchmarks:** 10 min of audio in 2s on iPhone 17 Pro. 7.40% average WER on six Open ASR datasets, vs Whisper large-v3-turbo 7.00%. Stated limit: "a language it doesn't cover produces confident nonsense rather than an error".
- **Fit:** 6 **N** for a Next.js web app on Railway: no Linux or browser build. If Pemby ships a native iOS app one day, it is **P**. Its language list suits Moldova, but the upstream Parakeet weights (CC BY 4.0) are the more portable route (**UNVERIFIED** for CPU speed).

### Ear (GA): spoken language identification

- **What:** language code, confidence, and an `isReliable` flag, from "three thirty-second stretches", "in 250ms", 99 languages. Node supported. Size not published.
- **Claimed benchmark:** 98.5% correct among answers marked reliable on 162 recordings (a small eval).
- **Fit:** 6 **N/P**. It only identifies the language; transcription must come from elsewhere. Useful only if Pemby later routes audio to per-language transcribers, and a multimodal LLM call does that implicitly.

### Align (GA): word timestamps

- **What:** refines Apple SpeechTranscriber word times. ~0.7MB. Swift only (iOS 26+). Claims 20.2ms mean error vs Apple's 106.4ms on LibriSpeech test-clean.
- **Fit:** all **N**.

### Clear (GA): speech enhancement

- **What:** fine-tuned DeepFilterNet 3 (denoise/dereverb). 9MB Core ML, 24MB ONNX. Node supported. Claims 302x realtime on iPhone 16 Pro.
- **Fit:** 6 **N** now. It only matters if Pemby records audio interview answers, and even then it is cosmetic.

### Clips (GA): highlight selection from transcripts

- **What:** xlm-roberta-base, 278M params, 284MB. Swift SDK; Web/Node "Coming soon".
- **Fit:** all **N**.

### Uhm (GA): filler-word detection

- **What:** 45MB Core ML / 51MB ONNX, English-trained. Swift only; Web/Node "Coming soon".
- **Fit:** all **N**. It is a speculative "mock-interview feedback" feature at best.

### Emo (GA): emoji suggestion

- **What:** 5MB Core ML / 11MB LiteRT, 22 languages, Node supported. The WebFetch summary called it "open source"; it is not. It is under the Source-Available license like the rest.
- **Fit:** all **N**.

### Shapes (GA): single-stroke shape recognition

- **What:** 0.2MB Core ML / 1.3MB LiteRT, Node supported.
- **Fit:** all **N**.

## Fit matrix

| Model | Status | Runs on Railway (Node, CPU)? | 1 CV text/OCR | 2 CV→profile | 3 Job enrichment | 4 Embeddings | 5 App kits | 6 Speech |
|---|---|---|---|---|---|---|---|---|
| Schemer | closed beta | ONNX only, no npm pkg (**UNVERIFIED** effort) | N | P→N | P→N | N | N | N |
| Redact | GA | yes (npm, linux-x64) | N | helper P | N | N | N | N |
| Tongue | GA | yes (pure JS) | N | helper P | helper P | N | N | N |
| Gist | GA | yes | N | N | N | N | N | N |
| Title | GA/internal testing | no (Apple MLX) | N | N | N | N | N | N |
| Voz | GA | no (Apple only) | N | N | N | N | N | N (P if native iOS) |
| Ear | GA | yes | N | N | N | N | N | N/P |
| Clear | GA | yes | N | N | N | N | N | N |
| Toxic, Moderator | closed beta | ONNX weights only | N | N | N | N | N | N |
| Eye, Face, Who | closed beta | no (Apple) | N | N | N | N | N | N |
| Align, Clips, Uhm, Emo, Shapes | GA | mixed | N | N | N | N | N | N |

No model rates "strong" for any Pemby task.

## Cost and ops: Railway CPU vs a cheap OpenRouter call

### Railway unit prices (https://railway.com/pricing, 2026-09-15)

- CPU "$0.00000772 per vCPU/s" (≈ $20 per vCPU-month); memory "$0.00000386 per GB/s" (≈ $10 per GB-month); egress $0.05/GB.
- Hobby "$5/month" incl. $5 usage; Pro "$20/month" incl. $20 usage.
- The pricing page mentions no GPUs. That Railway offers **no GPUs at all** is **UNVERIFIED** from this page alone.

### OpenRouter list prices (`/api/v1/models`, `/api/v1/embeddings/models`, 2026-09-15; USD per 1M tokens, in / out)

- **Text, structured-outputs capable:**
  - `mistralai/mistral-nemo` 0.019 / 0.03
  - `openai/gpt-oss-20b` 0.03 / 0.13
  - `openai/gpt-oss-120b` 0.037 / 0.17
  - `deepseek/deepseek-v4-flash` 0.087 / 0.174
  - `openai/gpt-5-nano` 0.05 / 0.40
  - `google/gemini-2.5-flash-lite` 0.10 / 0.40 (accepts files/images)
- **Embeddings:**
  - `baai/bge-m3` 0.01 (8k ctx, multilingual)
  - `qwen/qwen3-embedding-8b` 0.01
  - `openai/text-embedding-3-small` 0.02
  - some `:free` embedding variants are listed
- **OCR** (from note 07): `mistral-ocr` "$2 per 1,000 pages".

Prices vary by provider behind a slug and change often. Treat these as a snapshot, and check that every call returns valid structured output.

### Worked estimates (token counts are **UNVERIFIED** assumptions)

| Workload | Assumption | OpenRouter cost | Desert Ant on Railway |
|---|---|---|---|
| Task 3: 3,000 posts/day | ~1,000 in + ~250 out tokens per post | gpt-oss-20b: ≈ $0.19/day ≈ **$6/mo**; deepseek-v4-flash: ≈ $0.39/day ≈ **$12/mo**; mistral-nemo ≈ **$2.5/mo** | Schemer can't do the inference fields at any price. An always-on 1 vCPU/1GB service alone ≈ **$30/mo**, plus integration work, plus a second LLM pass for what Schemer can't extract. |
| Task 2: one CV | ~3,000 in + ~800 out | gpt-5-nano ≈ $0.00047/CV | n/a |
| Task 1: scanned CV | 2 pages OCR | mistral-ocr ≈ $0.004/CV | nothing available |
| Task 4: embed 3,000 posts/day | ~500 tokens each | bge-m3 ≈ $0.015/day ≈ **$0.45/mo** | nothing available |
| Task 5: one application kit | ~3,000 in + ~2,000 out | gpt-oss-120b ≈ $0.00045/kit (quality **UNVERIFIED**; a stronger model may be worth it here) | nothing available |
| Tongue pre-filter | in-process in existing worker | $0 | ~0 extra RAM/CPU (2MB, microseconds) |
| Redact pre-mask CVs | in-process in existing worker | $0 | 25MB model; resident memory likely 100–300MB (**UNVERIFIED**) ≈ $1–3/mo if it forces a bigger instance |

Ops implications of self-hosting any of these on Railway:

- **Native binaries:** the Node SDK ships a prebuilt native core for linux-x64. Railway's default Nixpacks/Railpack images should load it. **UNVERIFIED** glibc/musl compatibility: avoid Alpine unless tested.
- **Cold starts and memory:** models load into the worker process. Gist is 74MB and Schemer 111–218MB. That raises steady RAM, which Railway bills per GB-second whether or not jobs are running.
- **CPU throughput:** no vendor publishes x86 CPU latency for Schemer, Redact or Gist, only Apple Neural Engine or phone figures. Budget a load test before relying on any throughput number.
- **Vendor and license risk:** young company, v1.0 license, and the server-side MAD count is unclear. Commercial terms above 100k MAD are unpublished.
- **Language coverage:** the market's two key languages, Romanian and Russian, are missing or unverified in every model that could touch CV or job text, except Voz, which Pemby cannot run.

## What I did not check

- I did not run any model. Every accuracy and latency figure above is the vendor's claim.
- Tongue's Romanian coverage, Toxic's full language list, Ear's size, and the internals of the Eye, Face and Who models are not published or not found.
- Whether Schemer's ONNX export can run correctly under ONNX Runtime for Node without Desert Ant's harness.
- How Desert Ant counts MAD for server-side calls. Needs an email to licensing@desertant.com.

## Verdict

- **MVP:** use none of these for tasks 1–6. Use OpenRouter:
  - a cheap structured-output model (gpt-oss-20b / mistral-nemo class) for tasks 2–3;
  - `bge-m3` or `qwen3-embedding-8b` for task 4;
  - native PDF input or `mistral-ocr` for task 1 (see note 07);
  - a somewhat stronger model for task 5.
- **MVP-optional:** **Tongue** (npm, pure JS, 2MB) as a free in-process language tag or pre-filter on job posts before paying for enrichment. Only worth it if post volume is high enough for skipped posts to matter. Confirm Romanian detection first.
- **Later:** **Redact** in the Node worker to mask names, emails and phones in CVs before they go to OpenRouter, if the privacy policy or a GDPR review calls for it. It is not a compliance guarantee (88.8% claimed recall; no Russian).
- **Later / watch:** **Schemer**, only if it adds Romanian and Russian, ships a Node SDK and a longer context. Even then it covers only the extractive fields; eligibility, seniority and salary still need an LLM.
- **Never, for this product:** Gist, Title, Toxic, Moderator, Eye, Face, Who, Align, Clear, Clips, Uhm, Emo, Shapes. **Voz** only if a native iOS app ever exists.
