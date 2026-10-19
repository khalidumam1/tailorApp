# Bizora — Decision Log

Decisions needed from the owner. Implementation phases start after approval of the
three-phase plan; individual decisions gate the tasks noted. `OPEN` = awaiting owner.

| ID | Decision | Options | Recommendation | Gates | Status |
| --- | --- | --- | --- | --- | --- |
| D-1 | Offline sync direction (F-004) | (a) Wire mobile outbox to existing sync API; (b) retire sync backend + model; (c) leave as-is | (b) now if shops have reliable connectivity, (a) if offline work is a selling point. (c) is not acceptable long-term. | Phase 2 task 2.3 | **RESOLVED 2026-10-19: retire sync (option b)** |
| D-2 | Permanent deletion policy (F-002) | Which entities may ever be hard-deleted (e.g. never-used businesses, test tenants, unused templates), retention period before delete is offered, confirmation style (type-name vs checkbox+count) | Archive-first everywhere; permanent delete only for entities with zero financial history, SUPER_ADMIN-only, after 30-day archive, with typed confirmation. Financial records: never. | Phase 1 task 1.3 | **RESOLVED 2026-10-19: archive-only, never permanent delete** |
| D-3 | Password-reset delivery (F-001) | (a) Transactional email provider; (b) admin-initiated reset only (owner/platform sets a temporary password); (c) both; (d) WhatsApp-delivered reset code (infrastructure partially exists) | (c) if an email provider exists, else (b)+(d). (b) alone is the minimum viable fix and needs no external service. | Phase 1 task 1.1 | **RESOLVED 2026-10-19: admin-initiated reset only (option b)** |
| D-4 | Employee scope (G-001) | Login-less worker records + wage tracking in scope? | Defer unless owners ask for it; current staff=system users covers access control. | Phase 2 task 2.6 | OPEN |
| D-5 | File uploads (G-002) | Add storage for payment proofs / expense receipts? Which storage (S3-compatible, local)? | Only with D-3/D-4 priorities settled; adds storage, scanning and retention obligations. | Phase 2 task 2.6 | OPEN |
| D-6 | Brand defaults (F-015) | Set "Bizora" as default brand name/title/app name (runtime branding already configurable)? | Yes — defaults should match the sold product name. | Phase 1 task 1.9 | OPEN |
| D-7 | Subscription enforcement default | Keep `enforcementEnabled` opt-in per platform setting, or on for new deployments? | Keep opt-in; flipping default affects existing tenants' access unexpectedly. | Phase 1 task 1.7 (test both modes) | OPEN |
| D-8 | Web refactor appetite (F-009) | (a) Code-split only (lazy views); (b) also split `main.tsx` into view modules incrementally | (a) in Phase 2; (b) opportunistically when a view is touched. No big-bang rewrite. | Phase 2 task 2.4 | OPEN |
| D-9 | User-guide languages | English only; English + Roman Urdu; + Urdu script (mobile already supports all three) | English + Roman Urdu side-by-side, matching the owner's requirement; reuse mobile i18n patterns. | Phase 3 tasks 3.1–3.2 | OPEN |
| D-10 | Database verification environment (S-001/S-002/S-004) | Rely on GitHub CI (Postgres service) as the DB evidence path, and/or provide a local/staging Postgres + staging deployment for rehearsal | CI as the always-on evidence; a staging rehearsal before release (Phase 3 task 3.5). This sandbox cannot download Prisma engines or run Postgres. | Phase 1 task 1.7, Phase 3 | OPEN |

## Resolved during audit (no owner input needed)

- Stack unchanged (Express/Prisma/React/Expo) — no compelling reason to replace; tenant
  isolation and money handling are already well-built on it.
- Screenshots in `docs/screenshots/` are stale vs current UI — Phase 3 recaptures; they are
  not used as evidence of current behaviour anywhere in this plan.
- `tools/demo-api` and `tools/preview-api` remain dev-only fixtures, never product code.

## Approval record

- 2026-10-19: Owner approved **Phase 1 only**; Phases 2–3 return for approval after the
  Phase 1 completion report. D-1 = retire sync (Phase 2). D-2 = archive-only.
  D-3 = admin-initiated password reset only. D-6 remains OPEN → task 1.9 parked.

## Phase 2 execution notes (2026-10-19)

- D-1 executed: sync backend retired (task 2.3). No client ever called it.
- D-8: followed the recorded default (a) code-split only. ERP/settings/chat are
  lazy chunks; the platform console remains in the entry chunk (502 kB) because
  extracting it from the single App component is the (b) incremental refactor.
  F-009's < 300 kB target therefore remains open under D-8.
- D-4/D-5 never approved → task 2.6 (G-001/G-002/G-004) skipped entirely, per plan.
- D-6 still open → Phase 1 task 1.9 (brand defaults) remains parked.

## Phase 3 execution notes (2026-10-19)

- D-9: followed the recorded default — English guide with a Roman Urdu summary
  on every page (mobile already ships full Urdu; the guide can add it later
  without restructuring). D-9 itself remains OPEN for owner confirmation.
- D-10: CI's Postgres service remained the DB evidence path (isolated `e2e`
  schema for browser tests; guarded `tailor` database for the DB suite). No
  staging environment was provided; a staging rehearsal is still recommended
  before production rollout, together with the device/emulator smoke test.
- New findings from E2E: F-018 (seed order-counter bug) fixed in Phase 3; the
  business-help audience mix-up was fixed the same day (see findings register).
