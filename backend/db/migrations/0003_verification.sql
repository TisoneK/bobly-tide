-- 0003_verification — tiered KYC (build spec §6, §10; product spec §9 trust).
-- A member can sign in with a phone, but joining groups and moving money
-- require verified identity. Each verification item is a row; email is
-- self-service (a code), the rest are reviewed by a KYC provider.

CREATE TABLE verification (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES app_user(id),
  kind       TEXT NOT NULL,                 -- 'email' | 'id' | 'face' | 'address'
  status     TEXT NOT NULL DEFAULT 'unverified', -- unverified|pending|verified|rejected
  detail     TEXT,                          -- email address, document ref, or rejection reason
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, kind)
);
CREATE INDEX verification_user_idx ON verification (user_id);

-- Email confirmation codes (hashed, short-lived, single-use) — mirrors otp_code.
CREATE TABLE email_code (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES app_user(id),
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed   BOOLEAN NOT NULL DEFAULT false,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX email_code_user_idx ON email_code (user_id);
