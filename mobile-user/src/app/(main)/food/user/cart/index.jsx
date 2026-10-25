// /food/user/cart — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/cart/Cart';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
