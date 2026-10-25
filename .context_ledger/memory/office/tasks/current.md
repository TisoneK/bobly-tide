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
- **Status:** in-progress — engine + holds + Postgres + NestJS API + scheduler + M-Pesa Daraja done. Added src/mpesa/ (DarajaClient fake+http, MpesaStore, MpesaService): STK-push top-up credits on callback, B2C withdrawal reserves-then-finalises/refunds, all idempotent on the Daraja ref (callback-as-truth, ADR-8); replaced the dev top-up. 45 tests green (8 new M-Pesa), typecheck clean. Next: auth/OTP, then the Flutter client (build spec §14 step 4). Note: HttpDarajaClient needs sandbox verification; callback endpoints need source validation before prod.
