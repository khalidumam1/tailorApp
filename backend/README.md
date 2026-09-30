# Tailor API

Standalone Express API and PostgreSQL/Prisma project. This folder is a complete
repository root; it carries its own dependency lockfile and the shared Zod
contracts it needs.

## Local setup

```sh
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Set the real PostgreSQL URL, a unique 32+ character access-token secret, and
the exact browser frontend origins in `.env`. Never commit `.env`.

The API listens on `PORT` (default `5000`) and accepts both `/api/v1/...` and
`/backend/api/v1/...`. Health endpoints are `/api/v1/health` and
`/backend/api/v1/health`; readiness endpoints also verify database access.

## Docker / Shiper

This folder is a standalone backend project and can be deployed separately
without the web or mobile apps. If deploying from the existing monorepo, set
Shiper's **Root Directory** to `backend`. Shiper should then use this folder as
both the build context and project root, with `Dockerfile` as the Dockerfile
path. Do not use the monorepo-root Dockerfile for this setup. If this folder is
instead the root of its own Git repository, use `.` as its Root Directory.

Configure the service to listen on Shiper's assigned internal port (commonly
`3000`) and set `PORT` to that value if required. Add these service environment
variables in Shiper; do not put production values in the repository:

- `DATABASE_URL`: PostgreSQL connection URL reachable by the service.
- `ACCESS_TOKEN_SECRET`: unique random secret, at least 32 characters.
- `CORS_ORIGINS`: exact browser origins, comma-separated (for example,
  `https://tailorapp-omega.vercel.app`).
- `NODE_ENV`: `production`.

Set the health probe to `/backend/api/v1/ready`. The `/backend` path prefix is
supported by this API; it is separate from Shiper's **Root Directory** setting.

```sh
docker build -f backend/Dockerfile -t tailor-api .
docker build -f backend/Dockerfile --target migrate -t tailor-api-migrate .
```

Run the migration image once per release before routing traffic to a schema
change. Do not run demo seed data in production.

## Offline synchronization

The authenticated business API supports:

- `POST /backend/api/v1/sync/operations`: submit up to 50 operations with UUID
  client operation/entity IDs. Customer create/update, append-only measurement
  revisions, and order creation are supported. Operation IDs are unique per
  business; retries return their recorded result.
- `GET /backend/api/v1/sync/changes?cursor=...&limit=50`: fetch tenant-scoped
  customer, order, and measurement changes in stable, independently paginated
  streams. The opaque `nextCursor` should be persisted only after changes are
  committed locally.

Updates include a base version. Stale edits are recorded with `CONFLICT` and
the current server version instead of overwriting server data. Measurements
are appended as revisions, never overwritten. Each operation is transactionally
applied together with its sync receipt and audit event. The current Expo app
does not yet call these endpoints or provide conflict resolution; implement
client retries/backoff and explicit user resolution before relying on mobile
offline workflows.
After resolving a conflict, send the merged edit with a new
`clientOperationId`; reusing the conflicted ID intentionally replays the
original conflict result.

Example queued customer operation:

```json
{
  "operations": [{
    "clientOperationId": "9ab629c8-5424-40f9-a29d-c7f797563102",
    "entityType": "customer",
    "entityId": "c380ec0b-50a0-46cc-8d6e-38cc5930d529",
    "payload": {
      "action": "customer.create",
      "customer": { "name": "Example Customer", "phone": "03001234567" }
    }
  }]
}
```

All sync writes use the authenticated membership's tenant; clients cannot
choose a business ID. Payments are intentionally excluded from offline sync.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Database integration tests require a disposable migrated PostgreSQL database.
