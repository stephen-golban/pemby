# 08 — Hirify.me teardown and Telegram Bot API for instant delivery

Researched 2026-09-15. Web search quota was exhausted, so this is built from direct fetches: the pages themselves, Hirify's shipped JS bundles and sitemaps, t.me previews, Telegram's official docs, the GitHub API and the npm registry. Anything I could not see first-hand is marked **UNVERIFIED**.

---

## Part 1 — Hirify.me

### What it is and who it's for

- An AI job board that aggregates IT and digital vacancies. Meta description from the shipped bundle: "AI-driven job board and aggregator of IT and Digital vacancies: collects roles from 960+ Telegram channels and thousands of company career sites, removes duplicates and refreshes every ~2 hours." ([hirify.me](https://hirify.me))
- The market is Russian-speaking / CIS. The UI defaults to RU, with EN and UA strings shipped. A sample job page shows CIS-market salary benchmarks: "На СНГ рынке: $4.3к/мес". One Plus-gated segment is "Remote jobs at relocated CIS companies". Hirify Global is pitched as companies "looking for specialists with English from B1 and outside Russia/RB" ([hirify.me/plus](https://hirify.me/plus), bundle strings).
- Categories run from IT through GameDev, design, marketing, HR, sales, support and finance ([sitemap](https://hirify.me/sitemaps/main.xml)). They also target employers ("Post a job for free … Ethical AI screens every application").
- The front end is Nuxt/Vue. `robots.txt` disallows `/api/*`, `/dashboard/*` and `/auth/*`.

### Where jobs come from

- "960+ Telegram-каналов" plus company career sites, deduplicated, "обновляем каждые 2 часа" / "Updated every 2 hours" ([hirify.me](https://hirify.me)).
- Job pages credit the source as "Вакансия из Telegram канала — Название доступно после авторизации": the channel name is hidden until you log in. The description is the raw channel post, reposted verbatim. Real example from [hirify.me/jobs/193975-senior-python-developer](https://hirify.me/jobs/193975-senior-python-developer):
  > `#вакансия #vacancy #onsite #fulltime #Python #Pandas #Flask` … `🗺 Dubai (ON-SITE❗️❗️❗️, FULL-TIME!!!)` `💰 27 0000 - 30 000 AED` `❗️ Strong English is a must!!!`
  
  (The "27 0000" typo comes from the source post. The structured field shows "270 000 - 300 000 AED".)
- On top of the post they extract structured fields: work format, employment type, grade, English level (c1), country, relocation country and skill tags. They also add an **AI job-quality score**: "45 — Не очень вакансия … Перегруженная роль / Неплохая зарплата / Офисная работа — Оценка от Hirify AI".
- A salary comparison sits alongside ("Очень мало … медиана 610к AED … По похожим ролям (42)"), plus a scam warning on every page.

### Filters and preferences ("15+ параметров")

Taken from the homepage and the shipped UI strings. Almost every dimension supports both include and **exclude**:
- specialization (hierarchical: "Selecting a parent includes every role inside it"), skills, industries, grades (trainee → C-level), company type (startup / corporate / outsourcing) and company domains
- remote type (remote / hybrid / onsite), work type (full-time, part-time, project)
- region, country, relocation region ("If you are looking for positions in Europe, be sure to **exclude** Russia in the country filter (sometimes get parsed as Europe)")
- English level (A1–C2), job language (RU/EN/UA)
- "Minimum salary (in USD)", "Show vacancies without salary"
- search: "Exact match for search terms"

There is **no citizenship, work-authorization or "hireable from my country" filter** in the strings I scanned. Region and country filters describe the job's location, not the candidate's eligibility.

### Subscription, onboarding and delivery

- The model is a **saved filter → Telegram notifications**. Wizard strings: "Save filter" → "Subscription name (e.g., Remote Python Jobs)" → "Get notifications? Do you want to receive notifications about new jobs in Telegram?" → "Yes, get notifications" → "Your filter has been saved and Telegram notifications are enabled."
- Users can hold several saved filters: "Manage saved filters and notification subscriptions".
- Account linking is a **deep link with a server-generated token**. The front end calls `/auth/telegram/generate-token`, receives `telegram_connect_url`, and shows "Click the button, start the bot in Telegram, and then return here" and then "Your Telegram account is now connected." There is also `/auth/telegram/disconnect` ("Unlink Telegram?"). The subscription flow has `requiresTelegram: true`: you cannot activate an alert without connecting Telegram. Email and web push alerts do not exist in the bundle.
- Notifications work on the free tier: "this doesn't require Plus" ([hirify.me/plus](https://hirify.me/plus)).
- **Quiet hours:** "Enable schedule to receive job notifications only during convenient hours. If a vacancy appears outside this time range, the notification will be sent at the beginning of the next available period."
- **A too-broad filter only gets a warning:** "Your filters are too general, you will receive ~1500 irrelevant vacancies per day, it's better to choose more specific filters." Delivery is filter-driven volume, not a strong-match gate.
- **Urgency nudge:** "It's very important to respond quickly - recruiters usually review the first 50 applications most thoroughly."
- **How instant it is:** ingestion runs every ~2 h, so alerts can be no fresher than that crawl cycle. Whether messages are sent one per job or grouped is **UNVERIFIED**.
- **Message format and buttons are UNVERIFIED.** I could not receive bot messages without an account. The web UI has "Hide vacancy", "Hide company", "Report vacancy" (with a reason), "Report broken link", "Dislike track" and tracked/viewed vacancies. Whether the Telegram card carries those as inline buttons is unknown.
- **Telegram presence** (t.me previews fetched):
  - [@hirify_support_bot](https://t.me/hirify_support_bot): "hirify.me support chat with founder". This is the only t.me link on the homepage.
  - [@hirify_hire_support_bot](https://t.me/hirify_hire_support_bot): "Hirify for hire | Chat with founder" (employer side).
  - [@hirify_bot](https://t.me/hirify_bot) (title "hirify"), [@hirifyme_bot](https://t.me/hirifyme_bot) ("Hirify.me Bot") and [@hirify_notify_bot](https://t.me/hirify_notify_bot) ("Нотификашка") all exist. Which one sends the alerts is **UNVERIFIED**, because the connect URL is issued by an authenticated API.
  - Channels [t.me/s/hirify](https://t.me/s/hirify) and [t.me/s/hirify_me](https://t.me/s/hirify_me) are essentially empty. Their only posts are "Channel created" (2024-09-12) and a rename to «hirify.me». There is **no public job channel** to sample.

### Pricing ([hirify.me/plus](https://hirify.me/plus))

- Free: jobs from Telegram channels, Telegram alerts, "3 matches and cover letters".
- **Hirify Plus is a one-time payment, not a subscription** ("This is a one-time payment, not a subscription"; "non-refund policy"): **399 ₽ / 1 month, 990 ₽ / 3 months, 1 990 ₽ / 12 months**.
- Plus unlocks "600+ companies with Eastern European roots plus 6,200+ international tech companies" (the "70000+ международных вакансий"), company names, LinkedIn and apply links, unlimited AI "matches" and cover letters, "AI прожарка" (CV roasting) and an AI copilot. Contacts and the company name are gated ("Plus is required to match and view contacts").
- "Matches" ([hirify.me/matches](https://hirify.me/matches)) is an on-demand compatibility check and cover-letter generator, not a push feed. It comes in "Два формата: для Telegram и карьерных сайтов" (Telegram-style vs career-site cover letters). "AI matching (closed beta)" also appears in the strings.
- Payment method is **UNVERIFIED** (roubles implies a Russian acquirer).

### Weaknesses Pemby can beat

1. **It is a feed with alerts bolted on.** Alerts fire on filter hits. Hirify itself warns about "~1500 irrelevant vacancies per day". Nothing checks that the user can actually be hired.
2. **No candidate-eligibility model.** It filters by job location, not "accepts applicants from Moldova". The Europe-parses-as-Russia caveat shows how rough the location parsing is.
3. **Freshness is capped by the ~2 h crawl**, while its own copy says the first 50 applicants win.
4. **The data is raw Telegram posts** (emoji, all-caps, typos, hashtags) with thin sourcing. Source names and apply links sit behind login or Plus.
5. **Telegram is the only alert channel**, and it is required to activate alerts at all. There is no email, web push, or "nothing matched today" transparency.
6. **Match scoring is paywalled, on demand, and separate from alerts.** The strong-match gate Pemby wants is exactly what Hirify doesn't do in delivery.
7. **The RU/CIS framing** (rouble pricing, CIS salary benchmarks) leaves a gap for English- and Romanian-speaking users in Moldova and similar excluded markets.
8. **Its Telegram channels are empty** and several similarly named bots exist, which makes the brand hard to find and trust inside Telegram.

---

## Part 2 — Telegram Bot API (current: Bot API 10.3, 2026-08-24, per [core.telegram.org/bots/api](https://core.telegram.org/bots/api#recent-changes))

### Linking a Telegram chat to an existing web account

**Deep link (recommended; this is what Hirify does).** [bots/features#deep-linking](https://core.telegram.org/bots/features#deep-linking)
- `https://t.me/<bot>?start=<payload>` makes the bot receive `/start <payload>`. "A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content. The parameter can be up to 64 characters long."
- Pattern: the logged-in web user clicks "Connect Telegram". The server mints a random, single-use, short-TTL token (for example 32 bytes of base64url, which is 43 characters and fits in 64), stored as token→user_id. On `/start <token>` the bot binds `message.chat.id` and `from.id` to the user and deletes the token. Never put a raw user id in the payload.
- The same trick works in reverse, in answerCallbackQuery's `url` note: "you may use links like t.me/your_bot?start=XXXX that open your bot with a parameter".

**Telegram Login (web).** [core.telegram.org/widgets/login](https://core.telegram.org/widgets/login) now redirects to [core.telegram.org/bots/telegram-login](https://core.telegram.org/bots/telegram-login).
- **New (2026): OpenID Connect.** "Our implementation follows the standard Authorization Code Flow with PKCE support." Register Allowed URLs in @BotFather to get a Client ID and Secret. Discovery is at `https://oauth.telegram.org/.well-known/openid-configuration`; the endpoints are `https://oauth.telegram.org/auth`, `/token` and `/.well-known/jwks.json`. Verify the `id_token` server-side: signed by Telegram, "`iss` is `https://oauth.telegram.org`, `aud` matches your Bot ID, and the token has not expired (`exp`)". Landmine: the JS library needs a popup, and it fails if the site sends `Cross-Origin-Opener-Policy: same-origin`.
- **Legacy widget** (archived at [core.telegram.org/widgets/login-legacy](https://core.telegram.org/widgets/login-legacy)): set the domain with `/setdomain` in @BotFather. It returns `id, first_name, last_name, username, photo_url, auth_date, hash`. Verification, verbatim: "Data-check-string is a concatenation of all received fields, sorted in alphabetical order, in the format key=<value> with a line feed character ('\n', 0x0A) used as separator … `secret_key = SHA256(<bot_token>)`; `if (hex(HMAC_SHA256(data_check_string, secret_key)) == hash)` … you can additionally check the auth_date field". Exclude `hash` from the string, use a constant-time compare, and reject stale `auth_date` (for example over 1 day; the threshold is our choice).
- **Login URL button** (`LoginUrl` in [bots/api](https://core.telegram.org/bots/api#loginurl)): an inline button that opens an HTTPS URL "with user authorization data added to the query string", "a great replacement for the Telegram Login Widget when the user is coming from Telegram". It uses the same hash check.
- **For Pemby:** the deep link is enough to link a chat, since it is the only way to obtain a `chat_id` the bot may message. Telegram Login matters only if we want "Sign in with Telegram".

### Broadcast limits and paid broadcasts ([bots/faq](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this))

- Per chat: "avoid sending more than one message per second. We may allow short bursts … eventually you'll begin receiving 429 errors."
- Groups: "not be able to send more than 20 messages per minute."
- Bulk: "not able to broadcast more than about 30 messages per second, unless they enable paid broadcasts."
- **Paid broadcasts:** enable in @BotFather; the per-message flag is `allow_paid_broadcast`. "Pass True to allow up to 1000 messages per second, ignoring broadcasting limits for a fee of 0.1 Telegram Stars per message" ([bots/api#sendmessage](https://core.telegram.org/bots/api#sendmessage)). The charge applies only above the free 30/s and only to successfully delivered messages. **Eligibility:** "at least 100,000 Stars on its balance and at least 100,000 monthly active users" (FAQ; also [Bot Developer TOS §6.2.5](https://telegram.org/tos/bot-developers), which calls the fee "non-refundable"). Irrelevant for Pemby at launch.
- grammY's guidance ([grammy.dev/advanced/flood](https://grammy.dev/advanced/flood)): honour `429` + `retry_after` with the auto-retry plugin, "Do not add artificial delays", "Do not ignore 429 errors". In our own sender, a global ~25–30/s token bucket plus a per-chat 1/s gate is a sensible **design choice**, not a Telegram rule.
- Blocked users: sends fail with 403 (**UNVERIFIED wording**; standard behaviour). A `my_chat_member` update arrives "only when the bot is blocked or unblocked by the user" ([bots/api#update](https://core.telegram.org/bots/api#update)), so mark the channel dead then.

### Message formatting, keyboards, callbacks, Mini Apps, editing

- **Text limit:** "1-4096 characters after entities parsing".
- **HTML** (`parse_mode: "HTML"`): `<b> <i> <u> <s> <tg-spoiler> <a href> <code> <pre> <blockquote>` plus `<tg-time>` ([bots/api#html-style](https://core.telegram.org/bots/api#html-style)). Only `<`, `>` and `&` need escaping, which makes it **safer than MarkdownV2 for scraped job text**.
- **MarkdownV2:** "In all other places characters '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!' must be escaped with the preceding character '\'" ([bots/api#markdownv2-style](https://core.telegram.org/bots/api#markdownv2-style)). Job titles like "C#/.NET Dev (Remote!)" break unescaped MarkdownV2.
- Bot API 10.1–10.3 added **Rich Messages** (structured blocks, tables, expandable quotes, buttons inside rich blocks). They are new and worth a look later; plain HTML is enough for v1.
- **Inline keyboards:** `InlineKeyboardButton` takes `url`, `callback_data` ("1-64 bytes"), `web_app` or `login_url`. The 64-byte cap means callback data must be compact, e.g. `a:<jobMatchId>` / `s:<id>` / `x:<id>` with a short id, not JSON.
- **callback_query handling:** "After the user presses a callback button, Telegram clients will display a progress bar until you call answerCallbackQuery. It is, therefore, necessary to react by calling answerCallbackQuery even if no notification to the user is needed" ([bots/api#answercallbackquery](https://core.telegram.org/bots/api#answercallbackquery)). It can show a toast `text`, `show_alert`, or open a `url`.
- **Mini App button:** `web_app: WebAppInfo{url}`, "Available only in private chats between a user and the bot". It opens the Pemby web view inside Telegram; initData validation is documented at [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps) (**not re-fetched in this pass**).
- **Editing after send:** `editMessageText` ("edit text, rich and game messages") and `editMessageReplyMarkup` ("edit only the reply markup") return the edited Message ([bots/api#updating-messages](https://core.telegram.org/bots/api#updating-messages)). The docs' 48-hour edit window covers only *business* messages "not sent by the bot and do not contain an inline keyboard". No time limit is stated for the bot's own messages, so updating a card to "Applied ✓" later should work (**UNVERIFIED for very old messages**). `deleteMessage` *is* limited: "A message can only be deleted if it was sent less than 48 hours ago." Store `(chat_id, message_id)` per delivered match to allow edits.

### Webhooks vs long polling on Railway

- "Two mutually exclusive ways … getUpdates … and webhooks … Incoming updates are stored on the server until the bot receives them either way, but they will not be kept longer than 24 hours" ([bots/api#getting-updates](https://core.telegram.org/bots/api#getting-updates)).
- **Webhook rules:** HTTPS only; ports "443, 80, 88, 8443" ([bots/faq](https://core.telegram.org/bots/faq)); no redirects. A non-2xx response gets retried: "we will repeat the request and give up after a reasonable amount of attempts". `max_connections` is 1–100, default 40.
- **`secret_token`** in `setWebhook`: "1-256 characters. Only characters A-Z, a-z, 0-9, _ and - are allowed", sent as header `X-Telegram-Bot-Api-Secret-Token` "in every webhook request". Compare it in constant time and return 401 otherwise ([bots/api#setwebhook](https://core.telegram.org/bots/api#setwebhook)). grammY's `webhookCallback(bot, "express", { secretToken })` does this check. The option name is from grammY's docs; the exact signature is **UNVERIFIED in this pass**.
- **grammY's guidance** ([grammy.dev/guide/deployment-types](https://grammy.dev/guide/deployment-types)): long polling is "simpler", while webhooks are cheaper and scale to zero. Keep webhook handlers fast: grammY has a 10 s middleware timeout, a missed timeout makes Telegram resend the update, and the advice is "Don't use long-running middleware"; queue the work instead.
- **Railway:** free automatic TLS on a Railway-provided domain or a custom domain ([docs.railway.com/guides/public-networking](https://docs.railway.com/guides/public-networking)), so a webhook on 443 works without cert work. **Serverless/App Sleeping** wakes a service only on inbound traffic, "the first request sent to a slept service may return a 502 Bad Gateway" ([docs.railway.com/reference/app-sleeping](https://docs.railway.com/reference/app-sleeping)), and it sleeps services with no outbound traffic for about 5 minutes. **Recommendation:** use a webhook on the always-on API service with Serverless **off** (a 502 is non-2xx and will just be retried). Run the match-to-send fan-out in a separate worker that calls `sendMessage` directly; outgoing sends don't need either update mode. Long polling is fine for a single always-on replica but conflicts with multiple replicas (409 Conflict: **UNVERIFIED wording**).

### Telegram Stars for digital goods

- **Mandatory inside Telegram:** "your bot or mini app must use Telegram Stars for the sale of digital goods and services inside Telegram apps, regardless of any other web portals, apps, services or payment providers you may have set up outside the Telegram ecosystem" ([bots/payments-stars](https://core.telegram.org/bots/payments-stars)). The TOS adds that "all transactions pertaining to digital goods and services must be executed exclusively through the exchange of Telegram Stars". Penalties for alternative payment systems include Star debits, removal, a public SCAM label and account termination ([Bot Developer TOS §6](https://telegram.org/tos/bot-developers)). **Implication:** a Pemby Pro sold *inside* the bot or Mini App must use Stars. Selling on pemby.app with a web checkout is outside Telegram. Whether the bot may even *link* to an external checkout for digital goods is a grey area; treat it as risky (**UNVERIFIED**).
- **Mechanics:** `sendInvoice` / `createInvoiceLink` with `currency: "XTR"`, `provider_token: ""`, and exactly one price item. Answer `pre_checkout_query` within 10 s, deliver on `successful_payment`, refund with `refundStarPayment`, and the bot "must be able to respond to the command /paysupport". **Subscriptions:** `subscription_period` "must always be 2592000 (30 days)" and requires XTR ([bots/api#createinvoicelink](https://core.telegram.org/bots/api#createinvoicelink)). `editUserStarSubscription` and `getStarTransactions` exist.
- **Payout (TOS §6.2.4 / 6.2.4.1):** "Developers can receive an equivalent of 0.013 USD worth of rewards for each Telegram Star". Stars "may not become available … for up to 21 days after their receipt". Rewards are processed by **Fragment**: "Fragment may be unable to issue rewards for certain users or in certain countries, in accordance with regulatory considerations", and Telegram "will not … offer any alternative compensation". The API docs say withdrawal returns "a unique URL to a Fragment page where the user will be able to specify and submit the address of the TON wallet" ([core.telegram.org/api/stars](https://core.telegram.org/api/stars)). The live client config shows `stars_revenue_withdrawal_min: 1000`, `stars_revenue_withdrawal_max: 25000000` and `stars_usd_withdraw_rate_x1000: 1300`, i.e. $1.30 per 1 000 Stars, matching $0.013 ([core.telegram.org/api/config](https://core.telegram.org/api/config); this is an example config and can change). Alternatives: spend Stars on Telegram Ads at $0.02/Star in ad credit (§6.2.3), or on paid broadcasts.
- **Moldovan founder:** nothing I read names Moldova as blocked, but Fragment reserves the right to refuse by country, and the payout arrives as TON crypto that must be off-ramped. Whether Fragment pays out to Moldova, and what KYC it needs, is **UNVERIFIED**; test with a small 1 000-Star withdrawal. Economics: users buy Stars through Apple/Google at store prices (the config shows a `stars_usd_sell_rate_x1000` of 1410), while the developer receives about $0.013 per Star. **Stars are a hedge channel, not the main revenue rail** (cross-check with `06-payments-moldova.md`).

### Node library in 2026: grammY

| | grammY | telegraf |
|---|---|---|
| Latest | **v1.46.0**, 2026-08-26 ([GitHub releases](https://github.com/grammyjs/grammY/releases), [npm](https://www.npmjs.com/package/grammy)) | **v4.16.3, 2024-02-29** ([GitHub](https://github.com/telegraf/telegraf), [npm](https://www.npmjs.com/package/telegraf)) |
| Last push | 2026-08-26 | 2025-01-11 (a Snyk dependency-bump merge) |
| Bot API coverage | "Bot API 10.3" badge, i.e. current | README says "Full Telegram Bot API 7.1 support", three majors behind |
| npm downloads (week of 2026-09-05) | 4,929,435 | 301,892 |
| Stars / archived | 3.7k / no | 9.2k / no, but dormant |

**Recommendation: grammY.** It tracks the Bot API within days, is TypeScript-first and MIT-licensed, runs on Node, Deno and Bun, and has an official plugin set (auto-retry for 429s, runner for concurrent polling, conversations, menu). Telegraf has had no release in about 2.5 years and lacks Stars subscriptions, paid broadcasts and Rich Messages.

---

## Design implications for Pemby's brief + instant delivery

1. **Gate on eligibility plus a strong match, not filters.** Hirify's own "~1500 irrelevant vacancies per day" warning is the anti-pattern. Only a scored match whose eligibility is confirmed for the user's country becomes a notification; everything else stays out of Telegram, email and push.
2. **Beat the 2 h crawl.** Prioritize sources we can poll often or get pushed (ATS APIs, RSS, channel listeners), and show "found N min after posting". Hirify's "first 50 applicants" pitch shows users care.
3. **Link Telegram with a deep link:** a single-use base64url token of 64 characters or fewer, via `/start <token>`. Keep email and web push as equal channels, so Telegram is never required the way it is on Hirify.
4. **One match = one message.** Send HTML-formatted cards (escape only `<>&`) with a short "why it matches / why you're eligible" line, and inline buttons carrying compact `callback_data` (64 bytes or fewer): Apply (URL), Save, Not for me, plus a `web_app` "Open brief". Always `answerCallbackQuery`.
5. **Store `(chat_id, message_id)` per delivery** and use `editMessageText`/`editMessageReplyMarkup` to flip cards to "Applied ✓", "Saved" or "Job closed". Do not rely on deletion, which is limited to 48 hours.
6. **Build the sender as a queue-backed worker** with a ~25/s global limit, 1 msg/s per chat, grammY auto-retry on 429, and a dead-channel mark on block (`my_chat_member`). Paid broadcasts (100k MAU + 100k Stars) are out of reach and unnecessary.
7. **Receive updates by webhook** on the always-on Railway API service with `secret_token` verification. Keep Serverless off, ack fast, and hand work to the queue.
8. **Offer quiet hours as the only batching** (Hirify's schedule feature is a good idea). Hold matches outside the window and release them at window start. The web brief always shows the true state, including an honest "no strong matches today".
9. **Clean the posting before showing it.** Normalize raw posts into structured, readable cards with transparent sourcing and apply links. Don't paywall the source or contacts the way Hirify does.
10. **Monetize primarily on the web, with Stars as a hedge.** Any in-bot or Mini App sale of Pro must use Stars (XTR, 30-day subscriptions, `/paysupport`). Payout is about $0.013/Star via Fragment in TON after up to 21 days, and Fragment's availability in Moldova is unverified, so test a small withdrawal early.
