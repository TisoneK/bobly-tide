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
- **Status:** in-progress — backend §14 steps 1-3 + Flutter client (step 4) + member-journey hardening done (ADR-11: POST /packages/daily/join ties membership to the authed user; per-resource ownership on wallet/group routes; redacted group view; 55 tests green). Two new features (user request 2026-10-25) DONE: (1) KYC verification tiers (ADR-12) — requireVerified gates join + M-Pesa top-up/withdraw; (2) FCFS turn order + countdown (ADR-13) — POST /groups/:id/secure assigns turn_position in security-posting order, funds that position's hold, auto-activates when all secured; engine pays by turn_position; GET group returns yourTurnAt for the client countdown. Flutter client updated for both (verification screen, secure action, live countdown). Then a pilot screen-review pass (ADR-14, screen-review.md): flat full-24 security hold (supersedes ADR-13 position-based), wallet Available/Held + withdraw minimum, member display = first name (POST /auth/profile) + masked phone, fee on the payout receipt, Join-card cost disclosure + no-returns line, phone normalizer (07/01/7/+254) + sign-in consent, spec §5.2/§5.3 updated. 62 tests green, typecheck clean. Still open from §14 step 5: wire gates.conf, admin/ops role (incl. KYC review), Daraja sandbox verification + callback source validation, stall-timeout for unsecured groups, on-device app verification. Still open from §14 step 5: wire gates.conf, admin/ops role, Daraja sandbox verification + callback source validation, on-device app verification.
