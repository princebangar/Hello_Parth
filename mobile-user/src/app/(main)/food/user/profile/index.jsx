// /food/user/profile — main tab: drawn by MainTabKeepAlive in UserLayout; the route only matches (web:
// MainTabRoutePlaceholder inside the ProtectedRoute group). The login guard is the ProtectedRoute around the
// kept-alive Profile pane (MainTabKeepAlive), so a guest is sent to /login once, not twice.
import { MainTabRoutePlaceholder, publicRoute } from '@food/components/user/UserRouter';

export default publicRoute(MainTabRoutePlaceholder);
