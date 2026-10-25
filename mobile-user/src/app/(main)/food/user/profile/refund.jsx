// /food/user/profile/refund — open to guests
import Page from '@food/pages/user/profile/Refund';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page, { fallback: 'page' });
