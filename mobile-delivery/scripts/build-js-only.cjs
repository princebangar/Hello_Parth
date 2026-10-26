#!/usr/bin/env node
// JS-only release rebuild (~5 min) after a full build (npm run build:apk) has compiled the native code once:
//   node scripts/build-js-only.cjs
// No prebuild. Before Gradle it deletes the outputs an incremental build once got wrong (it dropped libworklets.so and the
// app crashed at start); afterwards it checks that the APK still has every arm64 native library the native build made,
// verifies the signature with apksigner and copies the APK to <repo>/releases/HelloParth-Delivery-<version>.apk.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const androidDir = path.join(ROOT, 'android');
const app = require(path.join(ROOT, 'app.json')).expo;
const build = path.join(androidDir, 'app', 'build');

const { verifyApk, snapshotNativeLibs } = require(path.join(__dirname, 'verify-apk.cjs'));
// the native libraries of the last full build (kept in android/native-libs-arm64.json) are what the APK must contain
if (!fs.existsSync(path.join(androidDir, 'native-libs-arm64.json'))) snapshotNativeLibs();

for (const dir of [
  ['outputs', 'apk', 'release'],
  ['intermediates', 'incremental'],
  ['intermediates', 'merged_native_libs'],
  ['intermediates', 'stripped_native_libs'],
]) {
  fs.rmSync(path.join(build, ...dir), { recursive: true, force: true });
}

const gradlew = process.platform === 'win32' ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
execSync(
  `${gradlew} assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a --max-workers=1 --no-daemon ` +
    '-Dorg.gradle.parallel=false "-Dorg.gradle.jvmargs=-Xmx1280m -XX:MaxMetaspaceSize=384m" -Pkotlin.compiler.execution.strategy=in-process',
  { cwd: androidDir, stdio: 'inherit', env: { ...process.env, CI: '1' } },
);

const apk = path.join(build, 'outputs', 'apk', 'release', 'app-release.apk');
verifyApk(apk);

const outDir = path.resolve(ROOT, '..', 'releases');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `HelloParth-Delivery-${app.version}.apk`);
fs.copyFileSync(apk, out);
console.log(`\nAPK: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
