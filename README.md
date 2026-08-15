# FundPath

Government funding opportunity finder for Utah startups. Translates startup language into matched federal programs (SBIR/STTR, grants, loans, procurement), ranks real fits, explains eligibility, and shows historical award data — with honest abstention when there's no good match.

Built for the Startup State / AI Builder Day Hackathon — GOEO Challenge, August 14, 2026.

## Stack

- **Frontend:** Angular 21+ (standalone components) + Tailwind CSS + Angular Material
- **Backend:** Firebase Cloud Functions (TypeScript)
- **AI:** Claude (Anthropic) for startup profile extraction and opportunity explanation
- **Data:** Grants.gov Search2, SAM.gov Assistance Listings, USAspending v2, SBIR.gov

## Docs

- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — challenge brief, judging rubric, 5 test cases, eligibility logic
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — deep API reference, endpoint schemas, Utah programs, competitive landscape
