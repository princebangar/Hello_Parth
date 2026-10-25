// /food/user/profile/privacy -> /user/privacy (web: <Navigate to="/user/privacy" replace />)
import { Redirect } from 'expo-router';

export default function LegacyRedirect() {
  return <Redirect href="/user/privacy" />;
}
