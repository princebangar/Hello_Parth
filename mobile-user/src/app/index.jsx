// App start. The installed app never showed the marketing landing page: like the web's native cold start
// (Frontend/src/index.jsx resolveNativeInitialRoute) someone who is not signed in starts at /login and a signed-in
// consumer gets the usual first screen (resolveAppColdStartRoute -> /taxi/user).
import { Redirect } from 'expo-router';
import { resolveAppColdStartRoute } from '@/shared/utils/activeModule';

export default function Index() {
  return <Redirect href={resolveAppColdStartRoute()} />;
}
