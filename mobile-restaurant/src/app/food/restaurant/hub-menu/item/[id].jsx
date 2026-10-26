// /food/restaurant/hub-menu/item/:id
import { protectedRoute } from '@food/components/restaurant/restaurantRoutes';
import ItemDetailsPage from '@food/pages/restaurant/ItemDetailsPage';

export default protectedRoute(ItemDetailsPage);
