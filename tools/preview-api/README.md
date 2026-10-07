# Preview API (UI review fixture)

Not part of the product. The real API is `backend/` (Express + Prisma + Postgres).

This stub exists because some sandboxes cannot reach `binaries.prisma.sh`, so
Prisma's query/schema engines can't be downloaded and the real API cannot boot
there. It serves the same routes and response envelopes as the real API, backed
by in-memory demo data, so the web UI can be reviewed end to end.

```bash
node tools/preview-api/server.mjs        # listens on :5000
npm run dev --workspace @tailor/web      # vite proxies /api -> :5000
```

Demo sign-in: `owner@rizwantailors.pk` / `WorkroomOwner2026!`

CORS is `Access-Control-Allow-Origin: *`, matching `CORS_ORIGINS=*` in the real
API. Through the Vite dev proxy the browser makes same-origin calls anyway, so
no preflight is needed; the wildcard covers direct calls to the API origin.

Covered: auth, dashboard, customers, orders (+ stage transitions), catalog,
measurements, payments (+ receipts), WhatsApp notifications, subscription.
Platform/super-admin routes are not stubbed.
