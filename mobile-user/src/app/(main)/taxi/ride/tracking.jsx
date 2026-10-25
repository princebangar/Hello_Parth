// /taxi/ride/tracking — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/RideTracking';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
