// /food/delivery/pocket/deductions
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { DeductionStatementV2 } from '@/modules/DeliveryV2/pages/pocket/DeductionStatementV2';

export default protectedRoute(DeductionStatementV2);
