// /food/delivery/pocket/balance
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { PocketBalanceV2 } from '@/modules/DeliveryV2/pages/pocket/PocketBalanceV2';

export default protectedRoute(PocketBalanceV2);
