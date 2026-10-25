// /taxi/user/ride/complete — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/RideComplete';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
