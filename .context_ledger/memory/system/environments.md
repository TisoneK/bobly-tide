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

---
## DESKTOP-3LRR8MD — local Windows (last verified 2026-10-26)
- **Identify by:** hostname `DESKTOP-3LRR8MD`, `$env:USERNAME=Lameck` (git identity Tisone Kironget), workspace path `C:\Users\Lameck\Tisone\bobly-tide`
- **OS:** Windows 11 (10.0.26200), zone Africa/Nairobi (EAT); shell is PowerShell 7 (`pwsh`), plus Git for Windows 2.55.0
- **Runtimes:** node v24.20.0, npm 11.19.0, git 2.55.0.windows.5, Flutter 3.47.8 stable (installed this session at `C:\Users\Lameck\Tisone\Divers\flutter` — `Divers\` is the machine's dev-tools dir and is on PATH), JDK 21.0.12.1 LTS at `Divers\jdk-21` (`JAVA_HOME`, and `flutter config --jdk-dir` — Gradle rejects the user's JDK 27, which stays at `Divers\jdk-27.0.1.0.3`), Android SDK 36.0.0 at `Divers\android-sdk` (cmdline-tools latest, platform-tools, platforms;android-36, build-tools;36.0.0, all licences accepted), Python 3.11 (user PATH), PostgreSQL 18 (system service on 5432 + a project-local cluster at `Divers\pgdata` on 5433)
- **Package manager:** npm (`npm ci` from `backend/package-lock.json`); Flutter pub for `app/`
- **Verified commands:** from repo root with `C:\Program Files\Git\usr\bin` on PATH — `sh .context_ledger/core/bin/ledger-sync verify` (core OK 2.2.0), `.context_ledger/core/bin/ledger-guard.cmd install`, `.context_ledger/core/bin/ledger-gates.cmd run pre-commit`, `sh backend/scripts/gate.sh full` (111 tests, 17 files); in `backend/` — `npm ci`, `npm run -s typecheck`, `npm test` (111 pass), `npm run migrate` (6 migrations), `npm start` (API on :3000, smoke-tested: OTP → KYC submit → join → wallet); in `app/` — `flutter pub get` (smile_id 10.4.3), `flutter analyze` (clean), `flutter test` (8 pass), `flutter build web`, `flutter build windows --debug`, `flutter build apk --debug` (JDK 21), `flutter create --platforms=android,ios,web,windows .`, `flutter run -d windows` + the built exe
- **Local DB:** project cluster `Divers\pgdata` on 127.0.0.1:5433, trust auth, db `bobly`; start/stop and API launch via `Divers\bobly-dev.ps1 api|migrate|db-status|db-start|db-stop`. Backend `.env` is gitignored and not auto-loaded (no dotenv).
- **Quirks:** `sh`/`grep` are NOT on the stock PowerShell PATH — `gates.conf` calls `sh backend/scripts/gate.sh`, so prefix `C:\Program Files\Git\usr\bin` (appended to the user PATH on 2026-10-26; existing DSH processes need a restart to inherit it). `ledger-sync status` crashes on PowerShell 7 with "property 'Count' cannot be found" (strict mode, single-item error list) — non-fatal, use `verify` instead. HTTPS via git's schannel backend fails (`SEC_E_NO_CREDENTIALS`); `git config http.sslBackend openssl` fixes fetch/push for this clone. `git-credential-manager` is present at `C:\Program Files\Git\mingw64\bin`, credentials cached (push works unattended). The DSH sandbox (workspace-write) blocks `sh.exe` (MSYS signal pipes), npm lifecycle scripts (spawn EPERM) and Git's shell hooks — the 2026-10-26 session ran with `danger-full-access`, which is required for installs/commits on this box. Desktop is **1280x720 at 150% scaling (DPI 144)** — run GUI captures/sizing from a per-monitor-DPI-aware context (`SetThreadDpiAwarenessContext(-4)`) or the window is silently resized; the Flutter tool's VM service also needs a writable TMP (the app's first `flutter run` failed with `PathAccessException` on `%LOCALAPPDATA%\Temp`). Launching a GUI app as a plain child of a `pwsh` tool call hangs the call (the harness waits on descendants) — launch detached (WMI `Win32_Process Create`) and capture with `PrintWindow`.
