# Tailor Mobile

Standalone Expo/React Native application. This folder can be used as its own
repository root. It currently initializes encrypted SQLite tables and reports
network status. Although the backend provides tenant-scoped sync endpoints,
mobile sign-in, business workflows, and the outbox/retry/conflict-resolution
client are not implemented yet.

## Local development

```sh
npm ci
npm start
```

Use `npm run android` or `npm run ios` with the matching native toolchain.
For distributable Android builds, configure EAS and run:

```sh
npx eas-cli login
npx eas-cli project:init
npx eas-cli build --platform android --profile preview
```

The `EXPO_PUBLIC_API_BASE_URL` example documents the future API setting; the
current shell does not yet make API requests.

```sh
npm run typecheck
```
