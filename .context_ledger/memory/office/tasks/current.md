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
- **Status:** in-progress — engine + holds + PostgreSQL persistence done. PgLedgerRepo (repo/pg.ts), migrations + runner (db/migrations, src/db/migrate.ts), and a load-run-persist unit of work (pg-settlement.ts, ADR-6) run the pure engine on a real DB. 28 tests green (5 pg integration tests on in-process pg-mem), typecheck clean. Next: NestJS API + M-Pesa Daraja + hourly scheduler (build spec §14 step 3).
