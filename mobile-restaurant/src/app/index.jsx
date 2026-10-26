// App start = the restaurant partner app's entry /food/restaurant (Orders; ProtectedRoute sends a signed-out
// restaurant to the login).
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/food/restaurant" />;
}
