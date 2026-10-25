// /food/user/cart/select-address — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/cart/SelectAddress';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
