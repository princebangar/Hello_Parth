// /food/user/orders/:orderId — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/orders/OrderTracking';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
