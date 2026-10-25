// /food/user/food -> /food/user (web: <Navigate to="/food/user" replace />)
import { Redirect } from 'expo-router';

export default function LegacyRedirect() {
  return <Redirect href="/food/user" />;
}
