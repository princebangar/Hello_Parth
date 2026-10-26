// /food/restaurant/orders/:id
import { protectedRoute } from '@food/components/restaurant/restaurantRoutes';
import OrderDetails from '@food/pages/restaurant/OrderDetails';

export default protectedRoute(OrderDetails);
