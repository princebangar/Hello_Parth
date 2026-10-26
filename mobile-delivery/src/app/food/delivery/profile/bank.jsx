// /food/delivery/profile/bank
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { ProfileBankV2 } from '@/modules/DeliveryV2/pages/profile/ProfileBankV2';

export default protectedRoute(ProfileBankV2);
