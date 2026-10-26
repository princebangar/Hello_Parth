// /food/delivery/otp (web: the same SignIn page, which shows its OTP step)
import { authRoute } from '@/modules/DeliveryV2/routes';
import SignIn from '@/modules/DeliveryV2/pages/auth/SignIn';

export default authRoute(SignIn);
