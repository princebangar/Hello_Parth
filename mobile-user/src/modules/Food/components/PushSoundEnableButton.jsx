/**
 * The web asked desktop browsers for notification permission here (and turned on the FCM sound). On a phone - and the
 * app is always one - it did nothing and rendered nothing (its isMobileDevice() check), because the native shell owns
 * the push permission (src/lib/push.js). Same here.
 */
export default function PushSoundEnableButton() {
  return null;
}
