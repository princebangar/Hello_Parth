// /food/user/orders/:orderId/details — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/orders/UserOrderDetails';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
