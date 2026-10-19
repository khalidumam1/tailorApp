# Release checklist — Bizora (Phases 1–3)

Status legend: ✅ verified with evidence · ⏳ pending · ⛔ blocked/deferred with reason.
Final numbers are filled from the last green CI run on the release candidate commit.

## Code & CI gates
- [ ] CI green on the release commit (typechecks, lint, unit + DB suites, builds, bundle budget, audit, E2E) — record run id:
- [ ] `npm run build` passes for shared/api/web; mobile typecheck + tests pass.
- [ ] Web bundle: entry chunk ≤ 510,000 B budget (`tools/check-web-bundle.mjs`); lazy chunks for ERP, chat, team, structure editors, HelpGuide.
- [ ] Shared-contract drift check green (F-011); guide freshness check green (compiled guide matches `docs/user-guide/`).
- [ ] `npm audit` api/web/shared: 0 vulnerabilities. Mobile toolchain: see Known issues (F-014).

## Data safety
- [ ] Migrations rehearsed on the seeded CI database (fresh deploy into an empty schema, `prisma migrate deploy`) — same run as E2E.
- [ ] Backup/restore drill: `pg_dump` of the populated e2e schema restored into a throwaway database, row counts verified, duration recorded in the Phase 3 report.
- [ ] Rollback note per migration exists (Phase 1/2 reports); migrations are forward-only — rollback = restore from backup, never down-migrations against production data.
- [ ] No production database touched by any test: CI uses the throwaway `tailor` database (public + `e2e` schemas) only.

## Security
- [ ] Tenant isolation: backend DB suite negatives + E2E API negatives (anonymous 401; business token cannot open platform routes).
- [ ] Admin-only password reset (D-3) live in web + mobile; forced change on next sign-in.
- [ ] No secrets in repo, logs or screenshots; e2e accounts are CI-only throwaways.

## Product
- [ ] Guide coverage checklist complete (`docs/user-guide/coverage-checklist.md`); every nav item mapped; button names re-verified after UI renames.
- [ ] Screenshots: recaptured from a seeded demo tenant per `docs/screenshots/README.md` — ⛔ DEFERRED (needs a browser/device session; stale set retired, none fabricated).
- [ ] Mobile emulator smoke (incl. offline guide) — ⛔ DEFERRED (no emulator in this environment; guide content is bundled, so it works offline by construction; verify on device before rollout).

## Known issues accepted for release
- F-009 remainder: entry chunk 503 kB vs <300 kB aspiration; platform console still in the entry chunk (decision D-8 default a; extraction deferred, budget ratchet prevents regression).
- F-014: 15 high-severity advisories, all in the Expo/Metro **build toolchain** (braces, micromatch, metro, node-forge via @expo/code-signing-certificates). Suggested auto-fixes are breaking downgrades (Expo 44/RN 0.72) and `npm audit fix` fails with ERESOLVE in this monorepo. No advisory touches the shipped app runtime. Remediation: deliberate Expo SDK upgrade cycle with device testing; SDK 57 is the current line.
- D-9: guide is English + Roman Urdu summaries; full Urdu translation awaits owner confirmation.
- D-4/D-5/D-6/D-10: open owner decisions (see decision log); affected features remain as documented (G-001/G-002/G-004 skipped in Phase 2; task 1.9 brand defaults parked).

## Sign-off
- [ ] Phase completion reports filed: `phase-1-completion-report.md`, `phase-2-completion-report.md`, `phase-3-completion-report.md`.
- [ ] Owner sign-off recorded (PR comment/approval).
