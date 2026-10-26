// /food/delivery/profile/reviews
import { protectedRoute } from '@/modules/DeliveryV2/routes';
import { MyReviewsV2 } from '@/modules/DeliveryV2/pages/profile/MyReviewsV2';

export default protectedRoute(MyReviewsV2);
