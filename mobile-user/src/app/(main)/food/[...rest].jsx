// Legacy Food URLs. The web mounted the user routes under /food/* as well as /food/user/*, so /food/cart,
// /food/orders/:id, /food/restaurants/:slug ... opened the same screens: send them to /food/user/<same path>
// (query kept). Anything else under /food/user that matches no route (the web drew an empty Food layout there)
// and the partner panels (/food/restaurant, /food/delivery, /food/admin — not part of the user app) go to the
// Food home.
import { Redirect } from 'expo-router';
import { useLocation, useParams } from '@/lib/router';

const NOT_USER_APP = new Set(['user', 'restaurant', 'delivery', 'admin']);

export default function FoodLegacyRedirect() {
  const { rest } = useParams();
  const { search } = useLocation();
  const parts = String(rest || '')
    .split('/')
    .filter(Boolean);
  if (!parts.length || NOT_USER_APP.has(parts[0])) return <Redirect href="/food/user" />;
  const query = search && search !== '?' ? search : '';
  return <Redirect href={`/food/user/${parts.map(encodeURIComponent).join('/')}${query}`} />;
}
