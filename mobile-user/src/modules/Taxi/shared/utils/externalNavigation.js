// Web: handed the hosted checkout URL (PhonePe) from the WebView to the Flutter shell / Chrome so UPI apps could open.
// The app opens it with the system browser (Linking), where UPI intents work; PhonePe returns to the app through
// /phonepe/status (see phonePeResume.js). The diagnostic record is kept (sessionStorage + event) like the web.
import { Linking } from 'react-native';

export const convertToAndroidIntentUrl = (url) => {
  try {
    const hostAndPath = String(url || '').replace(/^https?:\/\//i, '');
    return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch (e) {
    return url;
  }
};

// The app is the native shell (the web's "inside the app" branch).
export const isEmbeddedCheckoutWebView = () => true;

export const isMobileOrWebView = () => true;

const recordCheckoutDiagnostic = (detail = {}) => {
  const payload = { ...detail, timestamp: new Date().toISOString(), userAgent: 'helloparth-native' };
  try {
    globalThis.sessionStorage?.setItem('lastExternalCheckoutDiagnostic', JSON.stringify(payload));
  } catch {}
  try {
    globalThis.dispatchEvent(new CustomEvent('external-checkout:diagnostic', { detail: payload }));
  } catch {}
};

export const openExternalCheckout = async (url) => {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) {
    recordCheckoutDiagnostic({ status: 'missing-url' });
    return false;
  }

  let targetHost = '';
  try {
    targetHost = new URL(targetUrl).host;
  } catch {}
  recordCheckoutDiagnostic({ status: 'starting', platform: 'android', runtime: 'native-app', targetHost });

  try {
    await Linking.openURL(targetUrl);
    recordCheckoutDiagnostic({ status: 'native-linking-open', mode: 'linking' });
    return true;
  } catch (error) {
    recordCheckoutDiagnostic({ status: 'native-linking-open-failed', mode: 'linking', message: error?.message || String(error) });
    return false;
  }
};
