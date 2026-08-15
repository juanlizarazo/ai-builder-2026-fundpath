# Government Opportunity Finder — Project Context
**Event:** Startup State / AI Builder Day Hackathon · GOEO Challenge
**Date:** August 14, 2026 · Build window: 24 hours

---

## 1. THE CHALLENGE (from official brief)

**One-sentence mission:** Build an intelligence layer that answers — "I'm an [industry] startup in Utah with [N] employees, $[X] ARR and a $[Y] need. What government resources should I know about — and why?"

**Not this:** a keyword search engine over grants.
**This:** a system that translates startup language into government language, ranks real fits, explains them, shows historical proof, and knows when to say no.

### Required core capability
Federal opportunity discovery (grants, R&D funding, loans, procurement) — must work end-to-end for all five standard test cases (§4).

### The 5-step product flow the brief describes
1. **Understand a startup** — natural language input → extract: description, industry, technology, location, employees, revenue, funding stage, capital raised, R&D activity, product maturity, target customers, capital need, use of funds.
2. **Discover opportunities** — across Grants.gov, SAM.gov Assistance Listings, USAspending, SBIR.gov (recommended stack — not mandatory, but the common foundation every team gets scored against).
3. **Match & rank** — go beyond keyword matching. Translate domain language ("reduces nurse admin burden" → healthcare + AI + workforce + health IT + hospital ops + clinical tech).
4. **Explain the match** — every opportunity needs FOUR sections:
   - Why we think you're a fit
   - What could make you ineligible
   - What you should verify
   - What to do next
   - Plus a fit tier: 🟢 Likely Fit / 🟡 Potential Fit–Verify / 🟠 Adjacent / 🔴 Probably Not a Fit
   - **Hard rule: never present an AI assessment as a definitive eligibility determination.**
5. **Show the history** — "who else got this money?" via USAspending + SBIR.gov: similar companies, total historical awards, median award, # in Utah, # in same vertical.

### Bonus features (only after core works)
Opportunity Alerts · Similar Company Discovery · Funding Strategy (5 programs to investigate over 12mo) · Agency Map · Opportunity Graph (Startup→Tech→Agency→Program→Award→Similar Companies→Application) · Application Assistant (checklist, registrations, dates, docs).

### What NOT to build (explicitly out of scope — don't waste hours here)
Integrating every agency · guaranteeing eligibility · a complete application system · every state program · production-ready platform · scraping every gov site · a "perfect" recommendation engine.

---

## 2. JUDGING RUBRIC — BUILD TO THIS

| Weight | Criterion | What they're actually checking |
|---|---|---|
| **30%** | Usefulness | Real problem solved? Founder would use it? Saves time? Surfaces missed opportunities? Reduces jargon? |
| **25%** | Quality of Matching | Relevance, accuracy, depth, understanding of context, **distinguishing strong vs weak matches**, quality of explanations |
| **20%** | Intelligence & Insight | Goes beyond search: similar companies, historical funding, agency intelligence, unexpected/adjacent opportunities, eligibility concerns, funding strategy, procurement, clear "why" |
| **15%** | User Experience | Simplicity, speed, clarity, information hierarchy, minimal jargon, visual presentation |
| **10%** | Technical Execution | Functional prototype, data integration, reliability, thoughtful AI use, creativity |

**Reading of the rubric:** 55% of the score (Usefulness + Matching) is about the founder-facing answer being *right and clear*, not about how much data you ingested. 20% (Intelligence) rewards the historical-award cross-referencing most teams will skip. Technical Execution is only 10% — don't over-engineer infra at the expense of the explanation layer.

**Explicit judge signal on hallucination:** "We will reward systems that can say 'there probably isn't a strong match' rather than hallucinating one." → calibrated abstention is a scored capability, not a nice-to-have.

---

## 3. RECOMMENDED DATA STACK — STATUS & ACCESS NOTES

| Source | Auth | Access status | Use for |
|---|---|---|---|
| **Grants.gov Search2 + fetchOpportunity** | None | ✅ Ready immediately — `POST api.grants.gov/v1/api/search2` | Current/forecasted grant opportunities, eligibility codes, deadlines |
| **SAM.gov Assistance Listings** | API key (10 req/day unless entity-linked → 1,000/day) | ⚠️ **Provision the account tonight** | Richest eligibility data (applicant type codes, obligation history, award ranges) |
| **USAspending.gov v2** | None | ✅ Ready immediately | Historical awards, recipient search, "who else got this" |
| **SBIR.gov API + bulk CSV** | None (API), n/a (CSV) | ⚠️ API has maintenance outages — **cache CSV early**, don't rely on live calls at demo time | SBIR/STTR award history, solicitations/topics, firm lookup |

**Action item #1 tonight:** create a SAM.gov account and generate the API key (instant once account exists) — or skip the key and use the bulk Assistance Listings extract instead.
**Action item #2 tonight:** download the SBIR.gov award CSV and cache locally before doing anything else with it.

**The join key across all four sources: ALN / CFDA number** (`##.###`, e.g. `93.866`). This is what lets you say "this Grants.gov opportunity ↔ this Assistance Listing's eligibility rules ↔ these actual USAspending recipients ↔ these SBIR.gov named companies." Build the schema around this field.

*(Full endpoint schemas, filter params, and gotchas are in the separate deep-research doc — keep that open as an API reference while coding.)*

---

## 4. THE FIVE STANDARD TEST CASES — TARGET OUTPUTS

Every submission is judged against these. Precompute and hand-verify all five before demo day.

### Case 1 — AI Healthcare
Utah SaaS · 15 employees · $1M ARR · $2.5M raised · needs $500K–$2M · AI reducing nurse admin work.
**Expect to surface:** NIH SBIR/STTR (institutes relevant to nursing/informatics), AHRQ R18, ARPA-H digital health, NSF (if framed as core AI R&D). NAICS 541511/541512/513210/334510.
**Target tier:** 🟢 Likely Fit on NIH SBIR. Verify VC ownership % given the raise (NIH/NSF tolerate majority-VC; most other agencies don't).

### Case 2 — Advanced Manufacturing / Aerospace
Utah hardware · 35 employees · $3M revenue · $8M raised · needs $2M–$5M · lightweight aerospace components.
**Expect to surface:** NASA SBIR (Advanced Manufacturing Technologies), DoD SBIR/AFWERX/SpaceWERX, STRATFI/TACFI (bridges to reach the $2–5M band), DOE AMMTO, NIST MEP.
**Target tier:** 🟢/🟡 — single SBIR awards won't cover the full ask; the honest answer stacks Phase I→II plus STRATFI/TACFI match. Verify employee+affiliate count ≤500.

### Case 3 — Climate / Water Technology
Utah startup · 10 employees · $500K revenue · $1.5M raised · needs $500K–$3M · sensor+AI reducing municipal water loss.
**Expect to surface:** NSF SBIR (startup can be prime), EPA SBIR, DOE Water Security prizes, Bureau of Reclamation prize competitions (startup can be prime). **Eligibility nuance:** WaterSMART grants / SRF loans usually require a utility or municipal applicant as prime — startup can only be a subcontractor/tech provider there. Say so explicitly.
**Target tier:** 🟢 on NSF/DOE prizes, 🟠 (adjacent, needs municipal partner) on WaterSMART/SRF.

### Case 4 — Cybersecurity
Utah cybersecurity · 22 employees · $2M ARR · $5M raised · needs $1M–$3M · AI threat detection for SMBs.
**Expect to surface:** DoD SBIR/AFWERX, DHS S&T SBIR, NSF (trustworthy computing). **Key nuance:** "for SMBs" is a commercial framing — grant fit requires reframing toward a federal/critical-infrastructure end-user. Flag this translation explicitly as part of the explanation.
**Target tier:** 🟡 — genuine fit exists but needs a named government customer, which is a real gap to surface, not hide.

### Case 5 — Consumer / Workforce Tech (THE ABSTENTION TEST)
Utah marketplace · 8 employees · $750K revenue · $1M raised · needs $250K–$1M · connecting parents with youth activities.
**Correct answer: weak/no strong federal grant match.** Most relevant Grants.gov programs (DOL WIOA, ED discretionary, HHS ACF childcare) are restricted to states/nonprofits/higher ed — not for-profit applicants. SBIR requires a genuine R&D core, which a booking marketplace typically lacks.
**One legitimate edge case to check:** ED/IES SBIR — only qualifies if there's a real edtech + measurable-outcomes research component, not just a marketplace.
**Honest recommendation set instead:** SBA 7(a)/microloan, Utah SSBCI (incl. <10-employee set-aside), Utah bridge-loan program, local EDTIF/economic development, WTC Utah/STEP if exporting.
**Target tier:** 🔴 Probably Not a Fit on federal grants, with a clear pivot to non-grant alternatives. **This is the case judges will scrutinize for hallucination — do not force a fake match here.**

---

## 5. ELIGIBILITY LOGIC THE MATCHER MUST ENCODE

These are deterministic rules, not things to leave to LLM judgment:

- **For-profit eligibility signal:** Grants.gov applicant codes `22` (for-profit other), `23` (small business), `99` (unrestricted) = startup-eligible. Codes `00,01,02,04,05,06,07,08,11,12,13,20,21` = government/nonprofit/higher-ed/individual only → **not eligible**, flag as such rather than matching anyway.
- **SBIR baseline eligibility:** for-profit; ≤500 employees **including affiliates** (VC common-control portfolios can push you over — check this, not just headcount); ≥51% owned/controlled by US citizens or permanent residents (or another qualifying small business).
- **Majority-VC/PE ownership:** only reliably fundable at **NIH and NSF** (DoD sometimes in practice). If raise structure implies majority-VC control, restrict recommendations accordingly and say why.
- **SBIR vs STTR:** SBIR requires PI primarily employed (>50%) by the small business; STTR requires a research-institution partner and allows PI at the RI.
- **Water/infrastructure grants (WaterSMART, SRF):** typically require a utility/municipal/university prime — a pure startup applicant should be downgraded to 🟠 with "partner as subcontractor" guidance, not rejected outright or falsely approved.
- **Registration lead time (put in "what to do next"):** SAM.gov UEI takes 10–15 business days (budget 3–4 weeks). This is the single highest-value practical tip and costs nothing to surface.

---

## 6. UTAH-SPECIFIC BONUS LAYER (optional per brief, but cheap differentiator)

- **Nucleus / Utah Innovation Center** — free SBIR/STTR counseling, SBA FAST awardee.
- **UTIF** — microgrants up to $3,000 for first-time SBIR/STTR Phase I applicants; non-recourse bridge loans (~$50–60K, repay only on commercial success).
- **Utah SSBCI** (~$69M) — includes a <10-employee set-aside and a disadvantaged-entrepreneur set-aside; relevant directly to Case 5 and Case 3.
- **Utah APEX Accelerator** — free procurement/GSA Schedule help.
- Surface these as a small side panel, not a competing core feature — the brief is explicit that federal discovery is the required core.

---

## 7. ARCHITECTURE (per brief's suggested shape)

```
Government Data (Grants.gov, SAM.gov, USAspending, SBIR.gov)
     ↓
Normalization (Agency | Program | Opportunity | Eligibility | Funding | Deadline | Industry | Geography | Historical Awards)
     ↓  — joined on ALN/CFDA number
Intelligence Layer (rules engine for eligibility + embeddings for semantic match + LLM for explanation)
     ↓
Matching / Ranking (Startup profile → scored, tiered opportunities)
     ↓
Founder Experience (Opportunity Map: recommendations + 4-part explanation + historical proof + next steps)
```

**Build priority given the 55% weight on Usefulness+Matching:** the rules engine (deterministic eligibility) should gate the LLM, not the other way around. Let the LLM write the explanation prose; don't let it decide fit/no-fit alone — that's where hallucination on Case 5 comes from.

---

## 8. DELIVERABLES CHECKLIST

- [ ] Working prototype answering all 5 test cases correctly (including the Case 5 abstention)
- [ ] Natural-language company input → structured profile extraction
- [ ] Opportunity Map UI: fit tier, 4-part explanation, historical award panel, next steps
- [ ] Historical intelligence panel (# similar companies, total $, median $, # in Utah, # in vertical)
- [ ] Cached/local data (no live API calls during demo — speed counts toward UX score)
- [ ] Utah bonus panel (optional, time-permitting)
- [ ] Clean, jargon-light visual presentation (15% of score)
- [ ] Confirm logistics with organizers: submission format, demo length, deadline, team rules, whether this can double as the MadeThis submission

---

## Reference
Full API schemas, request/response examples, program-by-program dollar amounts and deadlines, NAICS/PSC mappings, named comparator companies, and competitive landscape are in the companion deep-research document: *"Government Opportunity Finder for Startups: Data Sources, Eligibility Logic, and Utah SBIR Strategy."* Keep it open alongside this file while building.

---

## Field Notes — Presentation Room, August 14, 2026
*Raw notes taken during the in-room kickoff presentation. Informal — captured as spoken.*

### The Challenge (as described in the room)

- The **Department of Defense** wants to build **Centers of Innovation** inside partner states. Tyler's role: maintain a verified list of things the government wants done and will pay someone to do.
- The ask: **build a tool that discovers funding and grant opportunities across multiple government websites** — resource discovery as the core product.
- The dream scenario: a founder comes in, describes their company, the tool finds matches, **pre-fills the application for them**, and they apply with minimal effort.
- Mentioned specifically: **America's Seed Fund (SBIR)** and other programs accessible via open APIs.
- The path: entrepreneur inputs what they do (or want to do) → system surfaces what's available to them → ideally helps them apply.

### What They Want Built

- Functional, not just pretty. Quote: *"Don't build something technically sound or that looks pretty and doesn't work."*
- Something the **State of Utah can market** and continue to scale.
- Target feel: **simple, amazing** — a "Founder Sherpa" that helps navigate government funding without feeling overwhelming.
- Features called out explicitly:
  - Surface **best-fit opportunities** for the founder's profile
  - **Grant writing assistance** — show what to submit, what to say
  - **Pre-fillable application forms** — a form you can populate and hand off would be a strong differentiator
  - **Automation** of as much of the process as possible
- Focus agencies mentioned: **Energy, CMS (Health), Department of Defense**
- Geographic focus: **Innovation centers inside Utah**

### Prizes

| Place | Prize |
|-------|-------|
| 1st | $5,000 |
| 2nd | $200 |
| 3rd | $50 |

### Submission & Logistics

- **Submit via:** Private message in the event Slack channel
- **What to submit:** Link + video
- **Judging:** 2 judges; sign up for a judging time slot via **Luma** (link posted in channel)
- **Presentation time:** 5–20 minutes
- **Register tomorrow** for your judging slot
