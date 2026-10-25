// /food/user/profile/terms -> /user/terms (web: <Navigate to="/user/terms" replace />)
import { Redirect } from 'expo-router';

export default function LegacyRedirect() {
  return <Redirect href="/user/terms" />;
}
