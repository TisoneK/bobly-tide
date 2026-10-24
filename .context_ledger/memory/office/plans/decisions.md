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
