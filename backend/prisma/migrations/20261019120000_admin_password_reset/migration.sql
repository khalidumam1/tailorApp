-- Admin-initiated password resets (Phase 1, F-001/F-017): after an admin sets a
-- new password, the user must choose their own at next sign-in. Existing rows
-- default to false, so no current user is forced into a change by this deploy.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
