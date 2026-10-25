// /food/user/wallet — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/Wallet';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
