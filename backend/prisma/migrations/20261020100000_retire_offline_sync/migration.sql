-- Retire the offline-sync backend (Phase 2 task 2.3, decision D-1, F-004).
-- No shipped web/mobile client ever called /api/v1/sync (verified by grep
-- across web/src and mobile/src); the routes are unmounted and deleted in the
-- same change. SyncOperation only ever stored replay receipts for that unused
-- API, so the table and its status enum are dropped. Rollback: redeploy the
-- previous release (which recreates nothing automatically) -- re-apply the
-- model from the prior schema and this table comes back empty; receipts for an
-- API with no clients carry no business data.
DROP TABLE "SyncOperation";
DROP TYPE "SyncOperationStatus";
