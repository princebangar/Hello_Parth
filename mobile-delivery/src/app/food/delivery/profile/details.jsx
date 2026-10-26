// /food/delivery/profile/details
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { ProfileDetailsV2 } from '@/modules/DeliveryV2/pages/profile/ProfileDetailsV2';

export default protectedRoute(ProfileDetailsV2);
