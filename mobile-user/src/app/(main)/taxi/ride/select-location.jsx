// /taxi/ride/select-location — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/SelectLocation';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
