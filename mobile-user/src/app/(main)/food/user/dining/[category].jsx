// /food/user/dining/:category — open to guests
import Page from '@food/pages/user/DiningCategory';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page);
