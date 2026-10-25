// /food/user/collections/:id — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/CollectionDetail';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
