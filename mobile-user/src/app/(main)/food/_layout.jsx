// /food/** — the Food app root (web: modules/Food/routes.jsx App -> UserRouter -> UserLayout). The Stack is the
// web's <Outlet />: UserLayout keeps it mounted and draws the kept-alive main tabs / category page, the zone
// skeleton and out-of-zone screen, the bottom navigation and the Food popups around it.
// No slide animation: the web switches Food screens instantly (pages fade in through AnimatedPage).
import { Stack } from 'expo-router';
import { RouteScope } from '@/lib/router';
import { SectionActive } from '@/native/ui/SectionStatusBar';
import FoodApp from '@food/routes';
import UserRouter from '@food/components/user/UserRouter';

export default function FoodLayout() {
  return (
    <RouteScope prefix="/food">
      <SectionActive prefix="/food">
        <FoodApp>
          <UserRouter>
            <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          </UserRouter>
        </FoodApp>
      </SectionActive>
    </RouteScope>
  );
}
