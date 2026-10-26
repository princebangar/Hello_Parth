// /food/delivery/help/tickets
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { SupportTicketsV2 } from '@/modules/DeliveryV2/pages/help/SupportTicketsV2';

export default protectedRoute(SupportTicketsV2);
