// /food/user/profile/report-safety-emergency — login required (ProtectedRoute requiredRole="user" loginPath="/login")
import Page from '@food/pages/user/profile/ReportSafetyEmergency';
import { protectedRoute } from '@food/components/user/UserRouter';

export default protectedRoute(Page);
