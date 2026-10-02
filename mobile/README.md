# Tailor Mobile

Expo / React Native app for the TailorApp backend in this repository. The
production API base is configured in `src/api.ts` as
`https://tailorapp.on.shiper.app/backend`; users do not need to enter a server
address.

## Included workflows

- Business sign-in, business selection, secure refresh-token storage, and
  permission-filtered navigation.
- English, Urdu, and Urdu Roman interface language selection.
- Online-only subscription and manual-payment request screens; billing details
  and approved receipt references are shown, but pending submissions never
  activate a plan and payment requests are not queued offline.
- Device-safe top and bottom insets keep the shop header and tab bar clear of
  status and Android navigation bars on different screen sizes.
- WatermelonDB-backed SQLite local storage, visible online/offline and sync status, and
  a durable, idempotent outbox for customer, order, and measurement creation.
- Customer search, order creation, garment measurement templates/revisions,
  dashboard metrics, order status updates, and online-only payment posting.
- Payment attempts retain the same idempotency key and payment details after
  an uncertain network result. Payments are not queued while offline.
- All WatermelonDB mutations run inside database writers; interrupted outbox
  sends are retried with their original idempotency keys after restart.

Conflict records are retained and indicated for review; a full conflict
resolution screen, customer editing, customer-wide ledger, and receipt printing
remain future work. Order status changes and payments require connectivity.
WatermelonDB's native SQLite database is stored in Android's app-private storage
but is not SQLCipher-encrypted. The previous SQLCipher database is left intact;
when its secure key is available, existing offline records and queued operations
are copied into WatermelonDB on first launch.

The WatermelonDB Expo config plugin currently has a narrower tested Expo SDK
range than this app. Android JSI is disabled to reduce native startup risk; the
custom APK must be installed and launch-tested on a device before wider rollout.

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
