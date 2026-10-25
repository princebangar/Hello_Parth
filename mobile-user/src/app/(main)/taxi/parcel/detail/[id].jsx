// /taxi/parcel/detail/:id — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/ride/RideDetail';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
