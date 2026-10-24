# Environments (update in place)

Machines and sandboxes agents have run on, and what it takes to work on
this project from each. One block per environment; update the matching
block (and its "last verified" date) every time you run on it again.

## Rules

1. **Match before you add.** At session start, check whether the machine
   you're on already has a block (use its "Identify by" line). Update the
   match; add a new block only for a genuinely new environment.
2. **Record what you verified, not what you assume.** A command belongs
   under "Verified commands" only after it ran successfully on this
   environment, this project.
3. **Agents never delete blocks.** An environment the project no longer
   uses may be pruned by the user; if you can't verify a block, leave it
   alone — its last-verified date already says how stale it is.
4. **Machine facts only.** Secret values go in `secrets/`; user
   preferences in `user/`; project-wide decisions in `plans/`.

<!-- TEMPLATE — one block per environment:
---
## <stable label — hostname, "Z sandbox", "GitHub Actions ubuntu-24.04"> (last verified YYYY-MM-DD)
- **Identify by:** <how an agent recognizes this env — hostname, $USER, workspace path>
- **OS:** <e.g., macOS 15.5 / Ubuntu 24.04 sandbox>
- **Runtimes:** <node X, python Y, ...>
- **Package manager:** <npm/bun/pnpm/pip/...>
- **Verified commands:** <install / test / lint / typecheck / dev-server commands that actually worked here, with cwd if it matters>
- **Quirks:** <e.g., "no psql installed", "port 3000 usually taken", "system Python locked down">
-->

---
## Baos-Mac-mini — local macOS (last verified 2026-10-24)
- **Identify by:** hostname `Baos-Mac-mini`, `$USER=bao`, workspace path `/Users/bao/Code/bobly-tide`
- **OS:** macOS 15.7.7 (Darwin 24.6.0)
- **Runtimes:** node v24.17.0, Python 3.9.6 (system), git 2.39.5 (Apple Git-154), gh 2.101.0
- **Package manager:** npm (bundled with node 24) — not yet exercised; no project package manager established (no application code yet)
- **Verified commands:** from repo root — `git`, `gh` (authenticated as `TisoneK`), `python3`, `sh .context_ledger/core/bin/ledger-sync verify` (→ core OK 2.2.0), `sh .context_ledger/core/bin/ledger-sync status`, `sh .context_ledger/core/bin/ledger-guard install`, `sh .context_ledger/core/bin/ledger-gates run pre-commit`
- **Quirks:** machine timezone is America/Los_Angeles (PDT), not the product's EAT; PowerShell not on PATH, so `ledger-sync` skips the `.ps1` parse check (harmless on this POSIX host); no application code yet — repo holds the product spec and the ledger only
