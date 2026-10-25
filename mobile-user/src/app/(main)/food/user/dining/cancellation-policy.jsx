// /food/user/dining/cancellation-policy — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/dining/TableCancellationPolicy';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
