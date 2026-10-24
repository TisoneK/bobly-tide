# Architectural Decisions (append-only, ADR-style)

Decisions already made — future agents respect these rather than
relitigating them. To reverse one, append a new ADR that supersedes it.

<!-- TEMPLATE — copy below the last entry:
---
## ADR-N: <short title> (YYYY-MM-DD)
- **Status:** accepted | superseded by ADR-M
- **Context:** <what forced the decision>
- **Decision:** <what was decided>
- **Consequences:** <trade-offs accepted; what future agents must respect>
-->

---
## ADR-1: Client platform is Flutter (2026-10-24)
- **Status:** accepted
- **Context:** The product is mobile-first for Kenya (M-Pesa, Android-dominant). A client platform had to be fixed before any build work.
- **Decision:** Build the member app in Flutter (Dart), one codebase for Android + iOS. Android is the pilot priority.
- **Consequences:** Backend stays a separate service (not locked — see build spec §13-D1). Flutter state management proposed as Riverpod (D3). Future agents target Flutter; do not introduce a second client framework without a superseding ADR.

---
## ADR-2: MVP is the closed-pilot slice — Daily package only (2026-10-24)
- **Status:** accepted
- **Context:** The product spec defines five packages and a four-phase launch. Building all of it before proving the hourly mechanic is wasteful and risky with real money.
- **Decision:** v1 = Launch Phase 1 only: the Daily (24-member) package, 3–5 invited groups, with wallet, M-Pesa top-up/withdraw, the hourly engine, fixed turn order, security hold, and defaults. All other packages and growth surfaces are deferred.
- **Consequences:** Build and tests focus on one package type; the data model still generalises to N-member packages so later packages need no rewrite. Scope creep past the pilot slice is rejected until the pilot proves the mechanic.

---
## ADR-3: Brand primary color is deep sea blue (2026-10-24)
- **Status:** accepted
- **Context:** The product spec's Brand section (§11) defined voice and name but no visual identity; a primary color was needed to start design.
- **Decision:** Primary = deep sea blue (`#0B3D62`), with `tide #19B5C9` secondary and `payout #F5A623` warm accent proposed (build spec §9, open as D4–D5).
- **Consequences:** The app and brand lead with deep sea blue; it must stay distinct from typical bank blues (trust is the product) and meet WCAG AA. Full token set lives in the build spec §9.

---
## ADR-4: Backend is Node + TypeScript + PostgreSQL (2026-10-24)
- **Status:** accepted
- **Context:** Build spec §13-D1 left the backend language open (Dart / Node-NestJS / Python-FastAPI). The user locked the §13 defaults and asked to start the build, so one had to be chosen. The money ledger and hourly settlement need exact decimal math, serialisable transactions, and a reliable job runner — all three languages qualify; the deciding signal was the local toolchain (modern Node v24.17.0 present; system Python only 3.9.6).
- **Decision:** Backend in Node + TypeScript with PostgreSQL. The pilot skeleton is framework-light (pure domain engine + tests) with `decimal.js` for exact money; NestJS is added at the HTTP/API-layer step, not before. The remaining §13 defaults (D2 hosting TBD, D3 Riverpod, D4 fonts, D5 accent colors, D6 SMS provider, D7 ops console read-mostly, D8 business placeholders) are locked as proposed.
- **Consequences:** Money columns use exact decimal (`NUMERIC(14,4)` in Postgres, `decimal.js` in code) — never floats. The hourly tick is server-authoritative and idempotent per `(group, hour)`. Future agents build on TypeScript + Postgres; a different backend language needs a superseding ADR.

---
## ADR-5: Security-hold model (2026-10-24)
- **Status:** accepted
- **Context:** Product spec §8 requires a security hold that covers the contributions a member still owes, sized so early turn positions hold more than late ones, drawn on shortfall and released as the cycle runs. An exact sizing formula and a ledger representation had to be chosen.
- **Decision:** Hold for turn position p = `(N − p) × contribution` — the post-payout exposure (contributions owed for the hours after a member collects). The hold is a separate per-member internal account (`hold:<membershipId>`), funded by moving money out of the spendable wallet at group start; a wallet balance therefore stays "spendable money" and the hold account is "locked collateral", and the two sum to the member's total. On a wallet shortfall the engine unlocks the gap from the hold (a `hold_release` pair) before the `hourly_debit`, so pots stay whole and money is conserved. Leftover collateral is returned at cycle end / on default; a defaulted member's unreceived turn is forfeited automatically because the engine only pays the current active holder of a position.
- **Consequences:** Incremental per-hour release of collateral is deliberately NOT implemented — final balances are already correct (draw-on-shortfall + end-of-cycle release), so it is only a mid-cycle wallet/hold split nicety, logged as a later refinement. Grace-period timing and SMS warnings (§8.2) belong to the scheduler/notifications layer, not the engine. Postgres `UNIQUE(group_id, join_order)` means a real replacement relinks/reuses the vacated row rather than inserting a duplicate position (the in-memory fixture allows the duplicate). Future agents keep the sizing formula and the separate-hold-account model unless a superseding ADR changes them.
