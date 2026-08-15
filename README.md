# FundPath

**Live site:** [fundpath.dev](https://fundpath.dev)

A government funding intelligence layer for startups. A founder describes their company in one box — FundPath translates that into government language, matches it against real federal and Utah state programs, ranks the fits, explains *why* in plain English, proves it with award history, and sequences it into an actual route with dates and tasks. When there's no honest federal match, it says so and hands back a real non-grant path instead of forcing a fake one.

Built in 24 hours for the **Startup State / AI Builder Day Hackathon — GOEO Challenge**, August 14, 2026.

> "I'm an AI healthcare startup in Utah with 15 employees, $1M ARR and a $2M R&D need. What government resources should I know about — and why?"

That's the question the challenge asked us to answer. Not a grant search engine — an intelligence layer.

---

## What it does

1. **Understand a startup** — a founder describes their company in natural language; Claude extracts industry, technology, location, employees, revenue, stage, capital raised, R&D activity, and funding ask.
2. **Discover opportunities** — matches against a live-synced corpus of Grants.gov opportunities, SBIR.gov awards/solicitations, SAM.gov Assistance Listings, USAspending award history, curated federal procurement pathways, and Utah state programs.
3. **Match & rank, deterministically** — a rules engine (not the LLM) decides eligibility and fit tier: 🟢 Likely Fit / 🟡 Potential — Verify / 🟠 Adjacent / 🔴 Probably Not a Fit. The LLM only writes the explanation prose; it never has authority over the tier.
4. **Explain every match** in four required sections: *Why you're a fit* · *What could make you ineligible* · *What you should verify* · *What to do next*.
5. **Show the history** — named comparable companies, total historical dollars, median award, and how many recipients are in Utah or in the same vertical, pulled from USAspending/SBIR.gov.
6. **Sequence a real route** — stops on a timeline (Phase I → Phase II → bridge funding), with "alongside" state programs running in parallel, and an honest verdict when a single award won't cover the ask ("your $2M ask is reachable, but not in one award").
7. **Know when to say no** — if nothing clears the bar, FundPath returns zero federal stops, a plain-language reason why, and real non-grant alternatives (SBA 7(a), Utah SSBCI, EDTIF, bridge loans) instead of hallucinating a match.

## Features

- **Your Route** — a vertical timeline of funding stops, each opening into a full playbook: money, dates, the four-section explanation, historical proof, a task checklist, and "who to call" (real Utah organizations, filtered to county/industry, with contact emails where available).
- **Application Starter Kit** — per stop: a deadline-aware registration timeline (SAM.gov UEI takes 10–15 business days — computed backwards from the real close date), a document checklist, and Claude-drafted narrative starters.
- **Filled SF-424** — a real federal grant application PDF, auto-populated from the founder's profile.
- **Federal procurement pathways** — GSA Schedule, DIU Commercial Solutions Opening, SBIR Phase III sole-source authority, and OTA prototype agreements, surfaced alongside R&D grants for companies that can sell to government directly.
- **Watch & notify** — Twilio SMS, Resend email digests, and an in-app inbox, all fired by the same real pipeline (daily corpus sync + deep-pass re-matching). A manual "send test notification" trigger in the account menu proves the pipeline end-to-end on demand.
- **Off-route, with reasons** — adjacent and ruled-out programs stay visible, collapsed, with the honest reasoning for why they didn't make the cut.

## Test cases

All five standard founder profiles run through the live pipeline end-to-end — nothing is precomputed:

| # | Profile | Result |
|---|---|---|
| 1 | AI healthcare SaaS, Utah, 15 employees | 🟢 NIH/NSF SBIR fit, historical proof, SBIR Phase III procurement path |
| 2 | Aerospace manufacturer, 35 employees, $2–5M ask | 🟢 Multi-stop stacked route (SBIR Phase I→II + STRATFI/TACFI), DIU CSO |
| 3 | Water/climate sensor startup, 10 employees | 🟢 EPA/NSF/DOE fits, adjacent WaterSMART/SRF flagged (needs municipal partner) |
| 4 | Cybersecurity startup, 22 employees | 🟡 DoD/NSF fits with a "needs a named government customer" flag, GSA Schedule |
| 5 | Consumer marketplace, 8 employees | 🔴 **The abstention test** — no federal grant match, honest non-grant route instead |

## Architecture

- **Frontend:** Angular 21 (standalone components) + Angular Material + Tailwind CSS
- **Backend:** Firebase Cloud Functions (TypeScript, Node 22)
- **AI:** Claude (Anthropic) — natural-language extraction and explanation prose only; every eligibility decision is a deterministic rule, not an LLM judgment
- **Data:** Firestore corpus, refreshed by a daily scheduled sync (`syncCorpus`) plus a manual trigger — Grants.gov Search2, SBIR.gov award CSV, SAM.gov Assistance Listings, USAspending v2, and curated Utah/federal-procurement program seeds
- **Notifications:** Twilio (SMS/WhatsApp), Resend (email), Firestore-backed in-app inbox
- **Auth:** Firebase Auth, anonymous-to-Google account linking

## Data & seeding

The Firestore `corpus` collection is the primary read path — every match runs against it in real time, nothing is precomputed per founder. It's populated by one idempotent ingest function per source (`functions/src/ingest/`), run by a daily scheduled sync plus a manual `triggerSync` callable:

- **Grants.gov Search2** — live opportunity sweep across funding categories (Science/Tech, Health, Environment, Education, etc.), no auth required.
- **SAM.gov Assistance Listings** — bulk extract, avoiding the 10-requests/day API key cap.
- **USAspending v2** — historical award/recipient data by NAICS, agency, and state.
- **SBIR.gov award CSV + solicitations API** — see the maintenance-outage note below.
- **Curated seeds** (`utah-programs.ts`, `federal-programs.ts`, `utah-resources.ts`) — hand-written, provenance-stamped records for programs that don't fit the live-API sources: Utah state programs (UTIF, SSBCI, EDTIF), the 213-organization Utah resource directory ("who to call"), agency-level SBIR/STTR programs, and the federal procurement pathways (GSA Schedule, DIU CSO, SBIR Phase III sole-source authority, OTA). Every curated record carries a `provenance` block — source URL, verification date, and a note explaining *why* it's curated rather than live-fetched (e.g. no award figure documented, or the live source was unavailable at seed time).

**Known issue — SBIR.gov maintenance outage:** `sbir.gov`'s award and solicitations API returned HTTP 403 for the entire ingest window during our build, and again during our final live verification pass right before demo prep — a documented, recurring problem with that API, not something specific to our requests. Rather than block on it, we treated the CSV bulk export as the source of truth per the original plan and additionally hand-curated the highest-value SBIR/STTR agency programs (NASA, DoD, AFWERX, SpaceWERX, DHS S&T, EPA, DOE, ED/IES) directly into `federal-programs.ts`, each with a provenance note flagging that sbir.gov was down at verification time and no dead links are shipped. This means the demo's SBIR coverage for the 5 test cases never depended on that API being up.

## Testing

Two layers, both run against the real pipeline — no test double stands in for the matching engine:

1. **Unit tests** (`yarn test` in `functions/`, Vitest) — 160+ tests over the deterministic core: eligibility rules, tiering, scoring, sequencing, stacking, abstention, message composition, SF-424 field mapping, and the registration-timeline math. This is where correctness of the *rules* is proven.
2. **Live 5-case harness** (`yarn dev:cases`, `functions/src/dev/run-cases.ts`) — runs all five standard founder profiles from the brief through the actual deployed pipeline against the live Firestore corpus: real extraction call, real retrieval, real eligibility/scoring/sequencing, real Claude explanation pass. It asserts against documented expected outcomes per case (`cases.expectations.ts`) and prints the full route — verdict, stops, tiers, flags, off-route reasoning, non-grant alternatives, Utah resources — for hand review. It also checks that the harness's case strings still match what the intake UI can actually submit, so it's never testing something a founder couldn't type.

Before demo day, every rendered claim (dollar figures, named companies, program titles) gets hand-checked against `docs/RESEARCH.md` §7 — the rule is that anything not confirmable in the corpus gets cut rather than shipped, since a single fabricated number in front of judges undoes the entire "we know when to say no" story.

## Docs

- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — challenge brief, judging rubric, 5 test cases, eligibility logic
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — deep API reference, endpoint schemas, Utah programs, competitive landscape

## Running locally

```bash
# Functions
cd functions && yarn install && yarn build && yarn test

# App
cd app && yarn install && yarn start   # ng serve

# Live 5-case harness against the real pipeline
cd functions && yarn dev:cases
```

Firebase secrets required: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TWILIO_*` (see `functions/src/ai`, `functions/src/shared/email.ts`, `functions/src/shared/twilio.ts`).
