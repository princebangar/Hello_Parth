// The web router's catch-all for the partner portal: an unknown address goes to the app start ("/"), which opens the
// signed-in partner's home or the login.
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/" />;
}
