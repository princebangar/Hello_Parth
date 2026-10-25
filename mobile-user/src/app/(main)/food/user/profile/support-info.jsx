// /food/user/profile/support-info -> /user/support (web: <Navigate to="/user/support" replace />)
import { Redirect } from 'expo-router';

export default function LegacyRedirect() {
  return <Redirect href="/user/support" />;
}
