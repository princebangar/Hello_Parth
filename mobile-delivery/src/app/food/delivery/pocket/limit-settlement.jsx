// /food/delivery/pocket/limit-settlement
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { LimitSettlementV2 } from '@/modules/DeliveryV2/pages/pocket/LimitSettlementV2';

export default protectedRoute(LimitSettlementV2);
