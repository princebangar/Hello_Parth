// /food/delivery/pocket/cash-limit
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { CashLimitInfoV2 } from '@/modules/DeliveryV2/pages/pocket/CashLimitInfoV2';

export default protectedRoute(CashLimitInfoV2);
