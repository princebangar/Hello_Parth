// Web: browser (service-worker) push via firebase/messaging, used only outside the app shell — inside the
// Flutter WebView the token came from nativeFcmBridge instead. The app is the native shell, so browser push does not
// exist here: device push is registered by installNativeFcmBridge (same POST /users/fcm-token call).
export const installBrowserFcmRegistration = () => {};
