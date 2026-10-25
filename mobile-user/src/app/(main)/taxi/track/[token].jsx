// /taxi/track/:token — secret "share my ride" link: anyone with it sees the live trip, no login.
import Page from '@/modules/Taxi/modules/user/pages/ride/PublicRideTrack';
import { publicRoute } from '@/modules/Taxi/TaxiApp';

export default publicRoute(Page);
