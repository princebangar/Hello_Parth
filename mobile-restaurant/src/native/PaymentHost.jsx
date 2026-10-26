// Full-screen payment WebView used by src/lib/razorpay.js. Mounted once in the root layout.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerPaymentHost } from '@/lib/razorpay';
import { RAZORPAY_LOGO } from '@/lib/razorpayLogo';
import { colors } from '@/theme';

const isAppIntent = (url = '') => !/^(https?|about|data|blob):/i.test(url);

// Function-valued options stay on this side; the rest goes to checkout.js.
const serializable = (options) => {
  const copy = JSON.parse(JSON.stringify(options || {}, (k, v) => (typeof v === 'function' ? undefined : v)));
  delete copy.handler;
  if (copy.modal) delete copy.modal.ondismiss;
  // the app's wordmark instead of the name: Razorpay showed an "H" circle and its own font (Prince, 26 Oct). The name
  // becomes a zero-width space: left out, Razorpay showed the merchant account's name instead.
  if (!copy.image) {
    copy.image = RAZORPAY_LOGO;
    copy.name = '\u200B';
  }
  return copy;
};

const checkoutHtml = (options) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body><script>
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  try {
    const o = ${JSON.stringify(options)};
    o.handler = (r) => post({ type: 'success', data: r });
    o.modal = Object.assign({}, o.modal, { ondismiss: () => post({ type: 'dismiss' }) });
    const rzp = new Razorpay(o);
    rzp.on('payment.failed', (r) => post({ type: 'failed', data: { error: r.error } }));
    rzp.open();
  } catch (e) { post({ type: 'error', data: String(e && e.message || e) }); }
</script></body></html>`;

export function PaymentHost() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState(null); // { kind: 'checkout', rzp } | { kind: 'page', url, prefixes, resolve }
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  useEffect(() => {
    registerPaymentHost({
      openCheckout: (rzp) => {
        setLoading(true);
        setSession({ kind: 'checkout', rzp });
      },
      openPage: (url, prefixes, resolve) => {
        setLoading(true);
        setSession({ kind: 'page', url, prefixes, resolve });
      },
      close: () => setSession(null),
    });
    return () => registerPaymentHost(null);
  }, []);

  const finishCheckout = (msg) => {
    const s = sessionRef.current;
    if (!s || s.kind !== 'checkout') return;
    const { rzp } = s;
    setSession(null);
    // after the modal is gone
    setTimeout(() => {
      if (msg.type === 'success') rzp.options.handler?.(msg.data);
      else if (msg.type === 'failed') {
        rzp.handlers['payment.failed']?.(msg.data);
        rzp.options.modal?.ondismiss?.();
      } else rzp.options.modal?.ondismiss?.();
    }, 50);
  };

  const closePage = (returnUrl = null) => {
    const s = sessionRef.current;
    setSession(null);
    if (s?.kind === 'page') s.resolve(returnUrl);
  };

  const onRequest = (req) => {
    const url = req.url || '';
    if (isAppIntent(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    const s = sessionRef.current;
    if (s?.kind === 'page' && s.prefixes.some((p) => url.startsWith(p))) {
      closePage(url);
      return false;
    }
    return true;
  };

  if (!session) return null;
  const isCheckout = session.kind === 'checkout';
  return (
    <Modal visible transparent={isCheckout} statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => (isCheckout ? finishCheckout({ type: 'dismiss' }) : closePage(null))}>
      {/* the checkout reaches the bottom edge (it left a gap above the navigation bar: Prince, 26 Oct) */}
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: isCheckout ? 0 : insets.bottom, backgroundColor: isCheckout ? 'rgba(0,0,0,0.6)' : colors.white }]}>
        <WebView
          style={styles.web}
          originWhitelist={['*']}
          source={isCheckout ? { html: checkoutHtml(serializable(session.rzp.options)), baseUrl: 'https://helloparth.in' } : { uri: session.url }}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={onRequest}
          onLoadEnd={() => setLoading(false)}
          onMessage={(e) => {
            try {
              finishCheckout(JSON.parse(e.nativeEvent.data));
            } catch {
              // not ours
            }
          }}
        />
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.white} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
  loader: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
