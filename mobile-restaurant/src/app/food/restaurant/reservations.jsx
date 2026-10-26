// /food/restaurant/reservations
import { protectedRoute } from '@food/components/restaurant/restaurantRoutes';
import DiningReservations from '@food/pages/restaurant/DiningReservations';

export default protectedRoute(DiningReservations);
