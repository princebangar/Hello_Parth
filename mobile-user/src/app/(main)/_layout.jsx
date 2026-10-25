// Taxi (/taxi/**) and Food (/food/**) are the two halves of the app, switched from the Taxi | Food pills in both home
// headers. They are tabs of one navigator (no visible tab bar; the group "(main)" does not change any URL): after the
// first visit each half stays mounted, so switching back and forth is instant instead of rebuilding the whole other
// app (a slow first frame, and a moment of whatever screen that half showed last).
// No cross-fade: half-way through it both halves were see-through and the light app background flashed between
// Food's maroon and Taxi's navy headers.
import { Tabs } from 'expo-router';

const hiddenTabBar = () => null;

export default function MainLayout() {
  return (
    <Tabs
      tabBar={hiddenTabBar}
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        animation: 'none',
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen name="taxi" />
      <Tabs.Screen name="food" />
    </Tabs>
  );
}
