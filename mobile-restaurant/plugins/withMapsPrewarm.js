// Google Maps loads its SDK (a Play-services module + the renderer) on the main thread the first time a map is made:
// ~1.6 s on a Redmi 9, which froze the animated splash while the home screen built its map behind it. Starting that
// load in MainActivity.onCreate, right after super.onCreate, does it while the plain native splash is on screen and
// the JS bundle is still loading on its own thread, so the map is cheap when the home screen needs it.
const { withMainActivity } = require('expo/config-plugins');

const MARK = '// helloparth: maps prewarm';
// Called by reflection: the Maps SDK is a dependency of react-native-maps, not of the app module, so the app cannot
// reference its classes at compile time. initialize(Context) loads the SDK module (the slow part).
const CODE = `
    ${MARK}
    try {
      Class.forName("com.google.android.gms.maps.MapsInitializer")
        .getMethod("initialize", android.content.Context::class.java)
        .invoke(null, applicationContext)
    } catch (e: Throwable) { }`;

module.exports = function withMapsPrewarm(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt' || src.includes(MARK)) return cfg;
    src = src.replace(/(super\.onCreate\([^)]*\))/, `$1${CODE}`);
    cfg.modResults.contents = src;
    return cfg;
  });
};
