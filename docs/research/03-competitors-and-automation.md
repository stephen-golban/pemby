# 03: Competitors and application-automation feasibility

Research date: 2026-09-15. This is research, not legal advice.

**How this was gathered.**
- Seven parallel research passes used WebSearch and WebFetch against product sites, pricing pages, API docs, statutes, regulator pages, and Trustpilot.
- The lead then re-fetched the load-bearing claims directly: the ATS endpoints, the LinkedIn terms, the EU Digital Omnibus status, Colorado SB26-189, NYC LL144, the hiQ settlement, and the pricing for LazyApply, TheirStack, JSearch, Fantastic.jobs and Adzuna.
- The Workday CXS and robots.txt behaviour, and the Teamtailor API docs, were checked with `curl` on 2026-09-15.

**Known limits.**
- Reddit and G2 were blocked for fetch in this environment, so user sentiment is mostly from Trustpilot, Blind and HN.
- The shared web-search budget (200 calls) ran out near the end.
- Anything marked **[unverified]** came from a search snippet, a secondary blog, or memory, and was not confirmed on a primary page.

---

## TL;DR

1. **The market is crowded but split in two.**
   - Job boards (LinkedIn, Indeed, Wellfound, the remote boards) own listings, but none models a user's citizenship or work authorisation together with timezone.
   - AI job tools (Simplify, Jobright, Teal, Huntr) own the apply flow, but match poorly.
   - Nobody joins trustworthy eligibility matching to fast, honest applying.
2. **Server-side auto-apply is a proven bad business.**
   - Sonara shut down on 2024-02-01.
   - BulkApply is winding down.
   - AI Hawk lost its LinkedIn channel.
   - The survivors have the worst ratings in the category: Massive 1.7, LazyApply 2.1, JobCopilot 2.4 on Trustpilot.
   - Massive itself states "1-2 interviews every 100 applications".
   - Autofill that the user submits (Simplify: 500k users, 4.9 stars) is the model that lasts.
3. **Reading jobs is easy and legitimate; submitting is not.**
   - Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee and Personio all expose unauthenticated job-posting endpoints.
   - Every documented submit endpoint needs the employer's key or a partnership, except Recruitee, whose endpoint is public.
4. **Employers are arming against volume.**
   - Greenhouse reports 254 applicants per job and recruiter load up 412%.
   - Greenhouse shipped spam, bot and fraud flagging, IP and email blocklists, application-limit rules, and CLEAR identity checks.
   - Ashby has bot protection on its forms.
5. **Legal.**
   - LinkedIn's User Agreement bans bots and extensions that automate activity. hiQ lost on contract, paid $500k and destroyed its data.
   - The EU AI Act's Annex III high-risk obligations now apply from **2 Dec 2027** (Digital Omnibus, signed 8 Jul 2026).
   - Art. 50 AI transparency applies from 2 Aug 2026.
   - A purely candidate-side tool has the best argument for staying outside Annex III 4(a) and NYC LL144.
   - A paid "we apply for you" service may count as an employment agency, and in the UK agencies are barred from charging job-seekers fees.

---

# Part A: Competitors

## A0. Summary table

| Product | Category | Seeker pricing | Status (2026-09-15) |
|---|---|---|---|
| LinkedIn | Network + board + Easy Apply | Free; Premium Career $39.99/mo or $239.88/yr | Alive |
| Indeed | Aggregator + Career Scout AI | Free | Alive; ~1,300 layoffs Jul 2025 |
| Glassdoor | Reviews; listings powered by Indeed | Free (Indeed account required) | Alive, folded into Indeed |
| Wellfound | Startup board | Free | Alive |
| Welcome to the Jungle (ex-Otta) | Curated tech board | Free | Otta acquired Jan 2024, rebranded |
| Hired | Reverse marketplace | Was free | **Dead**, absorbed into LHH Jun 2024 |
| Levels.fyi Jobs | Comp-transparent board | Free (paid negotiation service) | Alive |
| HN Who's Hiring + aggregators | Monthly thread | Free | Alive |
| Himalayas | Remote board | Free / $9 / $29 per month | Alive |
| Remotive | Remote board | Membership (price varies by country) | Alive |
| We Work Remotely | Remote board | Pro $14.95/mo, 12-month lock-in **[secondary]** | Alive |
| RemoteOK | Remote board | Free to apply | Alive |
| Arc.dev | Vetted dev marketplace | Free to talent | Alive |
| Turing | Vetted marketplace | Free to talent | **Pivoted** to LLM training data |
| Toptal | Freelance network | No cut from talent | Alive |
| Braintrust | Freelance marketplace | 0% talent fee | Alive, moving toward enterprise AI hiring |
| Contra | Freelance network | Free / Pro $29/mo | Alive |
| Jobright.ai | AI matching + autofill | Turbo ~$39.99/mo **[secondary]** | Alive |
| Simplify | Extension autofill (user submits) | Free autofill; Simplify+ $39.99/mo **[secondary]** | Alive |
| Teal | Tracker + resume | Teal+ ~$29/mo **[secondary]** | Alive |
| Huntr | Tracker + resume + autofill | Free / Pro $40/mo | Alive |
| LazyApply | Bot auto-submit | $99, $149 or $999 per year | Alive, declining |
| AIApply | AI docs + credit-based auto-apply | Subscription + credit packs | Alive |
| Sonara | Server-side auto-apply | n/a | **Died** 2024-02-01; brand bought by BOLD **[unverified]** |
| JobCopilot | Server-side auto-apply | $0.93–$1.05 per day | Alive |
| Massive | "We apply for you" | ~$59/mo **[secondary]** | Alive |
| LoopCV | Auto-apply loops | Free; from €9.99/mo | Alive |
| Careerflow | Extension autofill + LinkedIn optimiser | $23.99 or $44.99 per month | Alive |
| Kickresume | Resume builder | $19/mo | Alive |
| Wonsulting | AI suite, AutoApplyAI folded into JobBoardAI | Free / $19.99/mo | Alive |

## A1. Major boards and networks

### LinkedIn (Easy Apply, Premium, AI job search)

**What it does.**
- A professional network and job board. Easy Apply sends your LinkedIn profile to the employer.
- AI job search accepts natural-language queries and is "available to all LinkedIn members worldwide". https://www.linkedin.com/help/linkedin/answer/a6889044
- AI job search first rolled out to Premium members (Jun 2025). https://www.forbes.com/sites/torconstantino/2025/06/02/linkedin-launches-ai-job-search-tool-for-premium-users/
- Hiring Assistant is a **recruiter** product, available globally in English since Sep 2025. https://news.linkedin.com/2025/hiring-assistant-globally-available

**Pricing.** Premium Career costs $39.99/mo or $239.88/yr. It includes 5 InMails a month, "Top applicant" jobs, and AI job-fit tips. https://premium.linkedin.com/careers/career

**Target user.** Every white-collar worker. The paying customers are recruiters.

**Complaints.**
- Trustpilot 1.1/5 from 3,856 reviews: lockouts, failed ID verification, "suspicious postings, spam, and aggressive premium paywalls". https://www.trustpilot.com/review/www.linkedin.com
- Scammers exploit Easy Apply. https://turnto10.com/i-team/consumer-advocate/experts-warn-scammers-are-exploiting-linkedins-easy-apply-feature-platform-fake-profile-personal-information-steal-recruiter-october-21-2025
- Roles "reposted for months and not filled" (Blind). https://www.teamblind.com/post/open-positions-reposted-for-months-and-not-filled-bdraswgr
- Volume: 11,000 applications a minute, up 45% year on year (NYT, via eWeek). https://www.eweek.com/news/ai-job-applications-linkedin/

**What it fails to solve.**
- There is no visa-sponsorship filter, and keyword searches for "sponsorship" also return "no sponsorship" posts. https://thearrivaldesk.com/posts/filtering-for-sponsorship-on-linkedin-and-indeed
- The filter list has no timezone or work-authorisation filter. https://www.linkedin.com/help/linkedin/answer/a6889044
- Nothing flags ghost jobs.
- Easy Apply does nothing for jobs that redirect to an external ATS.

### Indeed

**What it does.**
- The largest aggregator.
- **Career Scout** is an AI assistant for matching, résumés and mock interviews. https://www.indeed.com/careerscout
  - A third party reports that it autofills matching roles. https://jobstars.com/exploring-indeeds-career-scout/ **[secondary]**
- **Smart Screening** is an employer-side "Smart Fit Score" pushed into the employer's ATS. https://www.indeed.com/employers/solutions/smart-screening

**Pricing.** Free for seekers. https://www.indeed.com/careerscout

**Target user.** The mass market, dominated by hourly roles.

**Complaints.** Trustpilot 1.9/5 from 12,986 reviews: the algorithm ignores "not interested", fake or expired listings, "Applied to 150 jobs… never made it any further", and scam recruiters. https://www.trustpilot.com/review/indeed.com

**What it fails to solve.**
- No sponsorship filter (Arrival Desk link above).
- AI scoring on the employer side adds opaque rejection.

**Status.** Alive. Recruit cut ~1,300 jobs across Indeed and Glassdoor in Jul 2025 to refocus on AI. https://techcrunch.com/2025/07/11/indeed-glassdoor-to-lay-off-1300-staff/

### Glassdoor

**What it does.**
- Company reviews, salaries and interview reports.
- Its listings are powered by Indeed, and it now requires an Indeed-linked account. https://www.vocationalguide.com/indeed-vs-glassdoor-2026-merger-privacy-job-search/ **[secondary]**
- The account-linking deadline was 2026-04-20. https://www.jobboarddoctor.com/2026/03/13/indeed-and-glassdoor-turn-the-screws-as-multiple-deadlines-loom/

**Complaints.**
- Trustpilot 1.1/5: removed reviews and forced data sharing with Indeed. https://www.trustpilot.com/review/glassdoor.com
- Real names were added to profiles without consent in 2024. https://techcrunch.com/2024/03/20/glassdoor-added-real-names-profiles-without-consent/

**What it fails to solve.** Everything Indeed fails to solve. It is a research tool, not a way to apply.

### Wellfound (formerly AngelList Talent)

**What it does.** A startup job board with salary and equity shown upfront, one-click apply, and founder DMs. https://www.selectsoftwarereviews.com/reviews/wellfound

**Pricing.** Free for seekers. Employers pay for Recruit Pro. https://www.g2.com/products/wellfound/pricing

**Target user.** US-centric startup engineers.

**Complaints.** Trustpilot 3.9/5 from 143 reviews: unexplained account restrictions, fake-looking jobs, US-citizen bias, low employer response. https://www.trustpilot.com/review/wellfound.com

**What it fails to solve.**
- Remote filters are remote type, HQ location and "distributed teams" only, with no timezone filter. https://help.wellfound.com/article/762-remote-job-search-filters
- The visa-sponsorship flag is US-only. https://help.wellfound.com/article/749-company-visa-sponsorship

### Welcome to the Jungle (formerly Otta)

**What it does.**
- A curated tech and startup board with employer branding.
- Employers get a Hiring Suite. https://solutions.welcometothejungle.com/en/otta-is-now-welcome-to-the-jungle

**Pricing.** Free for seekers. Employers pay from £199/mo. https://solutions.welcometothejungle.com/en/pricing

**Complaints.**
- otta.com Trustpilot 3.6/5 from 1,062 reviews: ghosting, expired listings, chatbot-only support, wrong locations. https://www.trustpilot.com/review/otta.com
- welcometothejungle.com Trustpilot 2.3/5. https://www.trustpilot.com/review/welcometothejungle.com

**Status.**
- **Acquired, not dead.** Welcome to the Jungle acquired Otta in Jan 2024. https://press.welcometothejungle.com/en/news/uk-recruitment-platform-otta-acquired-by-welcome-to-the-jungle
- Otta was rebranded around Nov 2024. https://www.linkedin.com/posts/wttj-uk_otta-has-rebranded-to-welcome-to-the-jungle-activity-7265061014021275648-BFRJ (the date is inferred from the post ID)

### Hired (DEAD)

**What it was.** A reverse marketplace: vetted tech candidates received interview requests from companies.

**How it ended.**
- LHH (Adecco) folded Hired into LHH Recruitment Solutions effective 2024-06-14, citing consolidation. https://www.staffingindustry.com/news/global-daily-news/adecco-incorporating-hired-lhh-business **[snippet; page 403]**
- HN thread "Hired.com Shut Down", 2024-06-21. https://news.ycombinator.com/item?id=40746030
- Users missed its low-spam model. https://www.teamblind.com/post/Hiredcom-shut-down%F0%9F%98%A5Best-alternative-Vs38DqXP

**Lesson.** Curated, employer-pays marketplaces struggle in a weak engineering hiring market (Blind speculation, same link).

### Levels.fyi Jobs

**What it does.** A comp-transparent board with filters for location, title, level, total comp and remote. https://www.levels.fyi/jobs

**Pricing.** Free. Revenue comes from negotiation services (same page).

**Complaints.** Users have asked since 2023 for remote-worldwide, visa and relocation filters, and for a way to hide jobs they have already applied to. https://www.levels.fyi/community/thread/qAqCXO/new-feature--levels-fyijobs

**What it fails to solve.** Eligibility filtering, applying, and tracking.

### HN "Who is Hiring?" and aggregators

**What it does.**
- A monthly thread. The Sep 2026 thread had ~401 comments.
- Rules: posters must be the hiring company, and must be "committed to replying to applicants". https://news.ycombinator.com/item?id=49522897
- Aggregators:
  - hnhiring.com: 60k+ ads indexed. https://hnhiring.com/ **[snippet]**
  - Regex filters over the thread. https://nchelluri.github.io/hnjobs/

**What it fails to solve.**
- Posts are free text, so a "visa" filter also matches "no visa".
- "REMOTE (US)" is unstructured.
- Every application is a manual email or ATS form.

## A2. Remote boards and talent networks

### Himalayas

**What it does.** A free remote board with AI recommendations, a tracker and résumé tools.

**Pricing.** Free / Plus $9/mo / Max $29/mo. https://himalayas.app/pricing

**Complaints.** Trustpilot 3.6 from only 6 reviews: slow UI, scam jobs. https://www.trustpilot.com/review/himalayas.app

**What it fails to solve.**
- It is the only board with structured `locationRestrictions` and `timezoneRestriction` fields. https://himalayas.app/api
- But it has no user eligibility model and no help with applying.

**API terms.** A free JSON API and RSS, with required attribution and link-back, and no resubmission to third-party job sites (same URL).

### Remotive

**What it does.** A curated remote board. Free users see "0.4% of available roles". https://remotive.com/

**Pricing.** A paid "Unlock All Jobs" membership, priced by country. https://support.remotive.com/en/category/job-seeking-tbfabe/

**What it fails to solve.** Location filters are paywalled, and there is no timezone matching.

**API terms.**
- The public API requires a link back and naming Remotive as the source.
- Jobs are delayed 24h.
- Requests are capped at 2/min, with 4/day recommended.
- "Please do not submit Remotive jobs to third Party websites".
- Using jobs "to collect signups/email addresses… constitutes a breach". Commercial use needs the paid API.
- Source: https://github.com/remotive-com/remote-jobs-api

### We Work Remotely

**What it does.** One of the oldest remote boards.

**Pricing.** Pro is $2.95 for the first month, then $14.95/mo with a non-refundable 12-month lock-in. https://pitchmeai.com/blog/we-work-remotely-pricing-job-seekers **[secondary]**

**Complaints.** Trustpilot 2.9 from 236 reviews: a "predatory" annual lock-in, hard to cancel, stale listings. On eligibility: "'Work from anywhere in the world'… not true in 99% of the cases". https://www.trustpilot.com/review/weworkremotely.com

**Feed.** RSS with attribution required. https://weworkremotely.com/remote-job-rss-feed **[snippet; 403]**

### RemoteOK

**What it does.** A dev-heavy remote board.

**Pricing.** Free to apply. Employers pay from $299 per post.

**Complaints.** Weak tag filters, ~35% of listings show salary, stale posts. https://www.remotejobassistant.com/blog/remoteok-review **[secondary]**

**Feed.** A JSON API at `remoteok.com/api`, with attribution and a followed link-back required **[snippet; 403]**.

### Arc.dev

**What it does.** A vetted remote dev marketplace with HireAI matching for employers. https://arc.dev/

**Pricing.** "no cost to use the platform nor when you land a job". https://arc.dev/developers

**Complaints.** Trustpilot 4.4 from 196 reviews: a profile "'in review' for two years", unresponsive support. https://www.trustpilot.com/review/arc.dev

**What it fails to solve.** Vetting is a gate that stalls, and it doesn't cover the market outside Arc.

### Turing (PIVOTED)

**What it does now.**
- It has shifted to LLM training and coding data for AI labs. https://www.turing.com/services/llm-training-and-development
- $111M Series E at a $2.2B valuation, 2025-03-06. https://www.businesswire.com/news/home/20250306942806/en/Turing-Gears-Up-to-Power-Next-Wave-of-AGI-with-$111-Million-in-Series-E
- The jobs page is still live. https://www.turing.com/jobs

**Complaints.** Trustpilot 2.5 from 201 reviews: failed ID verification, "assigned to a client" for months, "selling your tests to test AI without even thinking of hiring you". https://www.trustpilot.com/review/turing.com

**Lesson.** Developer vetting networks are becoming AI-data labour pools.

### Toptal

**What it does.** A screened freelance network. "Toptal does not take a cut" from talent. Freelancers get no visa sponsorship. https://www.toptal.com/freelance-jobs/faq

**Complaints.** Trustpilot 4.8 from 2,518 reviews, mostly positive. The negatives are intense screening and a long wait for a first client. https://www.trustpilot.com/review/toptal.com

**What it fails to solve.** Freelance only, and no full-time job search.

### Braintrust

**What it does.** A talent marketplace. It added AIR, an AI recruiter that interviews candidates. https://www.usebraintrust.com/

**Pricing.** "zero platform fees for talent". https://www.usebraintrust.com/pricing

**Complaints.** Trustpilot 1.7 from 19 reviews: a video screen after a full application, rejection "with no explanation", privacy concerns. https://www.trustpilot.com/review/usebraintrust.com

**What it fails to solve.** It adds application effort rather than removing it.

### Contra

**What it does.** A commission-free freelance network for creatives and developers. https://contra.com/

**Pricing.** Free, or Pro at $29/mo ($199/yr). https://contra.com/pricing

**Complaints.** Trustpilot 2.1 from 63 reviews: not verified after paying, few jobs, unexplained blocks. https://www.trustpilot.com/review/contra.com?page=2

**What it fails to solve.** A poor fit for full-time dev and IT roles.

## A3. AI job-search and auto-apply tools

### Jobright.ai

**What it does.** AI matching, an agent called "Orion", résumé tailoring, and "1-Click Application Autofill". It claims 2M+ users and a "3x interview rate increase" with no stated method. https://jobright.ai/

**Pricing.** No public pricing page. Turbo is ~$39.99/mo. https://outapply.com/blog/jobright-ai-pricing **[secondary]**

**Complaints.** Trustpilot 4.8 from 3,179 reviews. The complaints are minor (popups). The distribution may reflect solicited reviews **[unverified]**. https://www.trustpilot.com/review/jobright.ai

**What it fails to solve.** No stated visa or timezone eligibility handling. US-centric.

### Simplify (Copilot extension, Simplify+)

**What it does.**
- A browser extension that autofills; the user submits. "Copilot doesn't submit automatically… submit the application yourself". https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications
- It fills contact, education, experience, work authorisation, demographics and links. Simplify+ adds AI answers to unique questions.

**Scale.** 500,000 users, 4.9 stars from 3.8K ratings, "over 100 million applications", supports "Workday, Lever, Greenhouse, and more", updated 2026-09-12. https://chromewebstore.google.com/detail/simplify-copilot-autofill/pbanhockgagggenencehbnadejlgchfc

**Pricing.** Autofill is free. Simplify+ is ~$39.99/mo. https://www.resumly.ai/answers/simplify-jobs-review **[secondary]**

**Complaints.** Trustpilot 3.2 from 18 reviews: "AI was filling crap in fields that aren't even asking for an answer", "I still had to spend a lot of time entering information", no refunds. https://www.trustpilot.com/review/simplify.jobs

**What it fails to solve.** Accuracy on custom questions, eligibility-aware matching, and non-US markets.

### Teal

**What it does.** A tracker and résumé builder. Its extension saves jobs to a board. https://resumeoptimizerpro.com/blog/teal-chrome-extension-alternative **[secondary]**

**Pricing.** Teal+ ~$29/mo. https://www.toolsforhumans.ai/ai-tools/teal **[secondary]**

**Complaints.** Trustpilot 4.2 from 115 reviews: spam emails, "mostly ghost listings", manual keyword work. https://www.trustpilot.com/review/tealhq.com

**What it fails to solve.** Form filling and matching.

### Huntr

**What it does.** A tracker, résumé tailoring, and extension autofill.

**Pricing.** Free (100 jobs), or Pro at $40/mo. https://huntr.co/pricing

**Complaints.** Trustpilot 4.5 from 21 reviews: autofill "a bit hit-or-miss". https://www.trustpilot.com/review/huntr.co

### LazyApply

**What it does.** An agent that "handles the entire application process" and says "your profiles will never get blocked". https://lazyapply.com/

**Pricing.**
- Basic: $99/yr, 15 applications a day.
- Premium: $149/yr, 150 a day.
- Ultimate: $999/yr, 1,500 a day.
- 30-day refund policy.
- Source: https://lazyapply.com/pricing

**Complaints.** Trustpilot 2.1 from 110 reviews: "only worked properly for me one day out of over 15", fails to fill first and last name, refunds ignored, irrelevant matches. https://www.trustpilot.com/review/lazyapply.com

**What it fails to solve.** Reliability, relevance, and account risk. LinkedIn bans automation extensions. https://www.linkedin.com/help/linkedin/answer/a1341387

### AIApply

**What it does.** AI résumé, cover-letter and interview tools, plus credit-based auto-apply that "automatically submits applications on your behalf". https://aiapply.co/auto-apply

**Claims.** "61% of users get an interview in first 10 days". https://aiapply.co/pricing

**Complaints.** Trustpilot 4.2 from 1,785 reviews, 12% one-star: "Grossly misaligned jobs get applied to... even if you restrict the roles", hidden recurring charges. https://www.trustpilot.com/review/aiapply.co

### Sonara (DIED, then brand acquired)

**How it died.** "On February 1st, 2024, Sonara announced that it was officially shutting down". Users could only view past applications. https://www.applypass.com/post/sonara-ai-alternative-is-sonara-shutting-down

**Why.** It "ran out of funding". https://www.remotejobassistant.com/blog/sonara-ai-review **[secondary]**

**Afterwards.** BOLD (Zety, LiveCareer) acquired the brand in mid-2024 and relaunched it. https://www.resumly.ai/answers/what-happened-to-sonara-ai **[unverified; no primary press release found]**

**Complaints about the relaunch.** 25–40% of attempted applications fail silently at email-verification steps, and screening answers are submitted without review (remotejobassistant link above, **[secondary]**).

### JobCopilot

**What it does.** Auto-applies through "official company career pages" and scans 500,000+ of them. https://jobcopilot.com/

**Pricing.** $0.93/day (up to 20 applications a day) or $1.05/day (up to 50). https://jobcopilot.com/pricing/

**Complaints.** Trustpilot 2.4 from 101 reviews: "over 700 applications, not a single interview", half the jobs it applied to were sales roles, "false information on my résumé, including job titles... never had", charged after the trial. https://www.trustpilot.com/review/jobcopilot.com

### Massive (usemassive.com)

**What it does.** "Get applied up to 200 great jobs every month". Users can "preview it before it's sent". https://usemassive.com/

**Its own benchmark.** "Most people get 1-2 interviews every 100 applications" (same URL).

**Pricing.** ~$59/mo. https://www.loopcv.pro/directory/massive/ **[secondary]**

**Complaints.** Trustpilot 1.7 from 43 reviews, 77% one-star: "$240... not a single interview after 340+ applications", applies weeks after the role was posted, refunds voided because of the volume sent. https://www.trustpilot.com/review/usemassive.com

### LoopCV

**What it does.** Automated application "loops" across 30+ boards, plus emails to recruiters.

**Pricing.** Free tier; paid from €9.99/mo. https://www.loopcv.pro/pricing/

**Complaints.** Trustpilot 3.9 from 130 reviews: "full of bugs", "180 positions, but only 27 matched me". https://www.trustpilot.com/review/loopcv.pro

### Careerflow

**What it does.** Extension autofill, a LinkedIn optimiser, and a tracker.

**Pricing.** Premium $23.99/mo, Premium Plus $44.99/mo. https://www.careerflow.ai/premium

**Complaints.** Trustpilot 3.6 from 17 reviews: surprise renewals, no self-serve account deletion. https://www.trustpilot.com/review/careerflow.ai

### Kickresume

**What it does.** A résumé builder with a board and tracker. No auto-apply.

**Pricing.** $19/mo. https://www.kickresume.com/en/pricing/

**Complaints.** Trustpilot 4.6 from 3,848 reviews: rigid templates, caps on tailoring. https://www.trustpilot.com/review/kickresume.com

**What it fails to solve.** Applying.

### Wonsulting (WonsultingAI)

**What it does.** A suite of AI tools. AutoApplyAI "has been integrated into JobBoardAI", and the page says "We apply for jobs for you as you sleep". https://www.wonsulting.com/autoapplyai

**Pricing.** Free, or Premium at $19.99/mo, with an "100% Interviews Guaranteed" claim. https://www.wonsulting.com/pricing

**Contested claim.** One site says Wonsulting shut down bulk-send in Aug 2025 after averaging 1 interview per 50 applications. https://gracker.ai/blog/ai-job-apply-bots-2025 **[unverified; contradicted by live pages]**

## A4. Dead and pivoted: the evidence

| Company | What happened | Why | Source |
|---|---|---|---|
| Sonara | Shut down 2024-02-01; users locked out of their queues | Ran out of funding **[secondary]**; brand later bought by BOLD **[unverified]** | https://www.applypass.com/post/sonara-ai-alternative-is-sonara-shutting-down |
| Hired | Absorbed into LHH on 2024-06-14 | Consolidation by Adecco; weak engineering hiring market | https://news.ycombinator.com/item?id=40746030 |
| Otta | Acquired by Welcome to the Jungle (Jan 2024), brand retired | Consolidation | https://press.welcometothejungle.com/en/news/uk-recruitment-platform-otta-acquired-by-welcome-to-the-jungle |
| BulkApply (meanSquare) | Winding down, no new signups | Refocus on other products | https://meansquare.ai/products/bulkapply |
| AI Hawk / Laboro | "previously scanned LinkedIn before being banned; now targets applicant tracking systems" | Platform enforcement | https://san.com/cc/an-ai-arms-race-is-reshaping-how-people-find-and-apply-for-jobs/ |
| Turing | Pivoted from dev marketplace to AI training data | Better economics in AI labs | https://www.businesswire.com/news/home/20250306942806/en/Turing-Gears-Up-to-Power-Next-Wave-of-AGI-with-$111-Million-in-Series-E |
| Proxycurl (LinkedIn data API, adjacent) | Settled with LinkedIn Jul 2025 and shut down | LinkedIn legal action | https://news.bloomberglaw.com/artificial-intelligence/linkedins-war-against-bot-scrapers-ramps-up-as-ai-gets-smarter |

**Pattern.**
- Tools that submit in bulk from their own servers get caught three ways: by volume that yields no interviews, by refund and chargeback pressure, and by platform bans.
- The survivors add a human in the loop (Scale.jobs, Massive previews) or leave submission to the user (Simplify).

---

# Part B: Application automation feasibility

## B1. ATS public APIs: reading vs submitting

| ATS | Public READ endpoint (no auth) | SUBMIT endpoint | Who can submit | Documented rate limits |
|---|---|---|---|---|
| Greenhouse | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs` | `POST /v1/boards/{token}/jobs/{id}` (Basic auth); Ingestion API for partners | Employer's Job Board key; sourcing partners via OAuth / Partner key | Job Board: none stated; Harvest: `X-RateLimit-Limit` per 10s |
| Lever | `GET api.lever.co/v0/postings/{site}` | `POST /v0/postings/{site}/{id}?key=` | Employer's key (Super Admin) | Apply: >2 POST/s returns 429; main API 10 req/s |
| Ashby | `GET api.ashbyhq.com/posting-api/job-board/{name}` | `POST applicationForm.submit` | Employer key with `candidatesWrite` | Not documented |
| Workable | `GET www.workable.com/api/accounts/{sub}` | `POST /spi/v3/accounts/{sub}/jobs/{code}/candidates` | Account token, OAuth, or partner token | 10 per 10s (account token); 50 per 10s (OAuth/partner) |
| SmartRecruiters | `GET api.smartrecruiters.com/v1/companies/{id}/postings` | Application API `POST /postings/{uuid}/candidates` | Customers and partners (OAuth scope) | 10 req/s, 8 concurrent |
| Workday | No documented API; undocumented CXS `POST /wday/cxs/{tenant}/{site}/jobs` works unauthenticated | None public | Employer tenant only | n/a |
| Recruitee | `GET {co}.recruitee.com/api/offers/` | `POST {co}.recruitee.com/api/offers/{slug}/candidates` | **No auth** | Not documented |
| BambooHR | No documented public feed | `POST /api/v1/applicant_tracking/application` | Employer key / OAuth | 429 exists, numbers not given |
| Teamtailor | Not public: `api.teamtailor.com/v1/jobs` needs `Authorization: Token` | `POST /v1/candidates`; `job-applications` resource | Employer API key | `X-Rate-Limit-*` headers, 429 |
| Personio | `GET {co}.jobs.personio.de/xml` | `POST api.personio.de/v1/recruiting/applications` | Employer recruiting token + `X-Company-ID` | 429 exists, numbers not given |

### Greenhouse

**Read.** "Job Board data is publicly available, so authentication is not required for any GET endpoints." `?content=true` adds descriptions; `questions=true` returns the form fields; `pay_transparency=true` returns salary ranges. https://docs.greenhouse.io/job-board.html
- The lead confirmed a live 200 response on 2026-09-15: `boards-api.greenhouse.io/v1/boards/stripe/jobs`.

**Submit.** HTTP Basic auth with the employer's key. "Any form posts should be proxied by your own servers. Any direct post to the /applications POST method would reveal your secret key" (same URL). This is built for employer-owned career sites, not third parties.

**Harvest.**
- v1 and v2 were due to be "removed on August 31, 2026".
- "Harvest API requests for approved Greenhouse partners and customer-built custom integrations are limited to the amount specified in the returned X-RateLimit-Limit header, per 10 seconds"; "Unlisted vendors may be subject to additional rate limits."
- Source: https://docs.greenhouse.io/harvest.html

**Partner path.** The Candidate Ingestion API (`POST /v1/partner/candidates`) is for "sourcing partners with whom Greenhouse shares mutual customers". Each employer must connect it. https://docs.greenhouse.io/candidate-ingestion.html

### Lever

**Read.** `GET https://api.lever.co/v0/postings/{site}` (EU: `api.eu.lever.co`), no auth. It returns `hostedUrl`, `applyUrl`, `workplaceType` and `salaryRange`. https://github.com/lever/postings-api
- Live 200 confirmed 2026-09-15 (`/v0/postings/palantir`).

**Submit.** `POST /v0/postings/SITE/POSTING-ID?key=APIKEY`. The key is "generated by a Super Admin". More than "2 application POST requests per second" returns 429 (same URL).

**Main API.** Customers use API keys; partners build integrations with OAuth. https://hire.lever.co/developer/documentation

**Partners.** There is a "Job Boards/Sourcing" partner category. https://www.lever.co/partners/

### Ashby

**Read.** `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true`. https://developers.ashbyhq.com/docs/public-job-posting-api
- Live 200 confirmed 2026-09-15 (`ramp`). The response includes `secondaryLocations` such as "Remote (Canada)".

**Submit.** `applicationForm.submit` needs the employer key with `candidatesWrite`. Applications may be "blocked due to configured application limits". https://developers.ashbyhq.com/reference/applicationformsubmit

### Workable

**Read.** `GET https://www.workable.com/api/accounts/{subdomain}?details=true`, no auth. https://workable.readme.io/reference/jobs-1.md

**Submit.** `POST /spi/v3/accounts/{sub}/jobs/{shortcode}/candidates` with the `w_candidates` scope. `"sourced": false` treats the record as a real application. https://workable.readme.io/reference/job-candidates-create

**Limits.** Account token: 10 requests per 10s. OAuth and partner tokens: 50 per 10s. Partners get an `X-WORKABLE-CLIENT-ID` via integrations@workable.com. https://workable.readme.io/reference/rate-limits.md

### SmartRecruiters

**Read.** The Posting API is public "by design". https://developers.smartrecruiters.com/docs/authentication and https://developers.smartrecruiters.com/reference/v1listpostings.md

**Submit.** The Application API is "for customers and partners" who embed applying in "external career sites or job boards". It is OAuth-protected. https://developers.smartrecruiters.com/docs/application-api

**Job-board partners.** Partners pull the postings employers have purchased via `GET /publications`. https://developers.smartrecruiters.com/docs/partners-job-board-api.md

**Limits.** 10 req/s and 8 concurrent requests. https://developers.smartrecruiters.com/docs/rate-limiting.md

### Workday

**Read.**
- No official public job-board API was found.
- Career sites (`*.myworkdayjobs.com`) call an internal JSON endpoint. The lead tested `POST https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs` on 2026-09-15: HTTP 200 without auth, returning `total: 376` plus job postings with `remoteType` facets.
- The tenant's robots.txt publishes sitemaps and `Allow: /Workday/`, and disallows only `/refreshFacet/`. https://workday.wd5.myworkdayjobs.com/robots.txt
- **Prefer the published sitemaps over the undocumented CXS endpoint.**

**Terms.** Workday's site terms ban "data mining, robots or similar data gathering or extraction methods". Whether that covers customer career sites is unclear. https://www.workday.com/en-us/legal/site-terms.html

**Blocking.** A scraper project logged 4,622 HTTP 403 errors in 12 hours from Workday tenants on cloud (Hetzner) IPs in Apr 2026, and suspected Akamai-style bot management. https://github.com/colophon-group/jobseek/issues/2214 (anecdote)

**Submit.** Candidates must create an account per employer tenant. https://jobwizard.ai/blog/why-workday-creates-a-new-account-for-every-company **[secondary]** There is no public submit API.

### Recruitee

**Read.** `GET https://{company}.recruitee.com/api/offers/`, no auth. It returns remote and hybrid flags, salary, screening questions and `careers_apply_url`. https://docs.recruitee.com/reference/offers

**Submit.**
- `POST /offers/{offer_slug}/candidates`, with the OpenAPI `"security": []` (no auth).
- Required by default: `name`, `phone`, `email`, `cv`.
- "Creating a candidate using this endpoint WILL trigger sending a confirmation email - exactly like when candidate applies for your offer."
- Source: https://docs.recruitee.com/reference/offersoffer_idcandidates
- This is the only public submit endpoint in the set. Nothing addresses third-party use.

### BambooHR

**Read.** `GET /api/v1/applicant_tracking/jobs` requires auth. https://documentation.bamboohr.com/reference/get-job-summaries

**Submit.** `POST /api/v1/applicant_tracking/application` requires the `hiring:applications.write` scope. https://documentation.bamboohr.com/reference/create-candidate

### Teamtailor

Source for everything below: https://docs.teamtailor.com/ (Postman documenter, read with curl on 2026-09-15).

- **Auth.** Every example uses `Authorization: Token token=…` against `https://api.teamtailor.com/v1`. The `X-Api-Version` header has been required since 2025-10-01.
- **Read.** `GET /v1/jobs` with `include=department,locations`; page size defaults to 10 (max 30).
- **Submit.** `POST /v1/candidates` exists, and there is a `job-applications` resource.
- **Scopes.** Admin and Internal scopes have existed since 2017.
- **Rate limits.** Given via `X-Rate-Limit-Limit`, `-Remaining` and `-Reset` headers, with 429 when exceeded. No numbers are stated.
- **Employer embedding.** Employers can embed the application form as an iframe via `careersite-job-apply-iframe-url`.
- **Not documented.** Whether a keyless public job feed exists.

### Personio

**Read.** The public XML feed at `https://{company}.jobs.personio.de/xml`. https://developer.personio.de/docs/retrieving-open-job-positions

**Submit.** `POST https://api.personio.de/v1/recruiting/applications` with a Bearer recruiting token and `X-Company-ID`. https://developer.personio.de/v1.0/reference/post_v1-recruiting-applications

**Partners.** A Marketplace with its own ToS and API policy. https://developer.personio.de/docs/tos-api-security-1.md

### Unified ATS APIs (for the employer-side route only)

| Vendor | Application endpoint | Pricing | Source |
|---|---|---|---|
| Kombo | `POST /ats/jobs/{job_id}/applications` across 100+ ATSs, including Workday | Annual platform fee plus a fee per connected customer (no public prices) | https://docs.kombo.dev/ats/v1/post-jobs-job-id-applications, https://www.kombo.dev/pricing |
| Merge | Supports writes "based on availability" per ATS | 3 linked accounts free; $650/mo for up to 10; $65 per extra | https://docs.merge.dev/merge-unified/writing-data/writes/introduction.md, https://www.merge.dev/pricing |
| Apideck | `POST /ats/applications` | €599/mo (25 consumers) to €1,299/mo (100) | https://developers.apideck.com/apis/ats/reference, https://www.apideck.com/pricing |

**Caveat.** Every linked account is an **employer** authorising the connection. These APIs do not let a job-seeker app apply to arbitrary companies.

**Discovering which ATS a company uses.**
- TheirStack sells ATS and technographic detection (3 credits per company lookup). https://theirstack.com/en/pricing
- Otherwise, detect ATS hostnames (boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, *.recruitee.com, *.jobs.personio.de, *.myworkdayjobs.com) in Common Crawl or on company career pages, then probe the public endpoints above **[method, not a cited product]**.

## B2. Browser-extension autofill vs server-side bot submission

| Dimension | Extension autofill (Simplify, Careerflow, Huntr) | Server-side bot (LazyApply, JobCopilot, AIApply) | Human-in-the-loop service (Scale.jobs, Massive) |
|---|---|---|---|
| Who clicks submit | The user: "Copilot doesn't submit automatically" ([Simplify help](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications)) | The service: "Our agent handles the entire application process" ([LazyApply](https://lazyapply.com/)); "automatically submits applications on your behalf" ([AIApply](https://aiapply.co/auto-apply)) | Assistants apply with "a proof screenshot for every single application"; "associates based in India… ~$4/hour" ([Scale.jobs](https://scale.jobs/)) |
| Network identity | The user's own browser session, cookies and residential IP | Cloud IPs, or a user session relayed through an extension **[vendors do not disclose architecture]** | A human operator's browser |
| CAPTCHAs and email codes | The user solves them inline | Silent failures: "25–40% of attempted applications failing silently" at verification steps (Sonara relaunch, [secondary](https://www.remotejobassistant.com/blog/sonara-ai-review)) | The human solves them |
| Workday per-tenant accounts | The user creates or logs in | The bot must create accounts and read verification email | The human handles it |
| Accuracy | Wrong answers still reported ([Trustpilot](https://www.trustpilot.com/review/simplify.jobs)) | Irrelevant jobs, invented titles ([JobCopilot TP](https://www.trustpilot.com/review/jobcopilot.com)) | Better, but slow (12–24h) |
| ToS exposure | LinkedIn bans extensions that "automate activity" ([LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a1341387)); low exposure on ATS forms | Highest | Medium (a human, but acting for someone else) |

### Anti-bot measures in the wild

**Greenhouse.**
- **Invisible reCAPTCHA** "analyzes activity on a job post, like mouse movements and typing patterns". A low score can require an emailed code. https://support.greenhouse.io/hc/en-us/articles/115005448066-Invisible-reCAPTCHA
- **Real Talent** (2025-06-03): "Sophisticated algorithms [to] proactively identify and flag spam, bot submissions, and applications with patterns indicative of fraud". https://www.greenhouse.com/newsroom/greenhouse-real-talent-tm-launches-to-fix-overwhelming-candidate-pipelines-while-combatting-fraud-and-spam-in-hiring
- **February 2026 release notes:** fraud detection on "phone number, email, IP address, and location"; a spam blocklist for IPs, email domains and addresses; CLEAR identity verification. https://support.greenhouse.io/hc/en-us/articles/47028491519387-Release-notes-February-2026
- **Application limit rules:** employers can "limit how often someone can apply or block previously rejected candidates"; violations are auto-rejected. https://www.greenhouse.com/product-features/greenhouse-application-limit-rules

**Ashby.** Application spam protection "attempts to detect whether a real candidate is submitting the form or if it might be a bot". Levels run from Strict to No Protection, and the stricter levels warn that real candidates can be blocked. https://docs.ashbyhq.com/job-board-application-spam-protection

**Cloudflare Turnstile.** Non-interactive JS challenges (proof-of-work, web API probing, browser-behaviour detection) "to distinguish human visitors from automated traffic". https://developers.cloudflare.com/turnstile/

**Workday.** Per-tenant accounts, plus reported Akamai-style blocking of cloud IPs. https://github.com/colophon-group/jobseek/issues/2214 (anecdote)

**Implication.** Submitting from a server farm hits exactly the signals these vendors score on: IP, email pattern, velocity, and behaviour. Filling forms in the user's own browser does not.

## B3. LinkedIn account-ban risk

**The rules.**
- The User Agreement (effective 3 Nov 2025) §8.2 bans using "software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons…) to scrape or copy the Services", and using "bots or other unauthorized automated methods to access the Services". https://www.linkedin.com/legal/user-agreement
- The help center says: "We don't permit the use of any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website". Members "risk having their accounts restricted or shut down"; tools "may become non-operational without notice". https://www.linkedin.com/help/linkedin/answer/a1341387
- "Automated inauthentic activity… can result in temporary or permanent restriction." https://www.linkedin.com/help/linkedin/answer/a1340522

**Enforcement so far.**
- The actions found target scrapers: the Proxycurl settlement and shutdown (Jul 2025), and the ProAPIs lawsuit (Oct 2025). https://news.bloomberglaw.com/artificial-intelligence/linkedins-war-against-bot-scrapers-ramps-up-as-ai-gets-smarter
- AI Hawk "previously scanned LinkedIn before being banned". https://san.com/cc/an-ai-arms-race-is-reshaping-how-people-find-and-apply-for-jobs/
- No public LinkedIn action naming LazyApply or AIApply was found **[gap]**.

**Verdict.** Automating Easy Apply breaches LinkedIn's terms, and the account at risk is the user's career identity. Pemby should not touch LinkedIn automation.

## B4. How employers react

**Volume.**
- Greenhouse CEO Daniel Chait: ~254 applicants per job across 175,000 live jobs; applications per recruiter up 412%; he calls it an "AI doom loop". https://fortune.com/2026/07/27/greenhouse-ceo-daniel-chait-ai-doom-loop-job-seekers-spam-interview-applications-unemployment/
- Greenhouse Q1 2024: 222 applications per opening, ~3x late 2021. Capterra data cited there: 26% of candidates use AI to mass-apply. https://www.greenhouse.com/blog/ai-has-doubled-recruiters-workloads

**Counter-measures.**
- **Signals of real interest.** Greenhouse "My Dream Job" allows one priority application a month; nearly 500k have been sent, with a hire rate about 5x typical. Greenhouse also bought Ezra AI Labs so every applicant can get an AI voice interview (Fortune, above).
- **Deliberate friction.** Employers such as Vendr and JLL are adding manual steps. Vendr says it went from ~100 to 1,000+ applicants per role in 18 months. https://www.skillfuel.com/recruiters-friction-job-applications-ai-hiring/ (secondary, citing WIRED)
- **Fraud.** Gartner: "By 2028, 1 in 4 candidate profiles will be fake"; 6% of candidates admit interview fraud. https://www.hrdive.com/news/fake-job-candidates-ai/757126/
- **Blacklisting.** No evidence was found of cross-employer blacklists for auto-applying **[gap]**. The concrete mechanisms are per-employer:
  - Greenhouse application-limit and auto-reject rules, and IP and email blocklists (release notes above).
  - Ashby application limits (Ashby docs above).
  - A candidate flagged at one Greenhouse or Ashby employer is only blocked there.
- **Interview rates.** No rigorous study compares mass applying with targeted applying. The best data points are vendor-published:
  - Massive: "1-2 interviews every 100 applications" (https://usemassive.com/).
  - Greenhouse: 5x hire rate for dream-job applications (Fortune).

## B5. Legal

### LinkedIn ToS and hiQ v. LinkedIn

- **§8.2 text:** quoted in B3. https://www.linkedin.com/legal/user-agreement
- **hiQ, procedural history:**

| Date | Event | Source |
|---|---|---|
| 2019 | 9th Cir. affirms the preliminary injunction for hiQ | As recited in the 2022 opinion (next row) |
| 2021-06-14 | SCOTUS grants, vacates and remands in light of *Van Buren* | https://www.supremecourt.gov/docket/docketfiles/html/public/19-1116.html |
| 2022-04-18 | 9th Cir. again affirms. Where access "is open to the general public, the CFAA 'without authorization' concept is inapplicable", at least as a serious question. Preliminary stage only. | https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf |
| Nov 2022 | N.D. Cal.: hiQ breached the User Agreement through "(1) its automated web scraping… and (2) its hiring of crowdsourced workers ('turkers') to create fake profiles" | https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/ |
| ~2022-12-06 | Consent judgment: $500,000 to LinkedIn, a permanent injunction against scraping, deletion of code, data and algorithms, and a non-precedential stipulated CFAA liability | Same ZwillGen URL |

- ***Van Buren*** (2021): "exceeds authorized access" is a "gates-up-or-down inquiry". https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf
- ***Meta v. Bright Data*** (N.D. Cal., 2024-01-23): Meta's terms do not bar logged-off scraping of public data. https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/
- ***X Corp v. Bright Data***: dismissed in 2024 on preemption grounds **[unverified]**.
- **Takeaway.**
  - The CFAA is weak against logged-out scraping of public pages.
  - **Contract is strong against anyone who accepted the terms**, which includes every logged-in user and any bot that uses a user's session.
  - Trespass to chattels and misappropriation remain available claims.

### GDPR / UK GDPR for CV processing

- **Lawful basis.**
  - Art. 6(1)(b), contract, fits the matching and applying the user asks for. 6(1)(f), legitimate interests, fits improvement work **[analysis]**.
  - UK DUAA 2025 adds "recognised legitimate interests", in force 2026-02-05. https://www.legislation.gov.uk/uksi/2026/82/regulation/2/made
- **Special-category data.**
  - Art. 9 lists racial or ethnic origin, political opinions, religious beliefs, trade union membership, health, sex life and orientation, genetic and biometric data. Exceptions include explicit consent (9(2)(a)) and data "manifestly made public" (9(2)(e)). https://www.legislation.gov.uk/eur/2016/679/article/9
  - CVs regularly carry these by accident: disability, faith-based volunteering, union roles.
- **Photos.** A photo is biometric data only when "specific technical processing" allows unique identification. Plain storage is not biometric processing. https://www.legislation.gov.uk/eur/2016/679/article/4
- **Nationality, citizenship, visa status.**
  - Not Art. 9 data (Art. 9 URL above).
  - Discrimination risk: nationality falls within "race" under the UK Equality Act 2010 s.9, and 8 U.S.C. §1324b bars citizenship-status discrimination in the US **[unverified; statutes not fetched]**.
  - Use it only as the user's own filter, and never infer ethnicity from it.
- **Automated decisions.**
  - EU Art. 22 restricts solely automated decisions with legal or similarly significant effects **[EUR-Lex fetch failed]**.
  - The UK replaced Art. 22 with Arts. 22A–22D (DUAA s.80, in force 2026-02-05). These allow significant automated decisions with safeguards, and restrict them where special-category data is used. https://www.legislation.gov.uk/ukpga/2025/18/section/80
- **DPIA.** Expect one to be required: AI, profiling, and innovative technology are on the ICO high-risk list **[ICO page 403]**.
- **Roles.**
  - Pemby is the controller for the candidate relationship.
  - Sending an application discloses data to the employer, which becomes an independent controller **[analysis]**.
- **ICO AI-in-recruitment audit outcomes** (Nov 2024):
  - Close to 300 recommendations.
  - Some tools inferred gender and ethnicity from names.
  - Some allowed filtering on protected characteristics.
  - Source: https://ico.org.uk/action-weve-taken/audits-and-overview-reports/2024/11/ai-tools-in-recruitment/ **[page 403; facts from snippets]**

### EU AI Act

- **Annex III point 4(a)** covers "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates". https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3
- **Scope turns on "intended purpose"** as the provider states it in instructions and marketing. https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-3
  - **[Analysis]** A tool that only helps the candidate choose jobs has a credible argument that it is not "for recruitment or selection".
  - Anything that ranks or filters candidates *for employers* is squarely high-risk.
- **Art. 6(3) exemptions** cover narrow procedural tasks, preparatory tasks, and similar. But a system "shall always be considered to be high-risk where the AI system performs profiling of natural persons". https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-6
  - CV-to-job matching is plausibly profiling, so do not rely on 6(3).
- **Art. 6 classification guidelines.**
  - They were due 2026-02-02. Only a **draft** exists, published 2026-05-19, with consultation closing 2026-07-23. No final version was found.
  - The draft says tools that "analyze, filter, score, or rank candidates typically qualify", and that ToS-only restrictions do not avoid classification.
  - Source: https://www.dlapiper.com/en/insights/publications/2026/06/eu-commission-draft-guidelines-on-classification-of-high-risk-ai-systems-key-points **[secondary]**
- **Art. 50 transparency.** Tell users they are interacting with AI, and mark synthetic content machine-readably. That covers AI-generated cover letters. https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
- **Timeline as of 2026-09-15.**

| Date | Milestone | Source |
|---|---|---|
| 2024-08-01 | Entry into force | Standard date **[not re-fetched]** |
| 2025-02-02 | Prohibitions and AI literacy apply | Standard date **[not re-fetched]** |
| 2025-08-02 | GPAI obligations apply | Standard date **[not re-fetched]** |
| 2026-07-08 | **Digital Omnibus on AI signed** (trilogue 7 May, EP vote 16 Jun 423–57–174, Council 29 Jun) | https://www.europarl.europa.eu/legislative-train/package-digital-package/file-digital-omnibus-on-ai |
| 2026-08-02 | Art. 50 transparency applies | https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/ |
| 2026-12-02 | Art. 50(2) content marking for systems already on the market before 2 Aug 2026 | Europarl legislative train (above) |
| **2027-12-02** | **Stand-alone (Annex III) high-risk obligations apply**, including employment | Europarl legislative train (above) |
| 2028-08-02 | High-risk AI embedded in products (Annex I) | Europarl legislative train (above) |

- Official Journal citation (reported as Reg (EU) 2026/1744, published 2026-07-24) **[unverified]**.

### NYC Local Law 144 and other US laws

- **LL144.**
  - "Employers and employment agencies" may not use an AEDT unless it has had a bias audit within one year, the results are public, and candidates got notice 10 business days before use.
  - Enforcement since 2023-07-05.
  - Source: https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page
- **Enforcement audit.** The NY State Comptroller (2025-12-02) found enforcement "ineffective": DCWP found 1 issue across 32 companies, auditors found at least 17. https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools **[403; snippet]**; https://www.dlapiper.com/en-us/insights/publications/2026/01/critical-audit-of-nyc-ai-hiring-law-signals-increased-risk-for-employers
- **Candidate-side tool.** Not covered unless Pemby scores candidates for employers or counts as an employment agency **[analysis]**.
- **Colorado.**
  - SB24-205 was **repealed and re-enacted by SB26-189**, signed 2026-05-14. It covers "automated decision-making technology" in consequential decisions, including employment.
  - Developer documentation is due 2027-01-01. Deployers must give notice, explain adverse outcomes within 30 days, and offer correction and human review. The AG enforcement grace period ends 2030-01-01.
  - Source: https://leg.colorado.gov/bills/sb26-189
- **Illinois HB 3773** (effective 2026-01-01): bans discriminatory employer AI use and ZIP-code proxies, and requires notice **[unverified; ilga.gov unreachable]**.
- **California CRD ADS regulations** (effective 2025-10-01): define "automated-decision system" and "agent", and require keeping ADS records for 4 years. https://calcivilrights.ca.gov/2025/06/30/civil-rights-council-secures-approval-for-regulations-to-protect-against-employment-discrimination-related-to-artificial-intelligence/

### Applying on a candidate's behalf

- **ESIGN.** A record is not invalid because an "electronic agent" formed it, "so long as the action of any such electronic agent is legally attributable to the person to be bound". https://www.law.cornell.edu/uscode/text/15/7001
  - The attestation checkboxes ("I certify this is accurate") bind the candidate, so Pemby needs recorded, specific authority.
  - Fabricated content creates misrepresentation exposure for both parties **[analysis]**.
- **UK Employment Agencies Act 1973.**
  - An "employment agency" provides services "(whether by the provision of information or otherwise) for the purpose of finding persons employment". https://www.legislation.gov.uk/ukpga/1973/35/section/13
  - An agency "shall not request or directly or indirectly receive any fee" from work-seekers except as prescribed. https://www.legislation.gov.uk/ukpga/1973/35/section/6
  - A paid "we apply for you" service is plausibly caught **[analysis; the 2003 Conduct Regulations exceptions were not checked]**.
- **New York.** An "employment agency" is "any person who, for a fee, procures or attempts to procure employment". https://www.nysenate.gov/legislation/laws/GBS/171
  - Licensing may apply to a paid apply-for-you service **[unverified]**.

## B6. Job data sourcing

| Source | Coverage | Access and limits | Cost | Key restrictions | Source URL |
|---|---|---|---|---|---|
| **ATS public boards** (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio XML) | Every employer on those ATSs | No auth; limits per B1 | Free (you pay for crawl infrastructure) | No aggregator terms published; link to the employer's apply URL | See B1 |
| **Workday career sites** | Large enterprises | Sitemaps in robots.txt; CXS undocumented | Free | Site-terms ambiguity; bot blocking | https://workday.wd5.myworkdayjobs.com/robots.txt |
| **Adzuna API** | UK and ~19 countries **[country count unverified]** | `app_id`/`app_key`; 25/min, 250/day, 1,000/wk, 2,500/mo | Free; a "14 day trial period" for commercial use, then "a licence agreement may be required" | "Jobs by Adzuna" logo at least 116×23; no aggregation without written consent | https://developer.adzuna.com/docs/terms_of_service |
| **Jooble API** | Global aggregator | Key via form | Not stated | Custom display allowed | https://jooble.org/api/about |
| **Careerjet API v4** | Many locales | Basic auth with a publisher key; IP whitelisting reported | Revenue share to the publisher | Partner terms page 404 | https://www.careerjet.com/partners/api/, https://dev.to/rsvlim/gemini-called-it-a-public-api-careerjets-registration-portal-disagreed-2aaf |
| **TheirStack** | "225M records + 305k new per day", 195 countries, 352k sources | REST + webhooks; free tier 400 requests/day | $49/mo (1.5k credits) to $1,500/mo (1M) to $5,500/mo (5M); 1 credit per job | Display and redistribution ToS not retrieved **[gap]** | https://theirstack.com/en/pricing, https://theirstack.com/en/docs/api-reference/rate-limit |
| **Coresignal** | 482M+ job postings | API + datasets | $49/mo (2,500 credits) to $5,000/mo (10M); datasets from $1,000/mo | Resale banned; data licence is private | https://coresignal.com/pricing/, https://coresignal.com/terms-and-conditions/ |
| **Fantastic.jobs (Active Jobs DB)** | 3M+ career-site jobs/mo from 200k+ ATS and career sites; 11M+ job-board jobs/mo (LinkedIn, Wellfound, YC); 100+ countries | Self-serve API, RapidAPI; hourly refresh, daily expiry checks | From $95/mo; high volume from $1,000/mo | No published licence; **avoid the LinkedIn-sourced subset** | https://fantastic.jobs/ |
| **JSearch (OpenWeb Ninja)** | Google for Jobs + LinkedIn, Indeed, Glassdoor, ZipRecruiter | RapidAPI | Free 200 requests/mo; $25 (10k), $75 (50k), $150 (200k) | Data sourced from Google results; Google ToS bans automated access against machine-readable instructions | https://www.openwebninja.com/api/jsearch, https://policies.google.com/terms |
| **USAJOBS** | US federal | `Authorization-Key` header; 500 rows per page | Free | Link out via `ApplyURI` | https://developer.usajobs.gov/guides/authentication |
| **Arbeitnow** | EU/UK, drawn from Greenhouse, SmartRecruiters, Recruitee, Teamtailor and others | Open JSON, no key | Free | No published terms; has `visa_sponsorship` and `remote` fields | https://www.arbeitnow.com/api/job-board-api |
| **Reed.co.uk** | UK | Basic auth (key as username) | Not stated | Terms page 404 | https://www.reed.co.uk/developers/jobseeker |
| **Remotive / Himalayas / RemoteOK / WWR feeds** | Remote | See A2 | Free | Attribution required; Remotive and Himalayas ban redistribution; Remotive bans signup gating | https://github.com/remotive-com/remote-jobs-api, https://himalayas.app/api |
| **EURES** | EU/EEA | No public vacancy API found | n/a | Content reuse allowed with ELA acknowledged | https://eures.europa.eu/legal-notice_en |
| **Indeed Publisher API** | Dead ("Job Search (Deprecated)") | n/a | n/a | n/a | https://developer.indeed.com/docs/publisher-jobs/job-search **[snippet]** |
| **LinkedIn Job Posting API** | Posts jobs **to** LinkedIn; cannot read them | "We are currently not accepting new partnerships"; "restricted to those developers approved by LinkedIn" | n/a | n/a | https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview |
| **Google Cloud Talent Solution** | Searches only jobs you upload | GCP | n/a | Not a data source | https://docs.cloud.google.com/talent-solution/job-search/docs |
| **Common Crawl / Web Data Commons JobPosting** | CC-MAIN-2026-34: 2.14B pages. WDC JobPosting subset (Oct 2024 crawl): 3.61M URLs, 63,320 hosts | S3/HTTP; N-Quads by class | Free (compute and egress only) | CC grants a "limited… non-sublicensable" licence and leaves you responsible for third-party copyright; WDC data is ~2 years old | https://commoncrawl.org/terms-of-use, https://commoncrawl.org/blog/august-2026-crawl-archive-now-available, https://webdatacommons.org/structureddata/2024-12/stats/schema_org_subsets.html |

**Why JobPosting markup is everywhere.**
- Google for Jobs requires `title`, `description`, `datePosted` and `hiringOrganization`, plus `jobLocation` or `applicantLocationRequirements`.
- Remote jobs use `jobLocationType: TELECOMMUTE`.
- Source: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- `applicantLocationRequirements` is the one standard field that encodes remote eligibility by country.

**Use of Common Crawl.** Treat it as a **discovery index** (which companies use which ATS board), not as listings. Crawls are ~2-week snapshots and most jobs close within weeks (commoncrawl.org blog, above).

---

## Gaps no one fills

1. **Structured eligibility matching.**
   - No board or tool models the user's citizenship, work authorisation and timezone, then filters jobs by the employer's real constraints.
   - Himalayas has job-side `locationRestrictions`/`timezoneRestriction` fields ([API](https://himalayas.app/api)) but no user model.
   - Wellfound's sponsorship flag is US-only ([help](https://help.wellfound.com/article/749-company-visa-sponsorship)).
   - LinkedIn has no such filter ([help](https://www.linkedin.com/help/linkedin/answer/a6889044)).
   - WWR users say "work from anywhere" is false "in 99% of the cases" ([TP](https://www.trustpilot.com/review/weworkremotely.com)).
   - The data exists in ATS feeds (`workplaceType`, `secondaryLocations: Remote (Canada)`, `applicantLocationRequirements`); nobody normalises it.
2. **Ghost-job and freshness verification.**
   - Complaints about stale or fake jobs appear on LinkedIn, Indeed, WTTJ, WWR, RemoteOK and Teal.
   - The ATS public endpoints give a ground truth for whether a job is still open, and it is free (B1). Nobody surfaces it to seekers.
3. **Accurate, honest form filling across ATSs.**
   - Simplify is the leader and still gets "filling crap in fields" and "still had to spend a lot of time" ([TP](https://www.trustpilot.com/review/simplify.jobs)).
   - Server-side tools invent job titles ([JobCopilot TP](https://www.trustpilot.com/review/jobcopilot.com)).
   - Nobody offers deterministic, user-approved answers per question type (work authorisation, notice period, salary, EEO) with provenance.
4. **Quality over volume.**
   - Employers now reward signals of real interest (Greenhouse "My Dream Job", 5x hire rate) and punish volume with limits and blocklists ([Fortune](https://fortune.com/2026/07/27/greenhouse-ceo-daniel-chait-ai-doom-loop-job-seekers-spam-interview-applications-unemployment/); [Greenhouse limits](https://www.greenhouse.com/product-features/greenhouse-application-limit-rules)).
   - No seeker tool is built around fewer, better-targeted applications with explained fit.
5. **Non-US developers.**
   - Jobright, Simplify and Wellfound are US-centric.
   - Arc, Turing and Toptal gate non-US developers behind vetting that stalls or feeds AI-training work ([Turing TP](https://www.trustpilot.com/review/turing.com), [Arc TP](https://www.trustpilot.com/review/arc.dev)).
6. **Trustworthy billing.**
   - Refunds voided by volume, lock-ins and hidden renewals recur across the category: [Massive](https://www.trustpilot.com/review/usemassive.com), [WWR](https://www.trustpilot.com/review/weworkremotely.com), [AIApply](https://www.trustpilot.com/review/aiapply.co), [JobCopilot](https://www.trustpilot.com/review/jobcopilot.com).
   - Transparent pricing is a cheap way to stand out.

## Recommended application-automation approach (with risk ranking)

**Recommendation.** Build a user-submits assistant, not a bot.

- **Data layer.** Ingest from the public ATS board endpoints (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio XML, Workday sitemaps). Use Common Crawl or TheirStack ATS detection to discover employers, and optionally Fantastic.jobs or TheirStack for gap-fill once display rights are confirmed in writing.
- **Matching layer.** A candidate-side eligibility and preference model, with ghost-job checks against the live ATS endpoint.
- **Apply layer.** A browser extension or in-browser agent that:
  1. Pre-fills the employer's own form in the user's browser session.
  2. Uses deterministic, user-approved answers for eligibility and compliance questions.
  3. Drafts free-text answers, labelled as AI-generated (Art. 50).
  4. Leaves the user to solve any CAPTCHA and click submit.
  5. Logs exactly what was sent.
- **Pricing.** Keep the app free or subscription-based **for software**, never a per-placement fee, to stay clear of employment-agency fee rules.

**Risk ranking of approaches, lowest to highest:**

| Rank | Approach | Technical risk | Legal / ToS risk | Employer-reaction risk | Verdict |
|---|---|---|---|---|---|
| 1 (lowest) | **Deep link + prefilled "application pack"** (copy-ready answers, tailored CV), user fills the form | None | Minimal: GDPR basics, Art. 50 labels | None | Ship first; saves maybe half the time |
| 2 | **Extension autofill; user reviews and submits** (Simplify model) | Medium: many DOM variants; Workday per-tenant accounts; accuracy | Low on ATS forms. **Do not operate on linkedin.com**: extensions that "automate activity" are banned ([LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1341387)) | Low: one human-paced submit from a residential IP | **Core product.** Proven at 500k users |
| 3 | **Official submit APIs via employer or partner integration** (Greenhouse Ingestion, SmartRecruiters Application API, Lever or Workable partner tokens, Kombo/Merge) | Low per ATS | Low, but needs each employer's consent or a partnership agreement ([Greenhouse ingestion](https://docs.greenhouse.io/candidate-ingestion.html), [SmartRecruiters](https://developers.smartrecruiters.com/docs/application-api)) | Positive: employers opt in | Long-term channel once Pemby has candidate supply to offer employers. Employer-side ranking triggers AI Act high-risk (2 Dec 2027) and LL144 |
| 4 | **Server-side submit to keyless endpoints** (Recruitee's public POST) | Low | Medium: no third-party permission documented; you are acting as the candidate's agent (ESIGN attribution; attestations) ([Recruitee](https://docs.recruitee.com/reference/offersoffer_idcandidates), [ESIGN](https://www.law.cornell.edu/uscode/text/15/7001)) | Medium: confirmation emails fire; employers may see a pattern | Only with explicit per-application user confirmation; niche coverage |
| 5 | **Human-in-the-loop "we apply for you"** (Scale.jobs/Massive model) | Low | **High for paid UK/NY service**: employment-agency definitions and the UK work-seeker fee ban ([EAA s.6](https://www.legislation.gov.uk/ukpga/1973/35/section/6), [NY GBL §171](https://www.nysenate.gov/legislation/laws/GBS/171)) | Medium | Avoid; low margins (~$4/hour offshore labour) and legal exposure |
| 6 | **Headless-browser bot submitting from cloud** (LazyApply/JobCopilot/Sonara model) | High: reCAPTCHA scoring, email codes, Workday per-tenant accounts, Akamai/Cloudflare blocking of cloud IPs ([Greenhouse reCAPTCHA](https://support.greenhouse.io/hc/en-us/articles/115005448066-Invisible-reCAPTCHA), [Ashby](https://docs.ashbyhq.com/job-board-application-spam-protection), [Workday 403s](https://github.com/colophon-group/jobseek/issues/2214)) | Medium–High: ATS/site terms; fabricated-answer liability | **High**: Greenhouse IP/email blocklists and application limits ([release notes](https://support.greenhouse.io/hc/en-us/articles/47028491519387-Release-notes-February-2026)) | Avoid. Worst ratings in the category; Sonara died |
| 7 (highest) | **Any LinkedIn automation** (Easy Apply bots, scraping LinkedIn jobs, or buying LinkedIn-sourced feeds) | High | **Highest**: User Agreement §8.2; hiQ lost on contract, paid $500k and destroyed its data ([ZwillGen](https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/)); the user's account can be restricted | High | Do not do it |

**Compliance guardrails for ranks 1–3.**
- **GDPR.** Contract as the lawful basis; a DPIA before launch; detect and minimise special-category data in CVs; never infer ethnicity; citizenship and visa status only as the user's own filter.
- **Transparency and accuracy.** Art. 50 labelling on AI text; never fabricate experience; the user sees each attestation before submitting.
- **No employer-side scoring.** Keep matching candidate-side until Pemby is ready for Annex III conformity work (due 2027-12-02), NYC LL144 bias audits, and Colorado SB26-189 duties.

## Open items to verify before build

- TheirStack and Fantastic.jobs display and redistribution licence terms.
- Whether Recruitee permits third-party use of its public candidates endpoint.
- Workday site terms as applied to `*.myworkdayjobs.com`.
- Teamtailor public-key availability and numeric rate limits.
- Official Journal citation for the AI Act Digital Omnibus; final Art. 6 guidelines.
- UK Conduct of Employment Agencies Regulations 2003 fee exceptions, and NY employment-agency licensing, for any paid service that applies for users.
- Reddit and G2 sentiment, which could not be collected here.
