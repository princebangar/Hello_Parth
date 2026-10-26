// /food/restaurant/signup-email — listed as a restaurant auth path in modules/Food/routes.jsx, but RestaurantRouter has no page for it -> /food/restaurant/login
import { redirectRoute } from '@food/components/restaurant/restaurantRoutes';

export default redirectRoute('/food/restaurant/login');
