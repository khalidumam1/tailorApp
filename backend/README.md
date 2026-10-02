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

## Central WhatsApp notifications

The API uses one platform-wide Meta WhatsApp Business Cloud API sender. Shops do
not configure or receive WhatsApp credentials. Configure the following only in
the backend's secret manager/environment; they are never sent to web or mobile:

- `WHATSAPP_ENABLED=true` enables the worker and webhook verification.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, and
  `WHATSAPP_VERIFY_TOKEN` are the Meta access token, registered sender ID, app
  secret for webhook signatures, and callback verification token.
- `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_PAYMENT_TEMPLATE`,
  `WHATSAPP_READY_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE`, and
  `META_GRAPH_API_VERSION` select the approved templates and API version.

Apply the database migration before enabling the worker. In Meta Business
Manager, verify the business, register/verify its sender number, grant the
system-user token the WhatsApp messaging permission, and approve the templates.
Configure the HTTPS webhook callback as
`https://<api-host>/backend/api/v1/webhooks/whatsapp`, enter the verify token,
and subscribe the WhatsApp Business Account to `messages` so delivery statuses
and inbound opt-outs are received.

The configured templates must match the following positional body parameters
and language. The order-created template takes order number, garments, total,
advance paid, outstanding, and promised date. Payment confirmation takes order
number, payment amount, total paid, remaining balance, and receipt reference.
Pickup-ready takes order number and ready date. Configure document headers on
the first two templates to receive the authoritative backend-generated PDF
receipt; the ready template is text-only.

The transactional outbox is written in the same database transaction as an
online order, payment, ready transition, or successfully applied offline order
sync. Workers only see committed queue records. Unique event idempotency keys
prevent duplicate queue rows on API/sync retries. Delivery retries use persisted
attempts and exponential backoff; Meta API acceptance is shown as **Sent**,
while **Delivered** and **Read** require a verified Meta webhook. Network
timeouts are inherently at-least-once because the Cloud API does not provide a
send idempotency key; a timeout after Meta accepts a message can therefore be
ambiguous until the status webhook arrives.

Customer numbers are stored as E.164 (Pakistan local inputs are normalized to
`+92`). Consent is opt-in and defaults off. Online authorized staff can record
or revoke consent at `POST /api/v1/customers/:id/whatsapp-consent`; inbound
`STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT` messages also opt the matching
number out across the platform. Opt-outs cancel queued messages. Notification
history is business-scoped at `GET /api/v1/notifications`; the web and mobile
workspaces show Queued, Sent, Delivered, Read, Failed, and Not Sent distinctly.
The authorized PDF endpoint is
`GET /api/v1/payments/:paymentId/receipt.pdf`.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Database integration tests require a disposable migrated PostgreSQL database.
