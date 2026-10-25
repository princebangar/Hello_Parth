// /food/user/dining/edit-user — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/dining/TableEditUserPage';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
