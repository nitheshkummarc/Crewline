# Adversarial testing: what held, what broke, how it was found

After the project passed all its own tests, a separate attack campaign tried to break it on purpose.

- The attacks ran from a separate project against a frozen copy of the code, so the code could not be tweaked to pass them.
- Every bug below was first reproduced on that frozen copy, its cause was proven from logs or database records, and it got a new test in this project that fails on the old code.

## How the bugs were found

| Method | What it does | What it found |
|---|---|---|
| Overlapping pairs | Runs two actions on the same team or person at the same instant, 30 times each, through the real server | BRK-01, BRK-02 |
| Every ordering | Pauses each action before every database step and tries every way two actions can interleave (1,215 orderings). Any failure can be replayed exactly | BRK-01, BRK-02, with the exact ordering |
| Random mixes | 16 random actions of 12 kinds at once, checking everything after each round | BRK-01 again, without being told where to look |
| Repeated clicks | Retries, duplicate keys, changed requests, retries after hitting a limit, huge piles of old keys | BRK-03, BRK-04, BRK-05 |
| Database faults | Killing a database connection mid-action, blocking reads, restarting the database under load | BRK-06, BRK-07 |
| Network faults | A relay between the server and the database that slows, cuts or silently freezes the connection | BRK-10, BRK-06 again |
| Security probes | Forged and leftover sessions, other people's data, cross-site requests, odd characters, huge requests | BRK-08, BRK-09 |
| Random requests | 9,600 requests generated from the API description | BRK-03 again |
| Breaking the code on purpose | Breaks one safety check at a time in a copy of the code and checks whether this project's tests notice | 5 checks the tests missed |

After every run the harness checked that: the 10 consistency checks found nothing, the live board matched the database, every answer was an allowed one, nothing got stuck, and the server logged no crash.

## What held

- **Last seat:** exactly one winner in every run. No team ever went over its size.
- **Overlapping actions:** 19 pairs, such as join against leave, delete, finalize or a new invite code, and two leaders accepting the same person, 30 times each. All held and nothing got stuck.
- **Repeated clicks:** the same answer every time on 15 actions, even with every database message slowed by 15 ms.
- **Crashes:** the server was killed 3 times during 9,643 actions, and the database was restarted under load. Every saved answer came back unchanged and the data stayed correct.
- **Live updates:** 400 open streams, a browser that never reads, 400 reconnecting at once, and a killed database listener. Every stream got its updates or was told to reload.
- **Security:** forged and expired sessions were refused. No invite code or email leaked. Unknown and expired invite codes looked the same, even by response time.
- **Load:** about 1,000 board requests a second, 95 % under 141 ms, with no failures.

## What broke

The data never became wrong. The bugs were about the server staying available, the live board staying current, and errors being answered properly.

| ID | How bad | What broke | Fixed in |
|---|---|---|---|
| BRK-10 | High, but needs a rare network fault | A database connection that silently froze made requests hang until the server ran out of connections. Live updates stopped | B-34 |
| BRK-06 | Medium | A lost database connection during a request gave a server error instead of "try again" | B-35 |
| BRK-07 | Low | A read blocked for too long gave a server error | B-35 |
| BRK-01 | Medium | A profile edit at the same moment as the same person's join left old skills on the live board | B-36 |
| BRK-02 | Low | A profile edit at the same moment as the same person's leave updated the team they had just left | B-37 |
| BRK-03 | Low | Sending an empty value in a profile edit gave a server error | B-38 |
| BRK-08 | Low | A valid session for a deleted account gave a server error | B-40 |
| BRK-09 | Low | An invisible null character in any text gave a server error | B-39 |
| BRK-04 | Low | A retry of a successful action could be refused for too many requests | B-41 |
| BRK-05 | Low | The hourly cleanup of old click keys stopped working once too many piled up | B-42 |

All ten are fixed, each with a test. The bug numbers refer to rows in [bug-diary.md](bug-diary.md), which have the full cause and proof.

### BRK-10: a silently frozen database connection

- **Found by:** a relay stopped passing data on open connections without closing them. Requests got no answer for 25 seconds, then every request failed because every connection was stuck. The live stream never recovered.
- **Cause:** the server had no time limit of its own on database calls, and the database's time limit cannot help when the request never reaches it. The live listener's health check had no time limit either.
- **Fix:** every database call now gives up after 5 seconds, and the listener drops a silent connection after 5 seconds and reconnects, telling browsers to reload.

### BRK-06 and BRK-07: temporary database problems gave server errors

- **Found by:** killing a database connection while it waited gave a server error, although a retry then worked. A database restart under load gave 139 server errors. Blocked reads gave server errors.
- **Cause:** only a few kinds of timeout were treated as "busy". A lost connection shows up as a different error, with the real cause hidden underneath. Reads did not go through the code that turns timeouts into "try again".
- **Fix:** killed connections, restarts and lost network links now all count as "busy", including when hidden underneath another error, on reads and writes. The browser already retries "busy" with the same click key, so the person sees the result, not an error.

### BRK-01 and BRK-02: profile edit at the same moment as a join or leave

- **Found by:** overlapping pairs failed 27 of 30 and 16 of 30 times. The every-ordering tool then found the exact ordering: the profile edit pauses just before saving, the join runs and saves, then the profile edit saves. Random mixes found the same bug on their own.
- **Cause:** the two actions never waited for each other. Each read the other's data before it was saved, so the join's live update carried the old skills. Browsers only accept newer versions, so they kept showing old skills. In the leave case, the database rechecked only the team, not the membership, so the profile edit still touched a team the person had just left.
- **Fix:** the profile edit now locks the person's registration first, which a join also needs, so the two take turns. The team update is a separate step that sees the finished leave. This changes the lock order for this one action; decision ADR-007 explains why it cannot get stuck. 1,215 orderings and the race tests confirm it.

### BRK-03, BRK-08, BRK-09: inputs the database refused

- **Found by:** checking empty values, random requests, a valid session for a deleted account, and invisible null characters in text.
- **Cause:** the server let through values the database refuses. The resulting errors were not translated, so they came out as server errors.
- **Fix:** the server now refuses them first: empty values and null characters get "invalid input", and a session for a deleted account must sign in again.

### BRK-04: a retry was refused for too many requests

- **Found by:** saving a join, using up the request limit with other actions, then retrying the join.
- **Cause:** the limit was checked before looking up the saved answer.
- **Fix:** the saved answer is looked up first. A click that already succeeded always gets its answer back; new work is still limited.

### BRK-05: the cleanup of old click keys stopped working

- **Found by:** creating 300 thousand, 1 million and 2 million old keys and running the real cleanup. 300 thousand were deleted; 1 and 2 million timed out with nothing deleted.
- **Cause:** the cleanup had a 3 second limit. A cleanup that times out undoes itself completely, and the next hourly run faced an even bigger pile, so it could never catch up.
- **Fix:** the cleanup now has its own 5 minute limit. Deleting in small batches was measured and turned down, because it got slower as the pile grew.

## Gaps in this project's own tests

The harness broke one safety check at a time in a copy of the code and ran this project's tests. 16 of 21 breaks were caught; 5 were not. Each now has a test, and each test was confirmed to fail when its check is broken.

| Break | What it did | New test |
|---|---|---|
| M-A7 | The history entry for a removed member named the leader instead | T-API-22b |
| M-C3 | One click key could be reused across different teams | T-API-27b |
| M-C4 | A duplicate click ran the action again instead of returning the saved answer | T-RACE-21 |
| M-C5 | Click keys that were too short were accepted | T-API-28b |
| M-K3 | A join request could slip in while a join was taking the last seat | T-RACE-22 |

## Known gaps, not fixed in this round

| Item | Risk | Covered today by |
|---|---|---|
| The random-mix test is not in this project's test suite | Test gap | The harness's random mixes pass on the fixed code |
| The database-restart test is not in this project's test suite | Test gap | The harness's restart test passes on the fixed code |
| Per-address limits trust the host's address header | Hardening | Safe while the host sets that header itself |
| Team names made only of invisible characters are allowed | Hardening | None yet |
| A signup form token can be reused | Hardening | Signups are limited to 10 per hour per address |
| The metrics page is public | Operations | Documented in api.md |
| Opening a live stream uses a read connection | Low | 700 reconnects at once gave one "try again"; browsers retry |
