// /taxi/bus/list — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/bus/BusList';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
