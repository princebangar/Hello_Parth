// /food/delivery/help/tickets/:ticketId
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { ViewSupportTicketV2 } from '@/modules/DeliveryV2/pages/help/ViewSupportTicketV2';

export default protectedRoute(ViewSupportTicketV2);
