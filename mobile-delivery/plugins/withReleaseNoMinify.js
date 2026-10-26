// Release builds without R8 code shrinking / obfuscation.
// The Expo template turns R8 on (android.enableMinifyInReleaseBuilds=true). With it the first release crashed at start:
// WorkManager's Room database (androidx.work.impl.WorkDatabase_Impl, loaded by reflection) was stripped/renamed —
// "Failed to create an instance of class androidx.work.impl.WorkDatabase". Other native libraries in the app (Firebase,
// maps, notifications, expo modules) also use reflection, so R8 stays off until every flow has been tested with it on.
// The Room keep rule is added anyway, for the day R8 is switched back on.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const RULES_MARK = '# helloparth: Room / WorkManager';
const RULES = `
${RULES_MARK} (WorkManager's database is created by reflection)
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
`;

const setProperty = (props, key, value) => {
  const item = props.find((p) => p.type === 'property' && p.key === key);
  if (item) item.value = value;
  else props.push({ type: 'property', key, value });
};

module.exports = function withReleaseNoMinify(config) {
  config = withGradleProperties(config, (cfg) => {
    setProperty(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'false');
    setProperty(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'false');
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes(RULES_MARK)) fs.writeFileSync(file, `${text.trimEnd()}\n${RULES}`);
      }
      return cfg;
    },
  ]);
};
