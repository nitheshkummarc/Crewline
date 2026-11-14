# Crewline: design

The whole design on one page, for the Hack4Hack Problem Statement 1 submission. Every number here was measured; the details are in [load-report.md](load-report.md) and [verification.md](verification.md).

## What was built

A team formation service for a hackathon of 10,000 people. People sign up, create teams, join by invite code or by request, leave, and watch a live board of teams and people. The main promise: when many people try to take the last seat at once, exactly one gets it, and no retry, crash or overlap ever leaves the data wrong.

## Tools

Python with FastAPI for the server, PostgreSQL for the data, React with TypeScript for the web app, and k6 for load tests.

There is one server and one database. There is no Redis and no queue. A team has at most 10 seats, so letting the database handle the queue for each team is cheap, and with one database a single save can cover everything an action changes.

## The data

| What is stored | Rules the database enforces |
|---|---|
| Teams, with their size limits, member count, status and invite code | Member count is always between 1 and the team's maximum; a finalized team has at least its minimum |
| Memberships | One person is in at most one team per hackathon |
| Participants and whether they are looking for a team | |
| Join requests | At most one open request per person per team |
| Click keys and their saved answers | Each key is used once |
| A history log of every change | Entries are never changed or deleted |

Every rule is enforced by the database itself, not only by server code.

## How the last seat goes to one person

Checking for a free seat and taking it happen in one database instruction. When 50 requests arrive together, the database lets them through one at a time. The first takes the seat; the other 49 check again against the updated team, find it full, and are told so. The new member is added in the same save, so if anything fails the seat is given back too.

Every action locks things in one fixed order, so two actions can never wait on each other forever. One action, editing a profile, locks the person's registration first; that exception and why it is safe are written up in decision ADR-007.

**Proof.** A 50-person race for one seat runs 20 times on every code push, on PostgreSQL 16 and 18. A deliberately naive version fails the same test, which shows the test can catch a race. Ten consistency checks run after every test, load run and crash test and have never found a problem.

## Repeated clicks

Every action carries a unique key. The key is saved first, and the answer is saved with the change. If the same click comes again, even while the first is still running, it waits and gets the same answer back. Rejections are not saved, because nothing changed.

No "team full" check happens before the key is saved. An early version did that, and it told the person who won the seat that they had lost.

## Live updates

Every change writes a history entry in the same save. The database sends a notice only after the save succeeds, and the server passes it to every open browser. So a change that was undone is never shown.

- Each team update carries a version number, and browsers keep only the newest.
- Profile and "looking for a team" changes are live too.
- Join request updates go only to that team's members and the person asking.
- After a lost connection, the browser reloads the data instead of trying to replay missed updates.

## Speed

The board is served from a cache that lasts at most 1 second and is cleared on every change. Reads and writes use separate connections, so a rush of joins cannot slow the board. If the server is too busy, it answers "try again in a second" within 1 second instead of making anyone wait.

| Load test (100 users at once, 10,000 users, 2,000 teams) | 95 % of requests faster than |
|---|---|
| Board | 80 ms |
| Board plus 12 rushes of 50 people on one seat, plus live streams (one winner every time) | 92 ms |
| 10 minutes of steady use | 21 ms |

No action ever got stuck. On the free live host (a tenth of a CPU), 95 % of board loads took under 101 ms with people reading once a second.

## Guarantees, each shown by a test

- **All or nothing:** a failure at the last step of a join leaves no trace.
- **Overload:** a flood of requests gets "try again" within 2 seconds, never a hang or a crash, and retrying still gives exactly one winner.
- **Lost database connection:** the server answers "try again" and recovers by itself.
- **Limits:** people who send too many actions are told to slow down.

## See it in the app

The Race lab page runs these guarantees live on the real database: N people racing for the last seat, one person clicking Join many times, and a step-by-step trace of a real join with timings.

## Security

Passwords are hashed with argon2. Sessions use a cookie that page scripts cannot read. Only a team's leader can make leader changes, and that check happens inside the same database step. Invite codes are long enough that guessing one would take about 53 years at the allowed rate. Unknown and expired codes give the same answer. Live updates never contain invite codes or emails.

## Teammate suggestions

Suggestions favor people whose skills fill the team's gaps (60 %), whose time zone overlaps (30 %) and whose profile is complete (10 %), and count against skills the team already has. Each suggestion says why it was made.

## Trade-offs

| Choice | Cost |
|---|---|
| The team stores its own member count | Fast to check, but it must always match; a consistency check watches it |
| Every decision made after the key is saved | Correct retries, slightly more database work in a rush |
| Rejections are not saved | A retried rejection runs again |
| Rate limits kept per server process | Not shared between servers |
| No organizer screens; logout does not cancel a session early | Not built |

## Attacked and held

After the build, a separate test harness tried to break a frozen copy of the code ([adversarial-testing.md](adversarial-testing.md)):

- the last seat always had exactly one winner
- 19 pairs of overlapping actions, 30 times each, and 1,215 step-by-step orderings never left bad data or got stuck
- repeated clicks always got the same answer on 15 actions, even with a slowed-down database link
- killing the server 3 times and restarting the database under load lost nothing

## Bugs found and fixed

While building ([bug-diary.md](bug-diary.md)):

- A "team full" check before saving the key told the seat winner they had lost. All decisions now come after the key is saved.
- Saved answers came back with their fields in a different order. They are now saved exactly as sent.
- The first requests after a quiet spell were slow because database connections had to warm up. Connections now stay open.
- The live site trusted a header that users can fake, so per-person limits could be dodged. It now trusts only the host's own header.

By our own attack (each reproduced first, fixed at its cause, and given a test that fails on the old code). None of them broke the data; they broke speed, the live view or error answers:

- A profile edit at the same moment as a join showed old skills on the live board.
- A dead database connection made requests hang, and a lost one gave a server error instead of "try again".
- A retry of a successful join could be refused for sending too many requests.
- The hourly cleanup of old click keys could never finish once too many piled up.
- Breaking one safety check at a time in a copy of the code showed 5 that the tests did not notice. Each now has a test.

## With one more week

- Do the whole join in one database call instead of 7
- Share rate limits between servers
- A tool that rebuilds the data from the history log and compares
- Organizer screens: lock all teams, export a list
- Compare other locking approaches with real numbers
- Test how far the system scales past 400 users at once
