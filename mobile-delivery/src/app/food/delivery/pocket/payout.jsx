// /food/delivery/pocket/payout
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { PayoutV2 } from '@/modules/DeliveryV2/pages/pocket/PayoutV2';

export default protectedRoute(PayoutV2);
