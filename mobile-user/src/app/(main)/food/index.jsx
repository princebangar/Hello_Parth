// /food -> /food/user (the web served the Food home on /food too; the app keeps one home URL).
import { Redirect } from 'expo-router';

export default function FoodIndex() {
  return <Redirect href="/food/user" />;
}
