// /food/user/dining/:diningType/:slug — open to guests
import Page from '@food/pages/user/dining/DiningRestaurantDetails';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page);
