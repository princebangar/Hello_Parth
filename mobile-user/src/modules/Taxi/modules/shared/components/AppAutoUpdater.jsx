/**
 * The web checked index.html every minute (and on focus / pageshow) for a newer JavaScript bundle and reloaded the page
 * when one was published - except on the booking / checkout screens, where a reload would lose the flow.
 *
 * The app's code is the installed APK: there is no page to reload and no newer bundle on the site to switch to (new
 * versions come through the Play Store; over-the-air updates would need expo-updates, which is not installed). So this
 * watcher has nothing to do and renders nothing. Kept so the Taxi shell mounts it as on the web.
 */
const AppAutoUpdater = () => null;

export default AppAutoUpdater;
