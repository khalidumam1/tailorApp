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

## Design system

The mobile app and the web console share one visual language, so a shop owner
moving between them sees the same product. The system lives in four places:

| Layer | File | Responsibility |
| --- | --- | --- |
| Tokens | `src/theme/palette.tsx` | Every colour, radius, shadow and chart colour, derived from the configured brand. |
| Styles | `src/theme/styles.ts` | The single `StyleSheet` every screen reads through `useAppStyles()`. |
| Primitives | `src/theme/primitives.tsx` | Cards, KPI tiles, pills, rows, segmented controls, fields, buttons. |
| Charts | `src/components/Charts.tsx` | Sparkline, area, column, bar list and donut — pure `react-native-svg`. |

### Token rules

- **Ink ramp, not black.** Text uses `ink900`→`ink300`. Small text never drops
  below `ink500`, which keeps it legible in bright workshop light.
- **Brand ramps are computed.** `brand900`…`brand50` are mixed from the
  tenant's `primaryColor`, so chrome, charts and accents follow the brand
  without hand-tuning. In dark mode the ramp runs the other way: the brand
  colour is already the darkest usable value on a near-black surface, so lighter
  steps mix toward white and `brandSolidBg` (deep) carries white text.
- **Semantic tones ship in threes.** `okFg/okBg/okLine`, `warnFg/warnBg/warnLine`,
  `badFg/…`, `infoFg/…`, `violetFg/violetBg` so a pill, banner and dot always agree.
- **Radius scale.** 16 = card, 12 = control, 999 = pill.
- **Separation by hairline + spacing**, not grey fills. Cards are white with a
  1px `line` border and one of four elevation presets.

Screens should compose primitives and describe *what* they show; the system
decides how it looks. Adding a one-off colour inside a screen is a smell.

### Accessibility guardrails

- Body text meets 4.5:1 against its real composited background; large text
  (≥24px, or ≥18.66px bold) meets 3:1.
- Anything rendered on a brand-filled surface uses `heroFg`, `heroFgMuted` or
  `onBrandSolid` — never a raw brand colour.
- Layouts are checked at 360px and 390px width; headings stack their actions
  below the title rather than competing with it.

## Screenshots

`docs/screenshots-mobile/` holds the current UI at phone width (light and dark).
They are produced by exporting the app for web (`npx expo export --platform web`)
against the demo API in `tools/demo-api`, then driving it in headless Chromium
at 390×844 — the same review loop used for the web console. Regenerate them
after any visual change:

```sh
cd tools/demo-api && node server.mjs &        # http://127.0.0.1:5000/api/v1
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:5000 npx expo export --platform web
```
