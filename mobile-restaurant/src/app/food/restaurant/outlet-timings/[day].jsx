// /food/restaurant/outlet-timings/:day
import { protectedRoute } from '@food/components/restaurant/restaurantRoutes';
import DaySlots from '@food/pages/restaurant/DaySlots';

export default protectedRoute(DaySlots);
