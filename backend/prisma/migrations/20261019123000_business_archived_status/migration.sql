-- Archive lifecycle for businesses (Phase 1, F-002/F-003): ARCHIVED is a
-- reversible, platform-controlled state. Archived businesses fail the existing
-- ACTIVE checks in login/refresh/authentication, so no session can use them;
-- all tenant data is retained and restoring is a status change back.
ALTER TYPE "BusinessStatus" ADD VALUE 'ARCHIVED';
