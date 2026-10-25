// /taxi/user/ride/searching — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/SearchingDriver';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
