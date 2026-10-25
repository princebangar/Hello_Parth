// /food/user/cart/checkout — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/cart/Checkout';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
