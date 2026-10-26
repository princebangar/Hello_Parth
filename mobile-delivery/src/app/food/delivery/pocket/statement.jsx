// /food/delivery/pocket/statement
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { PocketStatementV2 } from '@/modules/DeliveryV2/pages/pocket/PocketStatementV2';

export default protectedRoute(PocketStatementV2);
