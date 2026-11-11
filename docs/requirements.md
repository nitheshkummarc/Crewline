# Requirements and traceability

Source: Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1, "Race-proof team formation at scale"
(https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m). Requirements below are paraphrased.

## Challenge facts

| Item | Value |
|---|---|
| Roles | 2 remote Full-stack Engineer roles (paid internship or full time) |
| Preferred stack | React, Node.js (Express), MongoDB; other stacks accepted if defended |
| Round 1 deadline | Sunday 15 Nov 2026, 11:59 PM IST (late submissions not reviewed) |
| Shortlist | Top 5 per problem statement, 21 Nov 2026; top 50 get written feedback |
| Interviews | 23 to 26 Nov 2026, 45 min: walkthrough, small live change, role talk |
| Offers | By Monday 30 Nov 2026 |
| Rules | Individual, one submission, one problem statement; AI tools allowed but every line must be explainable; plagiarism disqualifies |
| Judging order | Concurrency correctness, then design decisions, then code quality, tests and UX |

## Deliverables

| ID | Deliverable | Where |
|---|---|---|
| D1 | GitHub repository | repo root, README |
| D2 | Live deployed URL | README, architecture.md 15 |
| D3 | Load test report | docs/load-report.md |
| D4 | One-page design doc: data model, race prevention, trade-offs, one more week | docs/design.md |
| D5 | Walkthrough video, up to 5 minutes | docs/plan.md (script) |

## Must-have requirements

| ID | Requirement | Design | Verification | Status |
|---|---|---|---|---|
| R1 | Team size min and max | arch 3, 6.9; ADR-010; `teams_cap`, `teams_min_when_finalized` | T-API-11, 13, 23, 24; I2, I5 | passing |
| R2 | One team per person per hackathon | `memberships_one_team_per_hackathon`, composite FK; ADR-009 | T-API-07; T-RACE-04, 06; I4, I6 | passing |
| R3 | Expiring invite codes | arch 6.2, 6.10; ADR-015 | T-API-09, 10, 25 | passing |
| R4 | Leadership handover when leader leaves | arch 6.7; ADR-011 | T-API-20; T-RACE-08; I3 | passing |
| R5 | Team deleted when last member leaves | arch 6.7; ADR-012 | T-API-21; T-RACE-09 | passing |
| R6 | 50 simultaneous attempts on the last seat give exactly one success, proven by an automated test | arch 6.2; ADR-005, 006, 007, 040 | T-RACE-01, 02, 03; T-LAB-01; E2E-10; I1, I2 | passing |
| R7 | Retried requests never create a second join or team | arch 5; ADR-013 | T-API-26, 27, 28; T-RACE-10, 11, 12, 16; T-GUAR-03, 04; T-CHAOS-01; T-LAB-02 | passing |
| R8 | Board and team pages update live (WebSockets or SSE), including the People board | arch 6.11, 9; ADR-017, 018, 034, 035 | T-API-35, 36, 40, 41, 42, 45; T-WEB-03, 04, 07, 10; E2E-03, 04, 09; manual M-04 | passing |
| R9 | Authentication | arch 10; ADR-016, 037 | T-API-01 to 04, 46, 47 | passing |
| R10 | Leader-only actions (accept, decline, remove) | arch 6.4, 6.5, 6.8 | T-API-15, 16, 22 | passing |
| R11 | Brute-force-resistant invite codes (rate limits, entropy) | arch 10; ADR-015, 032 | T-API-30; T-GUAR-02; T-UNIT-02, 07 | passing |
| R12 | Validate all inputs | backend rules; api.md; ADR-025 (400 handler), ADR-033 | T-API-29; T-UNIT-06; T-WEB-06 (same limits in the client) | passing |
| R13 | Audit log: who changed what and when, every team change | arch 4, 6, 6.11; ADR-019, 034 | T-API-06, 34, 37, 40; I7 | passing |
| R14 | Suggestions endpoint ranking by complementary skills and time zone, scoring explained | arch 11; ADR-023, 033 | T-API-33, 44; T-UNIT-01 | passing |
| R15 | At least 20 API tests including the race test, in GitHub Actions | verification.md; ci.yml | CI badge | passing (CI run 43063463873: 86 API and unit, 20 race and guarantee, 65 web, 20 end-to-end runs, k6 smoke) |
| R16 | Seed script: 10,000 users, 2,000 teams | database/seed.py | T-OPS-01; I1 to I9 on seed | passing (0.9 s, invariants clean) |
| R17 | Load test (k6 or autocannon): board p95 under 200 ms at 100 concurrent users | arch 8; ADR-021 | L-A | partial (probe: server p95 16 to 24 ms, 4-process client p95 114 ms; k6 run pending) |
| R18 | React UI for the full flow, usable on phone and keyboard only | arch 13; ADR-031, 038 | T-WEB-01 to 11; E2E-01 to 10 (360 px and 1280 px); M-01 to M-06 | passing (automated); manual keyboard and screen reader pass in module 9 |
| R19 | Live URL on a free tier | arch 15; ADR-026 | M-07 | planned |

## Bonus requirements

| ID | Bonus | Plan | Verification | Status |
|---|---|---|---|---|
| B1 | Optimistic UI with rollback on conflict | arch 13 | T-WEB-01, 02 | passing |
| B2 | Docker Compose | arch 16 | CI compose smoke | passing (CI run 43066048160: image built, migrations, seed, signup, register, create team 201, web app served) |
| B3 | Tracing or metrics | arch 12 (`/metrics`) | T-API-38 | passing |
| B4 | Chaos test: kill the server mid-join, no corruption | ADR-028 | T-CHAOS-01 | passing |

## Interpretations we state in the design doc

1. "Board" shows teams with open seats that are looking, and people who are looking and have no team.
2. A team of one (the creator) is valid while forming. Max size is fixed at event start; min size is enforced when the leader finalizes (confirmed 10 Nov 2026, ADR-010).
3. Everything is scoped by hackathon. A user can be in one team per hackathon.
4. First commit wins. There is no fairness queue.
5. Hackathons are created by seed or CLI; there is no organizer UI.
6. Join requests do not expire; stale requests are resolved when a leader acts.
7. Time zones are IANA names; working hours are assumed to be a 9-hour window for overlap scoring.
