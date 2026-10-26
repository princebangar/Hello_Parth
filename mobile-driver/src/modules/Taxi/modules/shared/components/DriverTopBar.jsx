// Web: DriverTopBar.jsx + driverChrome.css (.driver-topbar) — header of the driver apps ("Hello Parth" + Taxi Driver /
// Bus Driver / Owner): curved blue bar (135deg #12348c -> #2457d6 -> #4f8df5, bottom corners 28 px). `floating` pins it
// over a full-screen map (Taxi Home); children are the buttons on its right.
// The app draws edge to edge, so the bar reaches up behind the status bar and starts its content below it (the
// WebView page started below the status bar).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocation } from '@/lib/router';
import { Text } from '@/native/ui';
import { driverTheme, fonts } from '@/theme';
import { getAuthenticatedDriverRole } from '../../driver/services/registrationService';

const ROLES = {
  driver: { title: 'Hello Parth', subtitle: 'Taxi Driver' },
  bus_driver: { title: 'Hello Parth', subtitle: 'Bus Driver' },
  owner: { title: 'Hello Parth', subtitle: 'Owner' },
};

const DriverTopBar = ({ floating = false, children = null }) => {
  const { pathname } = useLocation();
  const insets = useSafeAreaInsets();
  const role = pathname.startsWith('/taxi/owner')
    ? 'owner'
    : String(getAuthenticatedDriverRole() || 'driver').toLowerCase();
  const { title, subtitle } = ROLES[role] || ROLES.driver;

  return (
    <View style={[styles.shadow, floating && styles.floating]}>
      <LinearGradient
        colors={[driverTheme.chromeFrom, driverTheme.chromeMid, driverTheme.chromeTo]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bar, { paddingTop: 12 + insets.top, minHeight: 72 + insets.top }]}
      >
        <View style={styles.texts}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  shadow: {
    zIndex: 5,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: driverTheme.chromeMid,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 45 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  texts: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.outfit, fontSize: 18, fontWeight: '800', letterSpacing: -0.18, lineHeight: 21, color: '#FFFFFF' },
  subtitle: {
    marginTop: 3,
    fontFamily: fonts.outfit,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.13,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
});

export default DriverTopBar;
