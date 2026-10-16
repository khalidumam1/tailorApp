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
- API-backed customers, orders, catalog, measurements, notifications and billing.
- PDF receipt generation and native sharing.

Workspace data requires connectivity; the app caches business configuration in
SecureStore. SQLite and WatermelonDB are not current app dependencies.

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

## Smaller APK for WhatsApp / direct installation

Do **not** share `app-debug.apk` as the normal distribution build. From the
repository root, first install dependencies and build the shared package:

```sh
npm ci
npm run build --workspace @tailor/shared
```

With Java and the Android SDK configured, run from `mobile/android`:

```powershell
.\gradlew.bat assembleRelease
```

On macOS/Linux use `./gradlew assembleRelease` instead. Share this file:

`mobile/android/app/build/outputs/apk/release/app-release.apk`

The release configuration enables R8 code optimization, resource shrinking and
compressed native libraries. It targets **ARM64 phones only**, matching the
existing app ABI filter; it will not install on 32-bit-only phones or x86
emulators. To test on another ABI, both the architecture property and the app's
`ndk.abiFilters` must be adjusted.

Compression reduces the APK transfer size, but Android extracts the libraries at
installation, so installed storage savings will not match download savings.
Measure the actual release artifact before quoting a size:

```powershell
(Get-Item app/build/outputs/apk/release/app-release.apk).Length / 1MB
```

The checked-in Android project and `expo-build-properties` settings both carry
the release optimizations. EAS `preview` also requests an APK release build:

```sh
npx eas-cli build --platform android --profile preview
```

### Signing and device verification

The existing local release build uses the **debug signing configuration**. This
is suitable only for internal testing, not a secure production release. Before
production distribution, configure a private release keystore (or managed EAS
credentials), store secrets outside Git, and back it up securely. Never send
keystores or signing passwords through chat. Keep the signing certificate the
same as the installed app to allow updates; a different certificate requires
uninstalling the old app and may erase local state.

Before sharing widely, install the release APK on an ARM64 device and check
sign-in, business configuration, customer/order screens, PDF receipt sharing,
notifications and app restart/session restore. R8-enabled builds need this
release-specific smoke test. The final APK size and device behavior cannot be
verified by TypeScript checks alone.
