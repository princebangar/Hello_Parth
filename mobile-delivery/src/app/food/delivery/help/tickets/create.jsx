// /food/delivery/help/tickets/create
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { CreateSupportTicketV2 } from '@/modules/DeliveryV2/pages/help/CreateSupportTicketV2';

export default protectedRoute(CreateSupportTicketV2);
