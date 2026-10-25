// /food/user/orders/:orderId/invoice — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/orders/OrderInvoice';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
