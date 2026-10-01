# Tailor Mobile

Expo / React Native app for the TailorApp backend in this repository. The
production API base is configured in `src/api.ts` as
`https://tailorapp.on.shiper.app/backend`; users do not need to enter a server
address.

## Included workflows

- Business sign-in, business selection, secure refresh-token storage, and
  permission-filtered navigation.
- English, Urdu, and Urdu Roman interface language selection.
- Encrypted SQLite local storage, visible online/offline and sync status, and
  a durable, idempotent outbox for customer, order, and measurement creation.
- Customer search, order creation, garment measurement templates/revisions,
  dashboard metrics, order status updates, and online-only payment posting.
- Payment attempts retain the same idempotency key and payment details after
  an uncertain network result. Payments are not queued while offline.

Conflict records are retained and indicated for review; a full conflict
resolution screen, customer editing, customer-wide ledger, and receipt printing
remain future work. Order status changes and payments require connectivity.

## Development and validation

From the repository root:

```sh
npm install
npm run typecheck --workspace @tailor/mobile
npm run start --workspace @tailor/mobile
```

For a local Android debug APK, configure the Android SDK and run from
`mobile/android`:

```powershell
.\gradlew.bat assembleDebug
```

The APK is written to `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
For internal distribution, configure EAS and use the preview profile.
