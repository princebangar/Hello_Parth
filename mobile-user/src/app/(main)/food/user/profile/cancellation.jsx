// /food/user/profile/cancellation — open to guests
import Page from '@food/pages/user/profile/Cancellation';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page, { fallback: 'page' });
