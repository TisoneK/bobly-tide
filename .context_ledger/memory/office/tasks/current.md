# Current Task (overwrite each session)

Holds exactly one task — the one being worked on right now. Set it at
session start (protocol Step 3), clear it at session end (Step 15). If
you find a stale in-progress entry here, a prior session died mid-task —
its roster row (if left behind) says who was here; check the session
entry and backlog before starting.

<!-- TEMPLATE — replace everything below this comment:
- **Session:** YYYY-MM-DD — <agent> / <model>
- **Task:** <what is being worked on right now>
- **Status:** in-progress | done | blocked (<blocker>)
-->

- **Session:** 2026-10-24 — Mara (S002) / claude-opus-4-8 (Claude Code)
- **Task:** Fill build/design spec gaps, then start the build. Added `bobly-tide-build-spec.md`; locked Flutter / closed-pilot Daily / deep sea blue (ADR-1..3) and backend = Node+TS+Postgres (ADR-4). Built the money ledger + hourly settlement engine skeleton in `backend/` (build spec §14 steps 1-2).
- **Status:** in-progress — backend §14 steps 1-3 + Flutter client (step 4) + member-journey hardening done (ADR-11: POST /packages/daily/join ties membership to the authed user; per-resource ownership on wallet/group routes; redacted group view; 55 tests green). Two new features (user request 2026-10-25): (1) KYC verification tiers — DONE on the backend (ADR-12): verification table + email-code flow + KycProvider interface; requireVerified gates join + M-Pesa top-up/withdraw; 61 tests green. (2) turn order by security-posting order (first-come-first-served) with a countdown to each member's turn — NEXT. Flutter client update for both features still to do. Still open from §14 step 5: wire gates.conf, admin/ops role, Daraja sandbox verification + callback source validation, on-device app verification.
