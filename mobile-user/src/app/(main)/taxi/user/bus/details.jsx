// /taxi/user/bus/details — login required (web: <UserProtectedRoute>) (web: /taxi/user/bus/details is the bus preview)
import Page from '@/modules/Taxi/modules/user/pages/bus/BusPreview';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
