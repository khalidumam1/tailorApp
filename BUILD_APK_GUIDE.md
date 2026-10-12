# BUILD ANDROID APK - Quick Guide

## Option 1: EAS Build (Cloud) - RECOMMENDED ✅
**No Android SDK required! Builds in the cloud.**

```powershell
cd mobile
npx eas-cli build --platform android --profile preview
```

**Steps:**
1. You'll be asked to login to Expo
2. Create free account at https://expo.dev if needed
3. Build runs in cloud (~5-10 minutes)
4. Download APK link provided at end

## Option 2: Install Android SDK Locally
Only if you want to build locally without internet.

### Install Android Studio:
1. Download from https://developer.android.com/studio
2. Install with default settings
3. Open Android Studio → SDK Manager
4. Install Android SDK Platform 36 and Build Tools 36.0.0

### Set Environment Variable:
```powershell
# Add to System Environment Variables
ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
```

### Then build:
```powershell
cd mobile\android
.\gradlew.bat assembleDebug
```

APK will be at: `android\app\build\outputs\apk\debug\app-debug.apk`

## What I Fixed Today ✅
- Duplicate branding (web & mobile)
- TypeScript compilation errors
- All tests passing (50/50)
- Production web build working
- Mobile app code improvements

## Your APK Options Summary:

| Method | Pros | Cons | Time |
|--------|------|------|------|
| **EAS Build** | No SDK needed, reliable, signed | Needs Expo account | 5-10 min |
| **Local with SDK** | Offline builds | 8GB download, setup time | 30+ min setup |

**I RECOMMEND:** Use EAS Build (Option 1) - it's what Expo officially recommends and requires zero local SDK setup.
