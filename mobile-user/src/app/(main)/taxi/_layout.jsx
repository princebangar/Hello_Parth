// /taxi/** — the Taxi customer app root (web: modules/Taxi/TaxiApp.jsx mounted at /taxi/*). TaxiApp brings the web's
// providers (settings, user theme, Outfit font, socket / push / reminder watchers, the --user-bg page colour); the Stack
// is the web's <Routes>, and UserMainTabKeepAlive is a layer above it that keeps the bottom-bar tabs (Home, Rides, Bus,
// Support, Profile) mounted and shows the open one whenever the URL is a tab route.
// No slide animation: the web switches Taxi screens instantly.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { RouteScope } from '@/lib/router';
import { SectionActive } from '@/native/ui/SectionStatusBar';
import TaxiApp from '@/modules/Taxi/TaxiApp';
import UserMainTabKeepAlive from '@/modules/Taxi/modules/user/components/UserMainTabKeepAlive';

export default function TaxiLayout() {
  return (
    <RouteScope prefix="/taxi">
      <SectionActive prefix="/taxi">
        <TaxiApp>
          <View style={styles.fill}>
            <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
            <UserMainTabKeepAlive />
          </View>
        </TaxiApp>
      </SectionActive>
    </RouteScope>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
