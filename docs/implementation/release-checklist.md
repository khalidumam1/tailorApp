# Release checklist — Bizora (Phases 1–3)

Status legend: ✅ verified with evidence · ⏳ pending · ⛔ blocked/deferred with reason.
Final numbers are filled from the last green CI run on the release candidate commit.

## Code & CI gates
- [x] CI green on the release commit (typechecks, lint, unit + DB suites, builds, bundle budget, audit, E2E) — runs **39233433526** and **39233848872** (PR #27 head; re-verify once more after the final docs commit)
- [x] `npm run build` passes for shared/api/web; mobile typecheck + tests pass (mobile 31/31, web Vitest 14/14 locally).
- [x] Web bundle: entry chunk **503,083 B** ≤ 510,000 B budget (`tools/check-web-bundle.mjs`); lazy chunks for ERP (68,501 B), chat, team, structure editors, HelpGuide (38,438 B).
- [x] Shared-contract drift check green (F-011); guide freshness check green (compiled guide matches `docs/user-guide/`).
- [x] `npm audit` api/web/shared: 0 vulnerabilities. Mobile toolchain: see Known issues (F-014).

## Data safety
- [x] Migrations rehearsed on the seeded CI database (fresh deploy into an empty `e2e` schema, `prisma migrate deploy`) — runs on every CI execution.
- [x] Backup/restore drill: `pg_dump` of the populated e2e schema restored into a throwaway database, user/order row counts asserted > 0, DB dropped; CI step ≈ 1 s (run 39233848872). Deleting/backing up anything outside CI's throwaway database: never done.
- [x] Rollback note per migration exists (Phase 1/2 reports); migrations are forward-only — rollback = restore from backup, never down-migrations against production data.
- [x] No production database touched by any test: CI uses the throwaway `tailor` database (public + `e2e` schemas) only.

## Security
- [x] Tenant isolation: backend DB suite negatives + E2E API negatives (anonymous 401 on customers/orders/platform/exports; business token cannot open platform routes).
- [x] Admin-only password reset (D-3) live in web + mobile; forced change on next sign-in.
- [x] No secrets in repo, logs or screenshots; e2e accounts are CI-only throwaways seeded into an isolated schema.

## Product
- [x] Guide coverage checklist complete (`docs/user-guide/coverage-checklist.md`); every nav item mapped; 114 button names verified verbatim (re-verify after any UI rename).
- [ ] Screenshots: recaptured from a seeded demo tenant per `docs/screenshots/README.md` — ⛔ DEFERRED (needs a browser/device session; stale set retired, none fabricated).
- [ ] Mobile emulator smoke (incl. offline guide) — ⛔ DEFERRED (no emulator in this environment; guide content is bundled, so it works offline by construction; verify on device before rollout).

## Known issues accepted for release
- F-009 remainder: entry chunk 503 kB vs <300 kB aspiration; platform console still in the entry chunk (decision D-8 default a; extraction deferred, budget ratchet prevents regression).
- F-014: 15 high-severity advisories, all in the Expo/Metro **build toolchain** (braces, micromatch, metro, node-forge via @expo/code-signing-certificates). Suggested auto-fixes are breaking downgrades (Expo 44/RN 0.72) and `npm audit fix` fails with ERESOLVE in this monorepo. No advisory touches the shipped app runtime. Remediation: deliberate Expo SDK upgrade cycle with device testing; SDK 57 is the current line.
- D-9: guide is English + Roman Urdu summaries; full Urdu translation awaits owner confirmation.
- D-4/D-5/D-6/D-10: open owner decisions (see decision log); affected features remain as documented (G-001/G-002/G-004 skipped in Phase 2; task 1.9 brand defaults parked).

## Sign-off
- [x] Phase completion reports filed: `phase-1-completion-report.md`, `phase-2-completion-report.md`, `phase-3-completion-report.md`.
- [ ] Owner sign-off recorded (PR comment/approval) — **pending: PR #27 awaits owner review/merge.**
