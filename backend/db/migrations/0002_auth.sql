-- 0002_auth — phone + OTP authentication (build spec §8). One-time codes are
-- stored hashed (never in the clear) with a short expiry; app_user (from
-- 0001) is the account a verified phone maps to.

CREATE TABLE otp_code (
  id         UUID PRIMARY KEY,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed   BOOLEAN NOT NULL DEFAULT false,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX otp_code_phone_idx ON otp_code (phone);
