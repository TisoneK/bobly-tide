# Agent Sessions (append-only within the current office)

One entry per agent session in the **current office**, newest at the bottom.
Never edit or delete past entries — append corrections instead. This is not
append-only *forever*: when the office reaches `office_size` sessions (or a
milestone), `ledger-history close` freezes this whole office verbatim into
`.context_ledger/history/office-<NNN>/` (roster, registry, notes, logs —
nothing trimmed), writes the permanent accomplishments record
`.context_ledger/history/office-<NNN>.md`, and opens a fresh empty office
here. Closed offices in `history/` and `archive/` are never read at session
start. Before closing, note which open threads still matter — they are
re-seeded into the new office explicitly, and nothing else carries over.

<!-- TEMPLATE — copy below the last entry and FILL IN every placeholder:
---
## YYYY-MM-DD — Session N
- **Agent:** <name> | **Model:** <model id> | **Platform:** <machine/sandbox + OS> | **Role:** <engineer, or overlay from .context_ledger/core/roles/> | **Core:** <version from .context_ledger/core/VERSION>
- **Task:** <what this session set out to do>
- **Commits:** <count> (<first-sha>..<last-sha>)
- **Outcome:** <done / partial / blocked — one line>
- **Open items:** <pointers into tasks/backlog.md (actionable) or tasks/parking-lot.md (findings/questions), or "none">
- **Notes:** .context_ledger/memory/office/sessions/<date>-<N>/notes.md  (or "none")
- **Report:** .context_ledger/memory/office/reviews/YYYY-MM-DD-review.md
-->

---
## 2026-10-24 — Session 1
- **Agent:** Imani | **Model:** claude-opus-4-8 | **Platform:** Baos-Mac-mini (local macOS 15.7.7) | **Role:** engineer | **Core:** 2.2.0
- **Task:** Bootstrap follow-up — run the first ledger session and fill the initial project memory (user, preferences, workflows/active.md, system, tasks/current.md, this log)
- **Commits:** check-in → STATE → settings → memory fill → clock-out (see `git log`, all `chore(ledger):` this session)
- **Outcome:** done — memory initialized; `ledger-sync verify` green at core 2.2.0; guard hooks installed
- **Open items:** product build not started — scope lives in `bobly-tide-spec.md` (see §13 Launch plan); no entries queued in `tasks/backlog.md` yet
- **Notes:** none
- **Report:** none (setup session; summary delivered in chat)
