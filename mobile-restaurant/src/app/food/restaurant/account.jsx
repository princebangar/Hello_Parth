// /food/restaurant/account — web phone layout: <Navigate to="/food/restaurant" replace /> -> /food/restaurant
import { redirectRoute } from '@food/components/restaurant/restaurantRoutes';

export default redirectRoute('/food/restaurant', 'protected');
