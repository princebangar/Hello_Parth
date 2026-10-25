// /food/user/restaurants/:slug — open to guests
import Page from '@food/pages/user/restaurants/RestaurantDetails';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page);
