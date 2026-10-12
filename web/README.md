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

## Design system

`src/styles.css` is the single source of truth for the visual language; there is
no CSS framework and no runtime theme library.

* **Tokens first.** Every colour, radius, shadow and spacing step is a custom
  property on `:root`, with a `:root[data-theme="dark"]` override block. The
  brand hues are *derived* from `--configured-primary` / `--configured-accent`,
  which the app sets at runtime from Platform settings → Branding, so changing
  the brand colour restyles the entire product with no rebuild.
* **Structure:** 1. tokens → 2. typography → 3. buttons → 4. forms → 5. auth →
  6. business shell → 7. platform shell → 8. cards/panels → 9. metrics & charts
  → 10. tables → … → 16. responsive. Keep new rules in the matching section.
* **Rem sizing assumes a 16px root.** `body` sets 14px text; component sizes use
  rem so they stay predictable. Do not set `font-size` on `:root`.
* **Charts** live in `src/Charts.tsx` as dependency-free SVG components
  (`Sparkline`, `AreaChart`, `ColumnChart`, `DonutChart`, `BarList`, `HeatCell`).
  They inherit theme colours through CSS variables.
* **Screen layout** uses `.page-head` (title + description + actions) followed by
  card rows: `.split-2` / `.split-3` for chart rows, `.panel` for cards,
  `.table-wrap` for data tables.

### Accessibility guardrails

Body and secondary text sit at or above 4.5:1 contrast against their surface;
small muted text uses `--ink-500` (`#64748b`), never `--ink-400`. Interactive
elements keep a visible `:focus-visible` ring (`--ring`).

## Screenshots

`docs/screenshots/` holds reference captures of every screen in both themes,
taken at 1440×980 (plus one mobile capture). Regenerate them by running the app
against the demo API and capturing each route — see `tools/demo-api/README.md`.

## Vercel

Set the project's **Root Directory** to `web` and keep the Vite preset defaults:
`npm ci` as the install command, `npm run build` as the build command and `dist`
as the output directory. Add `API_BASE_URL` in the Vercel project environment
settings. Set backend `CORS_ORIGINS` to the exact deployed site origin, without
a trailing slash.

Inside the monorepo, npm resolves this workspace against the repository root, so
`npm ci` reads the root `package-lock.json` and installs every workspace. After
changing any dependency, refresh that lockfile from the repository root
(`npm install --package-lock-only`) — otherwise the Vercel install fails with
`npm error Missing: <package> from lock file` before the build starts.
`scripts/build-shared.mjs` compiles whichever `@tailor/shared` copy the workspace
resolves to, so the build also works on a fresh clone, where the generated
`dist` folders do not exist yet.

```sh
npm run typecheck
npm run build
```
