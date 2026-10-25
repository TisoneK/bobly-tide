-- 0005_kyc_job — async KYC vendor jobs (ADR-18).
-- A real KYC vendor (e.g. Smile ID) processes a submission asynchronously and
-- resolves it via a result callback. We record the vendor's job reference so
-- the callback can be matched back to the (user, kind) it verifies.

CREATE TABLE kyc_job (
  id           UUID PRIMARY KEY,
  provider_ref TEXT NOT NULL UNIQUE,          -- the vendor's job id (PartnerParams.job_id)
  user_id      UUID NOT NULL REFERENCES app_user(id),
  kind         TEXT NOT NULL,                 -- 'id' | 'face' | 'address'
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | resolved
  created_at   TIMESTAMPTZ NOT NULL,
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX kyc_job_user_idx ON kyc_job (user_id);
