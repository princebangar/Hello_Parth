// /food/user/profile/accessibility — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/Accessibility';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
