-- Store idempotent responses as exact JSON text: jsonb reorders object keys, so a replay would not be
-- byte-identical to the original response (bug B-14).
ALTER TABLE idempotency_keys ALTER COLUMN response_body TYPE text USING response_body::text;
