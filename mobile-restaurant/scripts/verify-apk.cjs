#!/usr/bin/env node
// Checks a release APK before it is handed out:
//   - it contains the JS bundle (assets/index.android.bundle);
//   - every arm64-v8a native library the native build produced is inside (an incremental build once dropped
//     libworklets.so and the app crashed at start);
//   - the signature verifies (apksigner) and is the Restaurant upload key, not the debug key.
//   node scripts/verify-apk.cjs [apk]
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'C:/Users/Prince/Android/Sdk';
const RESTAURANT_SHA1 = 'AF:1B:F4:AB:4A:CD:F0:77:8B:A6:30:9D:DF:23:AE:54:DC:F0:18:D9';

// entries of a zip (central directory), without unzip tools
function zipEntries(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i += 1) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function nativeLibsBuilt() {
  // what the native build merged for arm64 (all modules), wherever this AGP version keeps it
  const base = path.join(ROOT, 'android', 'app', 'build', 'intermediates');
  const found = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.so') && p.split(path.sep).includes('arm64-v8a')) found.add(f);
    }
  };
  walk(path.join(base, 'merged_native_libs'));
  return found;
}

// The list of a FULL native build, saved once (an incremental build cannot be trusted to list them all).
const SNAPSHOT = path.join(ROOT, 'android', 'native-libs-arm64.json');
function snapshotNativeLibs() {
  const libs = [...nativeLibsBuilt()].sort();
  if (libs.length) fs.writeFileSync(SNAPSHOT, JSON.stringify(libs, null, 2));
  return libs;
}
const expectedNativeLibs = () => (fs.existsSync(SNAPSHOT) ? new Set(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))) : nativeLibsBuilt());

function verifyApk(apk) {
  const entries = zipEntries(apk);
  if (!entries.includes('assets/index.android.bundle')) throw new Error('APK has no JS bundle (assets/index.android.bundle)');
  const inApk = new Set(entries.filter((e) => e.startsWith('lib/arm64-v8a/')).map((e) => e.split('/').pop()));
  const built = expectedNativeLibs();
  const lost = [...built].filter((so) => !inApk.has(so));
  if (lost.length) throw new Error(`APK is missing native libraries: ${lost.join(', ')}`);
  console.log(`arm64-v8a native libraries in the APK: ${inApk.size} (built: ${built.size || 'n/a'})`);

  const tools = fs.readdirSync(path.join(SDK, 'build-tools')).sort().reverse();
  const signer = path.join(SDK, 'build-tools', tools[0], process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const out =
    process.platform === 'win32'
      ? execSync(`"${signer}" verify --print-certs --verbose "${apk}"`, { encoding: 'utf8' })
      : execFileSync(signer, ['verify', '--print-certs', '--verbose', apk], { encoding: 'utf8' });
  if (!/Verifies/.test(out)) throw new Error(`apksigner: signature does not verify\n${out}`);
  const sha1 = (/certificate SHA-1 digest: ([0-9a-f]+)/i.exec(out) || [])[1] || '';
  const pretty = sha1.toUpperCase().match(/.{2}/g)?.join(':') || '?';
  if (pretty !== RESTAURANT_SHA1) throw new Error(`APK is signed with ${pretty}, not the Restaurant upload key ${RESTAURANT_SHA1}`);
  const schemes = out.split('\n').filter((l) => /Verified using v\d.*true/.test(l)).map((l) => l.trim());
  console.log(`signature OK (${schemes.join('; ')}), SHA-1 ${pretty}`);
  return true;
}

module.exports = { verifyApk, snapshotNativeLibs };

if (require.main === module) {
  const apk = process.argv[2] || path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  try {
    verifyApk(apk);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
