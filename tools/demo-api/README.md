# Demo API

A zero-dependency Node server that speaks the same HTTP contract as
`backend/src` so the web workspace can be **run, reviewed and screenshotted
without a PostgreSQL instance**. It is a development and design-review tool —
it is never imported by the product build, and `web/` does not depend on it.

Everything is in-memory: writes mutate the fixtures for the lifetime of the
process and disappear on restart.

## Run it

```sh
# terminal 1 — fixtures API on http://127.0.0.1:5000/api/v1
node tools/demo-api/server.mjs

# terminal 2 — web workspace on http://localhost:5173 (proxies /api → :5000)
npm run dev --workspace @tailor/web
```

Then sign in with **any password** and one of:

| Email | Lands in |
| --- | --- |
| `admin@vela.test` | Platform console (super admin, every platform grant) |
| `sana@stitch.test` | Business workspace (owner of *Stitch & Co. Tailors*, every business permission) |

The business account also exercises the scope-selection step of the login flow.

## What it covers

Auth (login, scope/business selection, refresh, logout), public and platform
branding, business configuration, customers, catalog, orders, measurements,
payments, receipts, notifications, business staff/roles, subscriptions, and the
full platform surface (businesses, templates + revisions, staff, permissions,
audit, health, billing dashboard, plans, payment review queue, billing settings,
reports CSV, PDF receipts).

Responses mirror the zod schemas in `web/src/api.ts` exactly — including
envelope shape (`{ data }`), UUIDs and `nextCursor` fields — because the client
validates every response.

## Caveats

* No real auth: any password is accepted and tokens are opaque strings.
* `GET .../report.csv` returns a small CSV; PDF receipts return a stub PDF.
* Adding a permission to `backend/src/permissions.ts` means adding it here too if
  you want to exercise the grant in the demo.
