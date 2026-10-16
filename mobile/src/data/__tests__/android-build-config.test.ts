import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// npm test runs from the mobile workspace directory.
const mobileRoot = process.cwd();
const read = (file: string) => readFileSync(path.join(mobileRoot, file), 'utf8');

test('native release APK optimizations match Expo prebuild settings', () => {
  const config = JSON.parse(read('app.json'));
  const [, { android }] = config.expo.plugins.find(
    (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  const properties = read('android/gradle.properties');
  for (const flag of ['enableMinifyInReleaseBuilds', 'enableShrinkResourcesInReleaseBuilds']) {
    assert.equal(android[flag], true);
    assert.match(properties, new RegExp(`^android\\.${flag}=true$`, 'm'));
  }
  assert.equal(android.useLegacyPackaging, true);
  assert.match(properties, /^expo\.useLegacyPackaging=true$/m);
  assert.deepEqual(android.buildArchs, ['arm64-v8a']);
  assert.match(properties, /^reactNativeArchitectures=arm64-v8a$/m);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /abiFilters "arm64-v8a"/);
  assert.match(gradle, /getDefaultProguardFile\("proguard-android-optimize.txt"\)/);
});

test('Expo plugins resolve from current mobile dependencies', () => {
  const config = JSON.parse(read('app.json'));
  const { dependencies } = JSON.parse(read('package.json'));
  for (const plugin of config.expo.plugins) {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    assert.ok(dependencies[name], `${name} must be a declared dependency`);
  }
});
