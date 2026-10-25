// /taxi/user/ride/select-vehicle — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/SelectVehicle';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
