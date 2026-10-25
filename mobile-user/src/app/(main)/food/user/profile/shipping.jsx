// /food/user/profile/shipping — open to guests
import Page from '@food/pages/user/profile/Shipping';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page, { fallback: 'page' });
