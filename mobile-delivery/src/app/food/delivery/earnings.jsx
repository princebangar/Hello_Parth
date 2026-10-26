// /food/delivery/earnings — web: <Navigate to="/food/delivery/pocket/details" replace /> (inside ProtectedRoute)
import { redirectRoute } from '@/modules/DeliveryV2/routes';

export default redirectRoute('/food/delivery/pocket/details', 'protected');
