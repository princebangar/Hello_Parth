// Signs local release builds (./gradlew assembleRelease) with the upload keystore named in Gradle properties,
// so the generated android/ folder never has to be edited by hand. The keystore and passwords stay outside the repo:
//   ~/.gradle/gradle.properties
//     HELLOPARTH_DELIVERY_STORE_FILE=C:/Users/<you>/.helloparth/helloparth-delivery-upload.jks
//     HELLOPARTH_DELIVERY_KEY_ALIAS=helloparth-delivery
//     HELLOPARTH_DELIVERY_STORE_PASSWORD=...
//     HELLOPARTH_DELIVERY_KEY_PASSWORD=...
// Without those properties the release build falls back to the debug key (as the Expo template does).
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING_BLOCK = `
        release {
            if (project.hasProperty('HELLOPARTH_DELIVERY_STORE_FILE')) {
                storeFile file(HELLOPARTH_DELIVERY_STORE_FILE)
                storePassword HELLOPARTH_DELIVERY_STORE_PASSWORD
                keyAlias HELLOPARTH_DELIVERY_KEY_ALIAS
                keyPassword HELLOPARTH_DELIVERY_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('HELLOPARTH_DELIVERY_STORE_FILE')) {
      // add a release signing config next to the template's debug one
      gradle = gradle.replace(/signingConfigs\s*\{([\s\S]*?debug\s*\{[\s\S]*?\})/, (m) => `${m}${SIGNING_BLOCK}`);
      // and use it for release builds when the properties are present
      gradle = gradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
        `$1signingConfig project.hasProperty('HELLOPARTH_DELIVERY_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
