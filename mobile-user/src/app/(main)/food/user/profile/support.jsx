// /food/user/profile/support — open to guests
import Page from '@food/pages/user/profile/Support';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page, { fallback: 'page' });
