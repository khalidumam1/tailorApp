# Tailor Admin Web

Standalone React/Vite admin frontend. This folder can be used as its own
repository root and includes a local copy of the shared API validation
contracts.

## Local development

```sh
npm ci
Copy-Item .env.example .env
npm run dev
```

Set `API_BASE_URL` to the API origin. For a backend routed under `/backend`,
use the API host plus that prefix, for example
`https://api.example.com/backend`. The frontend appends `/api/v1`.
`VITE_API_BASE_URL` is accepted as a compatibility fallback. Rebuild after
changing the environment value.

## Vercel

When this folder is the repository root, select the Vite preset, use
`npm ci` as the install command, `npm run build` as the build command, and
`dist` as the output directory. Add `API_BASE_URL` in the Vercel project
environment settings. Set backend `CORS_ORIGINS` to the exact deployed site
origin, without a trailing slash.

```sh
npm run typecheck
npm run build
```
