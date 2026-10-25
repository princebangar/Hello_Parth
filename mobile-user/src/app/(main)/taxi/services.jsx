// /taxi/services — the old template marketing page lived here; the web redirects to the real home "/".
import { Redirect } from 'expo-router';

export default function TaxiStaticRedirect() {
  return <Redirect href="/" />;
}
