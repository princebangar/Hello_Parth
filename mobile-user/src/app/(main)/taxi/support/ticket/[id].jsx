// /taxi/support/ticket/:id — login required (web: <UserProtectedRoute>)
import Page from '@/modules/Taxi/modules/user/pages/support/SupportTicketDetail';
import { userRoute } from '@/modules/Taxi/TaxiApp';

export default userRoute(Page);
