// Razorpay Checkout for the app, with the same API as the web's window.Razorpay:
//   const rzp = new Razorpay(options); rzp.on('payment.failed', fn); rzp.open();
//   options.handler(response) on success, options.modal.ondismiss() when closed.
// Razorpay's standard checkout has no Expo-compatible native SDK, so this one flow runs Razorpay's own checkout.js in a
// WebView (<PaymentHost /> in the root layout). UPI app intents (upi://, intent://) are handed to Android.
//
// openPaymentPage(url, { returnPrefixes }) is for the hosted pages (payment links, PhonePe): it shows the gateway page
// and resolves with the URL it returns to (e.g. https://helloparth.in/razorpay/status?...), so the caller can route it.
let host = null;
export const registerPaymentHost = (h) => {
  host = h;
};

export class Razorpay {
  constructor(options = {}) {
    this.options = options;
    this.handlers = {};
  }
  on(event, cb) {
    this.handlers[event] = cb;
    return this;
  }
  open() {
    if (!host) throw new Error('Payment screen is not ready');
    host.openCheckout(this);
  }
  close() {
    host?.close();
  }
}

export function openPaymentPage(url, { returnPrefixes = ['https://helloparth.in/razorpay/status', 'https://helloparth.in/phonepe/status'] } = {}) {
  return new Promise((resolve) => {
    if (!host) {
      resolve(null);
      return;
    }
    host.openPage(url, returnPrefixes, resolve);
  });
}

/** The web's loadRazorpayScript(): nothing to load in the app. */
export const loadRazorpayScript = () => Promise.resolve();
export const isRazorpayAvailable = () => Boolean(host);
