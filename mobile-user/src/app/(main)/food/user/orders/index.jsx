// /food/user/orders — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/orders/Orders';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
