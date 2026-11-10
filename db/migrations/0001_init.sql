-- Initial schema: hackathons, users, participants, teams, memberships, requests, idempotency, audit.

CREATE TABLE hackathons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  min_team_size  int  NOT NULL CHECK (min_team_size >= 1),
  max_team_size  int  NOT NULL CHECK (max_team_size BETWEEN 1 AND 10),
  invite_ttl     interval NOT NULL DEFAULT interval '48 hours',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hackathons_sizes CHECK (max_team_size >= min_team_size)
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL CHECK (char_length(email) <= 254),
  password_hash   text NOT NULL,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  skills          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 12),
  timezone        text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email)),
  CONSTRAINT users_email_unique UNIQUE (email)
);
CREATE INDEX users_skills_gin ON users USING gin (skills);

CREATE TABLE participants (
  hackathon_id   uuid NOT NULL REFERENCES hackathons (id),
  user_id        uuid NOT NULL REFERENCES users (id),
  looking        boolean NOT NULL DEFAULT true,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hackathon_id, user_id)
);
CREATE INDEX participants_board ON participants (hackathon_id, registered_at DESC, user_id DESC)
  WHERE looking;

CREATE TABLE teams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id       uuid NOT NULL REFERENCES hackathons (id),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  leader_id          uuid NOT NULL REFERENCES users (id),
  member_count       int  NOT NULL DEFAULT 1,
  min_size           int  NOT NULL,
  max_size           int  NOT NULL,
  status             text NOT NULL DEFAULT 'forming',
  looking            boolean NOT NULL DEFAULT true,
  invite_code        text NOT NULL,
  invite_expires_at  timestamptz NOT NULL,
  version            bigint NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_id_hackathon UNIQUE (id, hackathon_id),
  CONSTRAINT teams_invite_code_unique UNIQUE (invite_code),
  CONSTRAINT teams_invite_code_format CHECK (invite_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  CONSTRAINT teams_status CHECK (status IN ('forming', 'finalized')),
  CONSTRAINT teams_sizes CHECK (min_size >= 1 AND max_size >= min_size),
  CONSTRAINT teams_cap CHECK (member_count BETWEEN 1 AND max_size),
  CONSTRAINT teams_min_when_finalized CHECK (status = 'forming' OR member_count >= min_size)
);
CREATE INDEX teams_board ON teams (hackathon_id, created_at DESC, id DESC)
  WHERE looking AND status = 'forming' AND member_count < max_size;

CREATE TABLE memberships (
  team_id       uuid NOT NULL,
  hackathon_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  joined_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT memberships_one_team_per_hackathon UNIQUE (hackathon_id, user_id),
  CONSTRAINT memberships_team_fk FOREIGN KEY (team_id, hackathon_id)
    REFERENCES teams (id, hackathon_id),
  CONSTRAINT memberships_participant_fk FOREIGN KEY (hackathon_id, user_id)
    REFERENCES participants (hackathon_id, user_id)
);

CREATE TABLE join_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL,
  hackathon_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  message       text CHECK (char_length(message) <= 280),
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid,
  CONSTRAINT join_requests_status CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'stale')),
  CONSTRAINT join_requests_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT join_requests_team_fk FOREIGN KEY (team_id, hackathon_id)
    REFERENCES teams (id, hackathon_id) ON DELETE CASCADE,
  CONSTRAINT join_requests_participant_fk FOREIGN KEY (hackathon_id, user_id)
    REFERENCES participants (hackathon_id, user_id)
);
CREATE UNIQUE INDEX join_requests_one_pending ON join_requests (team_id, user_id) WHERE status = 'pending';
CREATE INDEX join_requests_user_pending ON join_requests (user_id, hackathon_id) WHERE status = 'pending';

CREATE TABLE idempotency_keys (
  user_id          uuid NOT NULL,
  key              text NOT NULL CHECK (char_length(key) BETWEEN 16 AND 64),
  request_hash     text NOT NULL,
  response_status  int,
  response_body    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created ON idempotency_keys (created_at);

CREATE TABLE audit_events (
  seq           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hackathon_id  uuid NOT NULL,
  team_id       uuid,
  actor_id      uuid,
  action        text NOT NULL,
  request_id    text,
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_action CHECK (action IN (
    'team_created', 'team_updated', 'member_joined_via_code',
    'request_created', 'request_accepted', 'request_declined', 'request_withdrawn', 'request_stale',
    'member_removed', 'member_left', 'leader_promoted',
    'team_finalized', 'team_reopened', 'team_deleted', 'invite_regenerated',
    'member_profile_updated', 'participant_registered', 'participant_updated'))
);
CREATE INDEX audit_events_team ON audit_events (team_id, seq);
CREATE INDEX audit_events_hackathon ON audit_events (hackathon_id, seq);

-- Team summary used by the board, audit payloads and realtime events.
CREATE FUNCTION team_snapshot(p_team uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'hackathon_id', t.hackathon_id, 'name', t.name,
    'member_count', t.member_count, 'min_size', t.min_size, 'max_size', t.max_size,
    'status', t.status, 'looking', t.looking, 'leader_id', t.leader_id,
    'version', t.version, 'created_at', t.created_at,
    'skills', COALESCE((
      SELECT jsonb_agg(DISTINCT s ORDER BY s)
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      CROSS JOIN LATERAL unnest(u.skills) AS s
      WHERE m.team_id = t.id), '[]'::jsonb))
  FROM teams t
  WHERE t.id = p_team
$$;

-- Audit log is append-only.
CREATE FUNCTION audit_events_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();

-- Every audit insert publishes a realtime event; delivered only if the transaction commits.
CREATE FUNCTION audit_events_publish() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('team_events', json_build_object(
    'seq', NEW.seq, 'hackathon_id', NEW.hackathon_id, 'team_id', NEW.team_id,
    'action', NEW.action, 'payload', NEW.payload)::text);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_events_notify AFTER INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_publish();
