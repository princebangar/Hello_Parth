// Windows: the native C++ builds (the app's codegen for gesture-handler, screens, svg ..., and libraries such as
// react-native-worklets) produce object file paths longer than 260 characters. The Android SDK's default CMake 3.22.1
// ships a ninja that cannot open such paths ("Filename longer than 260 characters"), even with Windows long paths on.
// On Windows every native module is built with a newer SDK CMake (default 3.31.6; override with HP_CMAKE_VERSION),
// by pointing `cmake.dir` in android/local.properties at it. macOS / Linux builds are left as they are.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withShortCmakeObjectPaths(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      if (process.platform !== 'win32') return cfg;
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.USERPROFILE || '', 'Android', 'Sdk');
      const cmakeDir = path.join(sdk, 'cmake', process.env.HP_CMAKE_VERSION || '3.31.6');
      if (!fs.existsSync(path.join(cmakeDir, 'bin', 'ninja.exe'))) {
        console.warn(`[withShortCmakeObjectPaths] ${cmakeDir} not found: install it with sdkmanager "cmake;3.31.6"`);
        return cfg;
      }
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('cmake.dir=')) : [];
      existing.push(`cmake.dir=${cmakeDir.replace(/\\/g, '/')}`);
      fs.writeFileSync(file, `${existing.join('\n')}\n`);
      return cfg;
    },
  ]);
};
