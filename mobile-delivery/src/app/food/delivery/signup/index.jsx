// /food/delivery/signup — web: <AuthRedirect><Navigate to="/food/delivery/login" replace /></AuthRedirect>
import { redirectRoute } from '@/modules/DeliveryV2/routes';

export default redirectRoute('/food/delivery/login', 'auth');
