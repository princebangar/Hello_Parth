#!/usr/bin/env node
// Local signed release APK -> <repo>/releases/HelloParth-user-<version>.apk
//   npm run build:apk
//   npm run build:aab -> <repo>/releases/HelloParth-user-<version>-<versionCode>.aab (Play Store upload)
// Needs: Android SDK (ANDROID_HOME) with CMake 3.31.6 on Windows (see plugins/withShortCmakeObjectPaths.js), JDK 17,
// and the upload keystore properties in ~/.gradle/gradle.properties (see plugins/withReleaseSigning.js); without them
// Gradle signs with the debug key.
//
// Gradle runs with one worker and a small heap: the native C++ compile fails with random "cannot open file" errors
// when the PC runs out of memory (the build PC has ~6 GB). Set HP_GRADLE_WORKERS to use more on a bigger machine.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const app = require(path.join(ROOT, 'app.json')).expo;
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } });

// prebuild without --clean keeps Gradle's and CMake's caches, so a rebuild only redoes what changed
run('npx expo prebuild --platform android --no-install', ROOT);

const androidDir = path.join(ROOT, 'android');
const gradlew = process.platform === 'win32' ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
const workers = process.env.HP_GRADLE_WORKERS || '1';
// --aab builds the Play Store bundle instead of the APK (Play takes only .aab for app updates)
const aab = process.argv.includes('--aab');
run(
  `${gradlew} ${aab ? 'bundleRelease' : 'assembleRelease'} -PreactNativeArchitectures=armeabi-v7a,arm64-v8a --max-workers=${workers} --no-daemon ` +
    '-Dorg.gradle.parallel=false "-Dorg.gradle.jvmargs=-Xmx1280m -XX:MaxMetaspaceSize=384m" -Pkotlin.compiler.execution.strategy=in-process',
  androidDir,
);

if (aab) {
  const bundle = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  const outDir = path.resolve(ROOT, '..', 'releases');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `HelloParth-user-${app.version}-${app.android.versionCode}.aab`);
  fs.copyFileSync(bundle, out);
  console.log(`\nAAB: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
  process.exit(0);
}

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const outDir = path.resolve(ROOT, '..', 'releases');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `HelloParth-user-${app.version}.apk`);
fs.copyFileSync(apk, out);
console.log(`\nAPK: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
