-- List screens page orders and customers by (businessId, deletedAt) ordered by
-- createdAt. The existing indexes lead with businessId but cannot serve the
-- sort, so every list degrades into a scan + sort as data grows. Adding the
-- composite keeps cursor pagination on an index-only path. Safe to deploy
-- online: plain CREATE INDEX, no table rewrites beyond the index build.
CREATE INDEX "Order_businessId_deletedAt_createdAt_idx" ON "Order"("businessId", "deletedAt", "createdAt");
CREATE INDEX "Customer_businessId_deletedAt_createdAt_idx" ON "Customer"("businessId", "deletedAt", "createdAt");
