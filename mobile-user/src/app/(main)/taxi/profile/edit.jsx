// /taxi/profile/edit — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/profile/ProfileSettings';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
