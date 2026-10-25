// /food/user/help/orders/:orderId — open to guests
import Page from '@food/pages/user/help/OrderHelp';
import { publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(Page);
