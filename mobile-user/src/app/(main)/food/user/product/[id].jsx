// /food/user/product/:id — open to guests
import Page from '@food/pages/user/ProductDetail';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page);
