# 06 — Taking card payments as a Moldovan seller

Researched 2026-09-15. Question: Pemby is a SaaS with $9–29/month subscriptions, sold worldwide. The seller is a Moldovan entity (SRL or ÎI) owned by a Moldovan citizen. Which providers let that seller (a) open an account and pass KYC, and (b) get paid out to a Moldovan business bank account? Which of them act as merchant of record (MoR) and handle VAT and sales tax?

**Method.** I used first-party pages only: provider docs (fetched raw, or through their `.md` / `llms.txt` versions), help centres, pricing pages, and one provider's public source code (Gumroad, `antiwork/gumroad` on GitHub). The session's web-search budget was used up before this task began, so I found every page by following the providers' own doc indexes and sitemaps, not by searching. Some sites blocked automated fetches: 2checkout.com (Incapsula), payoneer.com (403/404), and Gumroad's help centre (renders only in JavaScript). Anything I could not read at the source is marked **UNVERIFIED**.

**Labels.** **VERIFIED**: I read the quoted text myself at the cited URL on 2026-09-15. **UNVERIFIED**: I could not confirm it first-hand. Treat it as unknown.

---

## Summary table

| Provider | Moldovan seller? | Payout to Moldovan bank | Headline fee | MoR | Subscriptions |
|---|---|---|---|---|---|
| **Polar.sh** | **Yes**, Moldova named (VERIFIED) | Stripe Connect Express to a Moldovan bank, **in MDL** | 5% + 50¢, +1.5% non-US cards, plus Stripe payout fees | Yes | Yes |
| **Paddle** | **Yes**, "anywhere in the world" except a list that omits Moldova (VERIFIED) | SWIFT wire (USD/EUR among 13 currencies) or Payoneer | 5% + 50¢; $/€/£15 SWIFT fee per payout | Yes | Yes |
| **Creem** | **Yes**, Moldova named (VERIFIED) | Local bank transfer through its partner (Wise) | 3.9% + 40¢; payout fee max(7 EUR/USD, 1%) | Yes | Yes |
| **Dodo Payments** | **Yes**, Moldova named (VERIFIED) | Bank payout from USD/GBP/EUR wallets; route "varies by country" | 4% + 40¢, +1.5% intl, +0.5% subscriptions | Yes | Yes |
| **Lemon Squeezy** | **Yes** for bank payouts, Moldova named (VERIFIED) | Stripe bank payout or PayPal (USD) | 5% + 50¢, +1.5% intl, +0.5% subs; 1% payout fee | Yes | Yes |
| **Gumroad** | **Likely yes**; Moldova is in the source code, not a policy page | Stripe cross-border payout in **MDL** | 10% + 50¢ | Yes (since 2025-01-01) | Yes (memberships) |
| **FastSpring** | **UNVERIFIED** | Hyperwallet: SWIFT wire, bank, PayPal (USD/EUR/GBP/AUD/CAD) | UNVERIFIED (not published) | Yes | Yes |
| **2Checkout (Verifone)** | **UNVERIFIED** | Wire in USD/GBP/EUR ($15), PayPal, or Payoneer card | UNVERIFIED | UNVERIFIED (2Monetize is a "reseller" package) | Yes (2Subscribe) |
| **Stripe Managed Payments** | **No**, MD not a supported business location (VERIFIED) | n/a | n/a | Yes | via Billing |
| **maib e-commerce** | **Yes**, Moldovan legal forms required (VERIFIED) | Your own maib account (you must be a maib client) | UNVERIFIED (not in docs) | **No**, you are the seller | Yes, recurring API (VERIFIED) |
| **Paynet** | Likely (Moldovan PSP) | UNVERIFIED | UNVERIFIED | No | UNVERIFIED |
| **Victoriabank, MICB (Moldindconbank)** | UNVERIFIED | UNVERIFIED | UNVERIFIED | No | UNVERIFIED |
| **Payoneer (as a payout rail)** | Moldova availability UNVERIFIED | Withdraw to local bank | n/a | n/a | n/a |

---

## 1. Polar.sh

**Supports a Moldovan seller: YES (VERIFIED).** The earlier claim that "Polar docs confirm Moldova payouts" is **correct**.

- URL: <https://polar.sh/docs/merchant-of-record/supported-countries> (raw: `…/supported-countries.md`)
- Quote: "Polar uses Stripe Connect Express to issue payouts to residents or businesses in any of the countries below." The list that follows includes "🇲🇩 Moldova".
- Same page: "As the Merchant of Record, Polar takes care of charging customers, so Stripe Payments doesn't need to be available in your country. All you need is to be in a country supported by Stripe Connect Express to receive payouts."
- Same page, FAQ: "all payments from customers are made to Polar (US). Stripe Connect Express is then used to issue payouts … We only use the transfer and payout feature of Stripe Connect Express".

**Payouts run on Stripe Connect Express: YES (VERIFIED).**
- <https://polar.sh/docs/features/finance/accounts>: "Polar uses Stripe Connect Express for payout accounts." Onboarding: "If this is a business or organization, pick the country of tax residency … Stripe will ask for your identity details, business information (if applicable), and the bank account you want to be paid out to."
- **Gotcha: currency.** Same page: "Stripe Connect requires the bank account you connect to be in the same country as the business and to use that country's local currency." For a Moldovan SRL that means **a Moldovan bank account in MDL**, not EUR or USD. Also: "Most multi-currency or 'borderless' accounts (Wise, Payoneer, Revolut, etc.) do not satisfy Stripe's verification for Connect payouts."
- <https://polar.sh/docs/features/finance/payouts> lists a minimum payout of "MDL | $40.00", which confirms MDL is a payout currency.
- **Stripe-side corroboration (partial).** Stripe's Global Payouts docs list "Moldova | MDL | 500.00 MDL" as a recipient minimum (<https://docs.stripe.com/global-payouts/send-money>). Stripe's cross-border page now says cross-border payouts to `recipient` accounts go through Global Payouts (<https://docs.stripe.com/connect/service-agreement-types>). I could not confirm which Stripe mechanism Polar uses internally. I also could not confirm whether Stripe accepts a Moldovan **company** rather than only an individual, because Stripe's required-verification page renders in JavaScript. Polar's FAQ tells you to check exactly this setting ("Service Agreement: recipient", "Account Country"). **UNVERIFIED: company business type for MD.**

**Fees (VERIFIED)**, from <https://polar.sh/docs/merchant-of-record/fees>:
- Starter: "5% + 50¢". Pro: $20/mo for "3.8% + 40¢". Plus "+1.5% for international cards (non-US)". Disputes cost $15.
- Stripe payout fees: "$2 per month in which you have at least one active payout", "0.25% + $0.25 per payout", "Cross-border fees (currency conversion): 0.25% within the EU, up to 1% elsewhere".

**Gotchas (VERIFIED)**, from <https://polar.sh/docs/features/finance/payouts> and <https://polar.sh/docs/merchant-of-record/account-reviews>:
- A 7-day settlement delay applies to organizations created on or after 2026-05-12.
- Payouts are manual withdrawals. The first review can take "up to 14 days" and includes KYC through Stripe Identity.
- Polar holds sellers to a 0.4% chargeback rate. For business accounts "you will need a business bank account".

**MoR: Yes. Subscriptions: Yes.**

---

## 2. Paddle

**Supports a Moldovan seller: YES (VERIFIED by exclusion).**
- URL: <https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle>
- Quote: "Paddle works with software businesses anywhere in the world with the exception of the unsupported countries listed below." The list: Afghanistan, Antarctica, Belarus, Burma, Central African Republic, Cuba, Crimea, DR Congo, Donetsk, Haiti, Iran, Iraq, Kherson, Libya, Luhansk, Mali, Netherlands Antilles, Nicaragua, North Korea, Russia, Somalia, South Sudan, Sudan, Syria, Venezuela, Yemen, Zaporizhzhia, Zimbabwe. **Moldova is not on it.** The page also says "This list is subject to change."

**Payout to a Moldovan bank (VERIFIED)**
- <https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid>: "You can receive your payment either via wire transfer or Payoneer." Payouts are monthly: a balance above your threshold "(min $100)" is sent "by the 15th".
- <https://www.paddle.com/help/manage/get-paid/can-i-be-paid-in-my-local-currency>: payout currencies are AUD, GBP, CAD, CNY, CZK, DKK, **EUR**, HUF, PLN, ZAR, SEK, CHF, **USD**. MDL is not listed: "If your local currency isn't supported we can send the payout in the most competitive Default Currency and your bank will convert". Conversion margin is "up to 1.5%" if the payout currency differs from the balance currency.
- <https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts>: a payout outside local rails "must be sent internationally via SWIFT. These transfers will incur a wire fee of $/€/£15." A EUR or USD payout to a Moldovan IBAN is SWIFT, so expect **15 per monthly payout** plus any charges from intermediary or receiving banks.
- The payout-settings form takes BIC/SWIFT and IBAN (<https://www.paddle.com/help/manage/get-paid/how-do-i-set-up-my-payout-settings>).

**Fees (VERIFIED):** "5% + 50¢ per Checkout transaction" (<https://www.paddle.com/pricing>).

**KYC (VERIFIED):** domain review, then business verification. You may be asked for "government issued business registration documents" and a shareholder breakdown ">25% ownership". Manual review takes "2-4 business days" (<https://www.paddle.com/help/start/account-verification/what-is-business-verification>). This step "is not required for individuals or sole traders".

**MoR: Yes. Subscriptions: Yes.** Gotcha: Paddle reviews the product and domain before it activates the account, so the live site and pricing must be ready first. Whether a Moldovan ÎI counts as a "sole trader" there is **UNVERIFIED**.

---

## 3. Creem (creem.io)

**Supports a Moldovan seller: YES (VERIFIED).**
- URL: <https://docs.creem.io/merchant-of-record/supported-countries>
- Quote: "We support merchants in **86 countries**." The table includes "Moldova" with a check under "Local Bank". Moldova does **not** carry the `**` flag that marks bank-partner restrictions (the flagged countries are Bangladesh, Colombia, Nepal, Pakistan, Tanzania and Ukraine).
- "If you don't see your country listed below, sorry, you won't be able to use Creem at this time."

**Payout (VERIFIED)**
- Same page: "Local Bank Transfer … Available in all 86 supported countries. Payout fee: 7 EUR/USD or 1% of the payout amount, whichever is higher. Some countries have Wise transfer restrictions". The restrictions note points to Wise's availability page, so the transfer partner is Wise.
- <https://docs.creem.io/merchant-of-record/finance/payouts>: payouts run on the 1st and 15th, with a minimum balance of 50 USD or 50 EUR. There is a USDC-on-Polygon option at 2%. "Conversion rates are automatically applied by our banking partners if your registered bank account uses a different currency".
- Whether Wise delivers to a Moldovan **business** account, and in which currency: **UNVERIFIED**.

**Fees (VERIFIED):** "3.9% + 40¢ flat. No monthly fees" (<https://docs.creem.io/getting-started/introduction>). Add-ons: +2% on splits, +2% on affiliate sales, +5% on recovered carts.

**MoR: Yes**: "Creem is a Merchant of Record (MoR) for SaaS and digital businesses" (<https://docs.creem.io/llms.txt>). **Subscriptions: Yes.**

---

## 4. Dodo Payments

**Supports a Moldovan seller: YES (VERIFIED).**
- URL: <https://docs.dodopayments.com/miscellaneous/accepted-countries-and-territories>
- Quote: "Full list of countries and territories where Dodo Payments supports merchant accounts and payouts." Item "103. Moldova".
- Eligibility rule: "Eligibility is based on the country that issued the government-issued identity document you verify with". For a registered entity this means "The government-issued ID of every director and beneficial owner, in addition to the country of incorporation". A Moldovan passport and a Moldovan SRL both satisfy it.

**Payout (VERIFIED, with a gap)**
- <https://docs.dodopayments.com/features/payouts/payout-structure>: balances sit in USD, GBP and EUR wallets. The minimum payout is $50, paid twice a month by default. "Payout routes and currencies vary by country. Contact support@dodopayments.com to confirm how your payouts will be sent and credited before you link a bank account." Intermediary-bank charges may apply.
- The exact route and currency to Moldova is **UNVERIFIED**. Ask Dodo support before integrating.

**KYC (VERIFIED):** a registered entity goes through "Product Information Form → Identity Verification (KYC) → Business Verification (KYB) → Bank Verification" (<https://docs.dodopayments.com/miscellaneous/verification-process>).

**Fees (VERIFIED, pricing page):** "4% + 40¢ per transaction", "International Payments For cards and APMs outside US +1.5%", and "Subscriptions … +0.5%" (<https://dodopayments.com/pricing>).

**MoR: Yes**: "Dodo Payments operates as a Merchant of Record (MoR)" (<https://docs.dodopayments.com/features/mor-introduction>). **Subscriptions: Yes.**

---

## 5. Lemon Squeezy (owned by Stripe)

**Supports a Moldovan seller: YES today (VERIFIED). Its long-term future is at risk.**
- URL: <https://docs.lemonsqueezy.com/help/getting-started/supported-countries>
- Quote: "Lemon Squeezy can offer services to merchants and affiliates who can receive bank or PayPal payouts in one of the hundreds of countries we support … Bank payouts supported in the following countries: …". The list includes "Moldova".

**Payout (VERIFIED)**, from <https://docs.lemonsqueezy.com/help/getting-started/getting-paid>:
- Money goes to a bank account (currency converted "using the mid-market exchange rate") or to PayPal ("always in USD").
- Payouts are made twice a month, sales are held for 13 days, and the threshold is $50.

**Fees (VERIFIED)**, from <https://docs.lemonsqueezy.com/help/getting-started/fees>:
- 5% + 50¢, "+1.5% for international (outside of the US) transactions", "+0.5% for subscription payments".
- Payouts via Stripe cost "1% per payout for bank accounts outside the US". PayPal payouts cost "3% capped at $30" outside the US.

**Gotcha (VERIFIED):** the CEO's post "2026 Update: Lemon Squeezy + Stripe Managed Payments" (<https://www.lemonsqueezy.com/blog/2026-update>, 2026-01-28) admits "slower support responses and less frequent product updates". It says the team is building Stripe Managed Payments and that "Our goal is to provide Lemon Squeezy users an easy way to migrate to Stripe Managed Payments." **Stripe Managed Payments does not support Moldova** (see section 9). A Moldovan seller would be building on a product whose planned successor excludes them.

**MoR: Yes. Subscriptions: Yes.**

---

## 6. Gumroad

**Supports a Moldovan seller: LIKELY YES. The evidence is first-party source code, not a policy page.** The help centre did not render for me, so I have no policy quote.
- `app/models/moldova_bank_account.rb` in <https://github.com/antiwork/gumroad> defines `class MoldovaBankAccount < BankAccount`, validates an IBAN matching `/^MD\d{2}[A-Z0-9]{20}$/`, and returns `Currency::MDL`.
- `app/models/country.rb` lists `Compliance::Countries::MDA` in `CROSS_BORDER_PAYOUTS_COUNTRIES`, and `supports_stripe_cross_border_payouts?` checks that list. The minimum cross-border payout for Moldova is `500_00` (500 MDL).
- Reading of the code: a Moldovan creator is paid through **Stripe cross-border payouts, in MDL, to a Moldovan IBAN**. Whether this also covers a Moldovan **company** (rather than an individual) is **UNVERIFIED**.

**Fees (VERIFIED in repo pricing template `app/views/home/pricing.html.erb`):** "10% + $0.50".
**MoR: Yes**: "Since January 1, 2025, Gumroad handles ALL your tax obligations" (same file). `docs/taxes.md` says "As of 2025, Gumroad is a Merchant of Record."
**Subscriptions: Yes**: "Can I use Gumroad for memberships? Yes! … SaaS subscriptions" (same file).
**Gotcha:** it charges double the other providers' fees, and it is built for creators rather than SaaS billing.

---

## 7. FastSpring

**Supports a Moldovan seller: UNVERIFIED.** I found no first-party list of eligible seller countries.

**Payout (VERIFIED):**
- <https://developer.fastspring.com/docs/set-up-your-payout-account>: payouts run through a Hyperwallet portal. Methods: PayPal, Bank Account, "Wire Transfer … Funds are wired globally via the SWIFT network", paper check, MoneyGram. "Payoneer is **not** a supported transfer method."
- <https://developer.fastspring.com/docs/receive-payouts>: "FastSpring places a **45-day monitoring hold** on your account" before the first payout, with a "14-day settlement delay". The minimum is "$100 USD", payout currencies are USD, EUR, GBP, AUD and CAD, and there is a "2.5% currency conversion fee" when store and payout currencies differ.
- Whether Hyperwallet can wire to Moldova: **UNVERIFIED**.

**Fees: UNVERIFIED.** The pricing page says "One flat rate. No hidden fees." but I found no number.
**MoR: Yes** (fastspring.com/pricing navigation: "Merchant of Record We handle the complexities of global selling for you"). **Subscriptions: Yes.**

---

## 8. 2Checkout (Verifone)

**Supports a Moldovan seller: UNVERIFIED.** The payouts doc links to a "Restricted countries and territories" page that now redirects to a page that is not found. 2checkout.com blocks automated fetches.

**Payout (VERIFIED)**, from <https://docs.2checkout.com/get-started/getting-started/payouts>:
- Methods: "Wire transfer" ("2 - 5 business days | 15 USD/GBP/EUR (only for 2Sell and 2Subscribe)"), "PayPal", and "Pre-paid 2Checkout MasterCard (powered by Payoneer)". Wire payouts can be in USD, GBP or EUR.
- Minimum "50$/50GBP/50€ … 2Sell or 2Subscribe", or "100 … reseller on the 2Monetize package". The payout form asks for "bank name, beneficiary name, bank account, SWIFT, bank address, and bank country".
- "Payouts are not available in restricted countries". The list itself is **UNVERIFIED**.

**KYC (VERIFIED):** companies must provide "Company ownership documents" and "Tax identification documents" (<https://docs.2checkout.com/get-started/getting-started/activate-your-account/account-identity-verification>).
**MoR: UNVERIFIED.** The docs call 2Monetize a "reseller" package, but I did not read a statement of tax liability. **Fees: UNVERIFIED.** **Subscriptions: Yes** (2Subscribe tier; subscription API reference exists).

---

## 9. Stripe Managed Payments (Stripe's own MoR)

**Supports a Moldovan seller: NO (VERIFIED).** <https://docs.stripe.com/payments/managed-payments/eligibility>: "Your business must be based in one of the supported business locations." The list covers CA, US, AT, BE, BG, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU, IE, IT, LI, LT, LU, LV, MT, NL, NO, PL, PT, RO, SE, SI, SK, AU, HK, JP and SG. **MD is absent.** It also does not support "Express accounts" or Connect platforms.

---

## 10. Payoneer as a payout rail

- **Paddle:** supported ("wire transfer or Payoneer"; "You are subject to all Payoneer fees"). VERIFIED.
- **2Checkout:** Payoneer-powered prepaid MasterCard, USD only. VERIFIED.
- **FastSpring:** not supported. VERIFIED.
- **Polar:** Payoneer-style virtual accounts "do not satisfy Stripe's verification for Connect payouts". VERIFIED.
- **Payoneer in Moldova, and withdrawal to a Moldovan bank: UNVERIFIED.** payoneer.com returned 403/404 on country pages, and its "withdraw-funds" page does not name Moldova.
- Pemby does not need Payoneer. Paddle, Polar and Creem all pay a Moldovan bank directly.

---

## 11. Moldovan acquirers and gateways (not merchants of record)

With a local acquirer, **your SRL/ÎI is the seller of record**. You then carry the VAT, GST and sales-tax obligations in every customer country, plus chargebacks and fraud. What those obligations are for a Moldovan exporter of digital services, and how Moldova IT Park status interacts with them, is outside this note's evidence. **UNVERIFIED; ask an accountant.**

### maib e-commerce (VERIFIED)
- **Eligibility**, from <https://docs.maibmerchants.md/main/en/integration/requirements>: "The Merchant's business must be registered under one of the legal forms provided for by the legislation of the Republic of Moldova (SRL, SA, ÎI, etc.)" and "Any Merchant wishing to integrate with maib e-commerce must be an maib Bank client."
- **Recurring billing**, from <https://docs.maibmerchants.md/e-commerce/maib-e-commerce-api>: endpoints `v1/savecard-recurring` ("Register card (recurring payments)") and `v1/execute-recurring`. The register-card call accepts "Transaction currency (MDL/EUR/USD)".
- Site requirements: HTTPS, terms and conditions with a checkbox at checkout, company IDNO and legal address shown on the site, and "logos of maib and the International Payment Systems".
- **UNVERIFIED:** explicit acceptance of foreign-issued cards, merchant discount rate and fees, settlement currency, and whether card data can be tokenized for a self-built subscription engine without extra PCI scope. None of these are in the public docs; ask the bank.
- Gotcha: maib provides card rails only. Proration, dunning, invoices, tax calculation and the customer portal would all have to be built by Pemby.

### Paynet (partially VERIFIED)
- <https://paynet.md/merchant/en>: "ACCEPT ONLINE PAYMENTS Visa & Master Card, Paynet Wallet, MIA, Google Wallet & Apple Pay". It offers plugins (WordPress, Shopify, Tilda and others) and an API.
- **UNVERIFIED:** recurring or tokenized billing, international-card acceptance, fees, and eligibility terms.

### Victoriabank, MICB (Moldindconbank): UNVERIFIED
- I fetched both English homepages and found no public e-commerce or internet-acquiring page. I have no first-party information on online card acceptance, recurring billing, or fees.

---

## Other MoRs that explicitly list Moldova

Polar, Creem, Dodo and Lemon Squeezy all name Moldova. Paddle includes it by exclusion. I found no other MoR that names Moldova. Coverage is limited because web search was unavailable.

---

## Ranked recommendation

1. **Paddle.** It is the most mature SaaS MoR. Moldova is not excluded, and it sends **EUR or USD by SWIFT straight to a Moldovan IBAN**, which is what the founder asked for. Pricing is a flat 5% + 50¢. Costs: €15 per monthly payout, a $100 threshold, monthly payouts, and a stricter domain and business review. Apply first, with the site and pricing live.
2. **Polar.sh.** Moldova is **explicitly** supported, and payouts use Stripe Connect Express. Subscription tooling is good and developer-friendly. Costs: payouts **must** land in an **MDL** account at a Moldovan bank (FX up to 1%, plus Stripe's $2/month and 0.25% + $0.25 per payout). The Starter rate plus the non-US card surcharge makes it about 6.5% + 50¢. The first review takes up to 14 days. Before building on it, confirm during Stripe onboarding that it accepts a Moldovan **company** as the business type.
3. **Creem.** Moldova is explicitly supported and it has the lowest headline fee (3.9% + 40¢). Costs: a younger company, payouts through Wise, and a 7 EUR/USD minimum payout fee, which hurts on small twice-monthly payouts. Good backup or cost-optimized choice.
4. **Dodo Payments.** Moldova is explicitly supported, including for company directors, at 4% + 40¢ (about 6% with the intl and subscription surcharges). Its own docs say the payout route and currency "vary by country", so get written confirmation from support first.
5. **Lemon Squeezy.** It works for Moldova today, but Stripe is steering users to Managed Payments, which excludes Moldova, and support has slowed. Avoid it for a new build.
6. **Gumroad.** Moldova is supported in the code (MDL cross-border payouts), but 10% + 50¢ and a creator-oriented product make it a poor fit for SaaS.
7. **FastSpring and 2Checkout.** Moldova eligibility and fees are UNVERIFIED. FastSpring adds a 45-day first-payout hold. Consider them only if the options above all refuse.
8. **maib e-commerce, used directly.** It is fully available to a Moldovan SRL or ÎI and has recurring APIs in MDL, EUR and USD. It is **not** an MoR, so Pemby would take on global VAT and sales-tax compliance and build all billing logic. Reserve it for local (MDL) customers, or as a last resort.

**Practical path:** apply to Paddle and Polar at the same time, since both are free to open. Integrate behind a thin billing abstraction, and ship with whichever approves first. Keep Creem as the fallback. Not recommended: Stripe Managed Payments (no Moldova) and Lemon Squeezy (sunset risk).
