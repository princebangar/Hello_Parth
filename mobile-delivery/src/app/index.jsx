// App start = the delivery partner app's entry /food/delivery (Feed; ProtectedRoute sends a signed-out rider to the login).
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/food/delivery" />;
}
