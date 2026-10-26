// Any address outside the delivery app goes to its start (/food/delivery), like the delivery router's catch-all.
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/food/delivery" />;
}
