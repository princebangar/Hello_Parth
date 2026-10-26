// /food/restaurant/* — unknown address inside the restaurant app (the web router has no catch-all) -> /food/restaurant
import { redirectRoute } from '@food/components/restaurant/restaurantRoutes';

export default redirectRoute('/food/restaurant');
