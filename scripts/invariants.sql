-- Invariant checker queries. Each block starts with "-- I<n>: <description>" and must return zero rows.

-- I1: member_count equals actual membership rows
SELECT t.id FROM teams t LEFT JOIN memberships m ON m.team_id = t.id
GROUP BY t.id HAVING count(m.user_id) <> max(t.member_count);

-- I2: every team has 1 to max_size members
SELECT id FROM teams WHERE member_count < 1 OR member_count > max_size;

-- I3: the leader is a member of the team
SELECT t.id FROM teams t
LEFT JOIN memberships m ON m.team_id = t.id AND m.user_id = t.leader_id
WHERE m.user_id IS NULL;

-- I4: at most one team per user per hackathon
SELECT hackathon_id, user_id FROM memberships GROUP BY 1, 2 HAVING count(*) > 1;

-- I5: a finalized team meets its minimum size
SELECT id FROM teams WHERE status = 'finalized' AND member_count < min_size;

-- I6: a membership's hackathon equals its team's
SELECT m.team_id, m.user_id FROM memberships m JOIN teams t ON t.id = m.team_id
WHERE t.hackathon_id <> m.hackathon_id;

-- I7: every membership has a creating audit event
SELECT m.team_id, m.user_id FROM memberships m
WHERE NOT EXISTS (
  SELECT 1 FROM audit_events a
  WHERE a.team_id = m.team_id
    AND a.action IN ('team_created', 'member_joined_via_code', 'request_accepted')
    AND (a.payload->>'user_id')::uuid = m.user_id);

-- I8: a join request is accepted at most once
SELECT payload->>'request_id' FROM audit_events WHERE action = 'request_accepted'
GROUP BY 1 HAVING count(*) > 1;

-- I9: no committed idempotency key without a response
SELECT user_id, key FROM idempotency_keys WHERE response_status IS NULL OR response_body IS NULL;
