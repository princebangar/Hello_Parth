// /food/delivery/profile/documents
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { ProfileDocsV2 } from '@/modules/DeliveryV2/pages/profile/ProfileDocsV2';

export default protectedRoute(ProfileDocsV2);
