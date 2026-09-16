# Privacy policy

This policy explains what personal data Pemby collects, why, who else handles it, how long we keep it and what you can do about it. We wrote it in plain English. If something is unclear, email hello@pemby.app.

## 1. Who is responsible for your data

The controller of your personal data is Societatea cu Răspundere Limitată "SYNCRA" ("SYNCRA" S.R.L.), trading as Syncra Studio.

- Company number, IDNO: 1025605006423
- Registered in: Chișinău, Republic of Moldova
- Director: Stephen (Ștefan) Golban, administrator
- Email for privacy requests: hello@pemby.app

We are based in the Republic of Moldova. Moldova's Law No. 195/2024 on personal data protection applies to us. If you are in the European Union or the European Economic Area, the General Data Protection Regulation, or GDPR, also applies when we offer Pemby to you.

## 2. The short version

- We use your CV and profile to find jobs that can hire you, and for nothing else.
- We do not sell your data. We do not share it with employers. We do not show ads.
- AI requests that include your personal data go through a private route that requires zero data retention by the model provider.
- A separate route handles public job posts only. It never receives your data.
- If you upload a CV without an account and do not sign up within 24 hours, we delete it.
- You can export your data or delete your account at any time.

## 3. What we collect

**CV and profile.** The CV file you upload, the text we extract from it, and the profile we build from it. A profile can include your name, job titles, seniority, years of experience, skills, domains, location, timezone, languages and links. You then add or confirm citizenships, country of residence, timezone overlap, whether you have your own company for invoicing, work permits, English level, ways of working, employment types, minimum rate and currency, and dealbreakers.

**Account.** Your email address, a hashed password and your sign-in sessions. If you use Pemby without an account, we create an anonymous session linked to a cookie.

**Matches and activity.** Which jobs matched you, the reasons and gaps shown, what you saved, applied to or marked "Not for me" with its reason, and your application tracker, including outcomes you choose to report.

**Application kits.** The CV bullets, cover letters and screening answers Pemby drafts for you, and the application defaults you give us, such as notice period, links and work authorization answers.

**Delivery channels.** Your Telegram chat ID and username if you connect the Telegram bot, your email preferences, your browser's push subscription if you turn on web push, your quiet hours, and a log of what we sent and when.

**Flags.** Jobs you flag, the reason you picked, and a note if you chose "Other".

**Passes and payments.** Your passes, their start and end dates, pauses and guarantee extensions. From our payment provider we receive a payment reference, the amount, currency, country, the email used at checkout and refund status. We never receive or store your full card number.

**Your own OpenRouter key.** If you connect your own OpenRouter account, the key OpenRouter issues to Pemby, stored encrypted.

**Technical data.** IP address, browser type and request logs, used for security, rate limits and bot checks. Cloudflare Turnstile checks that a real person is uploading a CV.

**Messages to us.** Emails you send to hello@pemby.app.

Please leave sensitive details out of your CV. Pemby does not need your photo, date of birth, health, religion, political views or ID numbers.

## 4. Why we use your data, and our legal basis

| What we do                                                            | Legal basis                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Read your CV, build your profile, show a preview before you sign up   | Steps you ask for before entering a contract with us              |
| Run your account, matches, Brief, kits, tracker and delivery channels | Performing our contract with you                                  |
| Sell, extend, pause and refund passes                                 | Performing our contract with you                                  |
| Keep payment and invoice records                                      | Our legal obligations under accounting and tax law                |
| Prevent abuse, fraud and bot traffic, keep Pemby secure               | Our legitimate interest in a safe, working service                |
| Act on flags and improve eligibility labels                           | Our legitimate interest in accurate job information for all users |
| Send expiry reminders and service messages                            | Performing our contract with you                                  |
| Answer your emails                                                    | Our legitimate interest in helping you, or our contract with you  |

These bases come from Article 6 of the GDPR, and the matching provisions of Moldova's Law No. 195/2024.

We do not use your data for advertising. We do not send marketing email today. If we ever do, we will ask for your consent first.

## 5. Automated matching

Pemby ranks jobs for you using rules, embeddings and a score. It decides which jobs to send you. It does not make decisions about you that have legal or similarly significant effects. No employer sees your score, and Pemby does not rank people for employers.

## 6. Anonymous uploads

When you upload a CV without an account, we store the file, the extracted text and the parsed profile with an expiry time of 24 hours. If you create an account within 24 hours, the data moves to your account. If you do not, a scheduled job deletes the file, the text, the profile and the session data.

## 7. How AI is used, and who sees what

Pemby uses OpenRouter to reach AI models. OpenRouter routes each request to a model provider. We use two separate routes.

**Private route, for personal data.** CV parsing, profile and CV embeddings, and application kits use a private OpenRouter key. That key is set to allow only model endpoints with zero data retention, and each request also asks for zero data retention. Zero data retention means the provider does not store the request or the answer after it replies, and does not train on it.

**Public route, for public job posts only.** Reading and labeling public job posts uses a separate key. This route may use free models whose providers can keep or train on inputs. It only ever receives public job posts and fixed labels. It never receives your CV, profile, kits, flag notes or anything else about you.

**Your own OpenRouter account.** If you connect your own OpenRouter account, kits you create beyond your free quota go through your key. OpenRouter's terms and privacy policy apply to that account. Pemby still requests zero data retention and asks providers not to collect data on every request made with your key.

We extract text from CV files ourselves. We never send the CV file to an AI model or a PDF plugin.

## 8. Flags

When you flag a job, we store your flag with your account so we can apply daily limits and weigh flags fairly.

- If you pick "Wrong details", you choose a field and a value from a fixed list. Only those fixed values are used as hints when we re-read the public job post.
- If you pick "Other" and write a note, the note goes to a review queue that only a person at Pemby reads. It is never sent to any AI model.

Reports such as "rejected because of my location" can become evidence about whether a company hires from a country. That evidence does not include your identity.

## 9. Delivery channels and quiet hours

You choose which channels Pemby uses. You can turn each one off at any time.

- Telegram bot messages go through Telegram, which receives the message content and your chat ID. Telegram's own privacy policy applies to your Telegram account.
- We send email through Resend.
- For web push, your browser gives us an address on its vendor's push service, run by Google, Mozilla or Apple depending on the browser. Each push message passes through that service.

During your quiet hours we hold messages and send them when quiet hours end.

## 10. Service providers

We share personal data only with providers that help us run Pemby, and only what each one needs.

| Provider                                           | What it does for Pemby                                                   | Personal data it handles                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Railway                                            | Hosting, database, file storage for CVs                                  | All data described in section 3                               |
| Cloudflare                                         | DNS, bot checks with Turnstile, forwarding email sent to hello@pemby.app | IP address, browser data, emails you send us                  |
| OpenRouter and the model providers it routes to    | AI processing, see section 7                                             | CV text, profile, kits, through the zero data retention route |
| Resend, in its EU region eu-west-1                 | Sending email                                                            | Email address, message content                                |
| Telegram                                           | Delivering bot messages, if you connect Telegram                         | Chat ID, username, message content                            |
| Our payment provider, acting as merchant of record | Checkout, payment, tax, invoices and refunds                             | Checkout details, payment data, billing country               |

The payment provider is the seller of your pass. It processes payment data under its own privacy policy as a separate controller. Payments are processed by Dodo Payments or Paddle, acting as merchant of record.

We do not use analytics, session recording or advertising tools today. If we add one, we will update this policy before we do.

We may disclose data if the law requires it, for example a valid order from a court or authority.

## 11. International transfers

We operate from Moldova, and some of our providers process data in other countries, including the United States and the European Union. When your data moves to a country without an adequacy decision, we rely on the safeguards the law allows, such as standard contractual clauses in the provider's data processing terms. You can ask us for details at hello@pemby.app.

## 12. How long we keep data

| Data                                                   | How long                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Anonymous CV uploads and their profiles                | 24 hours, unless you create an account                                                                                      |
| Account, CV, profile, matches, kits, tracker, channels | Until you delete your account                                                                                               |
| Your own OpenRouter key                                | Until you disconnect it or delete your account                                                                              |
| Delivery log                                           | Until you delete your account                                                                                               |
| "Other" flag notes                                     | Until the review is done, then removed from the note field. Flag records are unlinked from you when you delete your account |
| Payment and invoice records                            | As long as Moldovan accounting and tax law requires, then deleted                                                           |
| Security logs                                          | 30 days                                                                                                                     |
| Emails to hello@pemby.app                              | 2 years after the conversation ends                                                                                         |

When you delete your account, we delete your data from the live database and file storage right away. Copies in backups are deleted as the backups expire, within 30 days. We keep payment records for accounting as the law requires, linked only to the payment reference and email used at checkout. We use those records for accounting and nothing else.

Aggregate numbers that cannot identify you, such as AI cost per task, may be kept after deletion.

## 13. Your rights

You have the right to:

- access your data and get a copy;
- correct wrong data. Most of it you can edit in your profile;
- delete your data;
- export your data in a machine-readable format;
- restrict or object to processing based on our legitimate interests;
- withdraw consent where we rely on consent, without affecting earlier processing;
- complain to a data protection authority.

**Export and delete in Pemby.** Your profile page has an export button and a delete account button. Export gives you your profile, CV text, matches, kits, tracker, channels, passes and payment history.

**By email.** Write to hello@pemby.app from the email on your account. We answer within one month. If a request is complex, the law lets us take longer, and we will tell you why within that first month.

**Complaints.** In Moldova, the authority is the National Centre for Personal Data Protection, datepersonale.md. In the EU and EEA, you can complain to the data protection authority in the country where you live or work. We would like the chance to fix the problem first, so please write to us.

## 14. Security

We encrypt connections with HTTPS. We store your own OpenRouter key encrypted. Access to production data is limited to the people who run Pemby. CV files sit in private storage that is not publicly reachable. No system is perfectly secure. If a breach puts your rights at risk, we will tell you and the relevant authority as the law requires.

## 15. Cookies

We use only cookies that Pemby needs to work:

- a sign-in session cookie;
- an anonymous session cookie, so your upload stays linked to you for 24 hours;
- a referral cookie that remembers who invited you, when referrals are available;
- Cloudflare Turnstile, which may set data needed for bot checks.

We do not use advertising or analytics cookies, so we do not show a cookie banner.

## 16. Children

Pemby is not for anyone under 16. If we learn that someone under 16 has an account, we delete it.

## 17. Public source code

Pemby's code is public. Your data is not. Nothing in the public repository contains user data.

## 18. Changes

If we change this policy in a way that affects you, we will email you or show a notice in Pemby before the change takes effect. The effective date at the top shows the current version.

## 19. Contact

Email hello@pemby.app. We reply within 3 business days.
