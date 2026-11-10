# Bug diary

Real bugs found while building, with how they were found, reproduced and fixed. Only real entries; nothing invented.
The best entries go into the design doc and the interview.

## Format

| ID | Date | Area | Symptom | How found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|---|

## Found in design review (before code)

These were found by reviewing the plan, not by running code. They have regression tests planned in verification.md section 10.

| ID | Date | Area | Symptom | How found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|---|
| B-1 | 2026-11-10 | idempotency | Retry of a winning last-seat join returns 409 | Plan review | "Team full" pre-check ran before the idempotency lookup | First fix (reorder pre-checks) was incomplete; superseded by B-7: all business decisions after the claim | T-RACE-11 |
| B-2 | 2026-11-10 | board cache | Client refetches after an event and gets the old page | Plan review | 1 s micro-cache served the pre-change page | Clear the hackathon's cache on every notification before fan-out; events carry the snapshot | T-API-35 |
| B-3 | 2026-11-10 | realtime | Live updates stop silently | Plan review | LISTEN connection drop not handled | Reconnect with backoff and send `resync` | Listener reconnect test |
| B-4 | 2026-11-10 | requests | Possible deadlock between a join and another leader's accept | Plan review | Cancelling other pending requests inside the join transaction | Lazy stale handling (ADR-014) | T-RACE-06 |
| B-5 | 2026-11-10 | schema | A membership could carry a different hackathon than its team | External review | No composite FK | Composite FK `(team_id, hackathon_id)` (ADR-009) | I6 |
| B-6 | 2026-11-10 | accept | Count incremented while the request was already decided | External review | Commit after a 0-row request update | Any rejection raises and rolls back (run_write) | T-RACE-07 |
| B-7 | 2026-11-10 | idempotency | A retry racing its original gets 409 although the original took the seat | Second external review | State-dependent pre-checks ran before the key claim | All business decisions after the claim; only a committed replay may answer early (ADR-013) | T-RACE-16 |
| B-8 | 2026-11-10 | requests | Pending request created for a team that just filled or finalized | Second external review | FK `KEY SHARE` does not conflict with seat updates | `FOR SHARE` on the team row before the insert | T-API-43, T-RACE-17 |
| B-9 | 2026-11-10 | realtime | People board and team skills stale after registration, `looking` or profile change | Second external review | Only team actions were audited and published; profile change did not bump team versions | Participant and profile events, version bump (ADR-034) | T-API-40, T-API-41 |
| B-10 | 2026-11-10 | privacy | Request events broadcast to the whole hackathon | Second external review | No audience on request events | Audience filter (ADR-035) | T-API-42 |
| B-11 | 2026-11-10 | web | Deleted team reappears from an in-flight fetch | Second external review | Deletion event had no version | Tombstone version | T-API-45, T-WEB-04 |
| B-12 | 2026-11-10 | suggestions | Time zone score undefined without a team | Second external review | Formula took a min over an empty set | Caller is a one-person group | T-API-44 |
| B-13 | 2026-11-10 | api contract | Validation errors would return 422, which the contract reserves for key mismatch | Second external review | FastAPI default handler | Custom handler returns 400 | T-API-29 |

## Found while building

| ID | Date | Area | Symptom | How found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|---|
