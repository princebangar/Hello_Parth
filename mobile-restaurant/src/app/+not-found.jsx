// Any address outside the restaurant app goes to its start (/food/restaurant).
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/food/restaurant" />;
}
