@echo off
REM Quick APK Build Script - Tailor Mobile App
REM This script guides you through building an APK

echo ========================================
echo  Tailor App - Android APK Builder
echo ========================================
echo.

cd /d "%~dp0mobile"

echo Checking prerequisites...
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: Cannot find mobile/package.json
    echo Please run this script from the project root.
    pause
    exit /b 1
)

echo Choose build method:
echo.
echo [1] EAS Cloud Build (RECOMMENDED - No SDK required)
echo [2] Local Build (Requires Android Studio/SDK)
echo [3] Export bundle only (for testing with Expo Go)
echo [0] Exit
echo.

set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" goto eas_build
if "%choice%"=="2" goto local_build  
if "%choice%"=="3" goto export_bundle
if "%choice%"=="0" exit /b 0

echo Invalid choice. Please run again.
pause
exit /b 1

:eas_build
echo.
echo Starting EAS Cloud Build...
echo You'll need an Expo account (free to create)
echo.
pause
npx --yes eas-cli@latest build --platform android --profile preview
goto end

:local_build
echo.
echo Checking for Android SDK...
if not defined ANDROID_HOME (
    echo.
    echo ERROR: ANDROID_HOME not set!
    echo.
    echo Please install Android Studio and set ANDROID_HOME environment variable:
    echo   ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
    echo.
    echo Then restart your terminal and run this script again.
    pause
    exit /b 1
)

echo Android SDK found at: %ANDROID_HOME%
echo.
echo Building APK...
cd android
call gradlew.bat assembleDebug

if errorlevel 1 (
    echo.
    echo Build failed! Check errors above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! APK built successfully
echo ========================================
echo.
echo Location: mobile\android\app\build\outputs\apk\debug\app-debug.apk
echo.
explorer /select,"app\build\outputs\apk\debug\app-debug.apk"
goto end

:export_bundle
echo.
echo Exporting Android bundle...
npx --yes expo export --platform android --output-dir dist-android
echo.
echo Bundle exported to: mobile\dist-android
echo (This can be used with Expo Go app, but is NOT an installable APK)
goto end

:end
echo.
echo Done!
pause
