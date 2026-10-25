// Web: modules/Food/components/user/LocationPrompt.jsx — the "Enable Location Services" popup (rendered once at
// app level) and useLocationPromptPending(). Same decision logic, texts and colours (light and dark).
// navigator.permissions / navigator.geolocation come from the native shims (src/lib/webCompat.js).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { MapPin, X } from 'lucide-react-native';
import { useNavigate, useLocation as useRouteLocation } from '@/lib/router';
import { Text } from '@/native/ui';
import { alpha, colors, shadow, useTheme } from '@/theme';
import { useLocation, hasValidStoredUserLocation } from '@food/hooks/useLocation';
import { markLocationAllowed } from '@/shared/utils/sharedUserLocation';

const isConsumerAppPath = (pathname = '') => {
  const path = String(pathname || '').toLowerCase();
  if (path.startsWith('/admin') || path.includes('/taxi/admin')) return false;
  // Restaurant / delivery partner panels (not the customer's /food/user/restaurants/... pages).
  if (/^\/(food\/)?(restaurant|delivery)(\/|$)/.test(path)) return false;
  if (path.includes('/taxi/driver') || path.includes('/taxi/owner')) return false;
  // The login screen asks for nothing but the number: location is taken once the person is in the app.
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/food/user') || path === '/food' || path.startsWith('/food/')) return true;
  if (path.startsWith('/taxi/user') || path === '/taxi' || path.startsWith('/taxi/')) return true;
  // "/" is the public landing page for guests — it has no location-based content of its own.
  return false;
};

const queryGeoPermission = async () => {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    return 'unknown';
  }
};

// "Select Location Manually" navigates to the address page — don't pop the prompt straight back up there.
let skipNextPrompt = false;

// True while the first location of this visit is still on its way: the prompt is deciding / open, or the GPS fix
// it started is running. Food's layout keeps its loading skeleton meanwhile instead of drawing Home and then swapping
// to the out-of-zone screen. Starts true only when nothing is stored yet.
let locationPending = typeof window !== 'undefined' && !hasValidStoredUserLocation();
const pendingListeners = new Set();
const setLocationPending = (value) => {
  if (locationPending === value) return;
  locationPending = value;
  pendingListeners.forEach((listener) => listener(value));
};

export function useLocationPromptPending() {
  const [pending, setPending] = useState(locationPending);
  useEffect(() => {
    pendingListeners.add(setPending);
    setPending(locationPending);
    return () => pendingListeners.delete(setPending);
  }, []);
  return pending;
}

function PingRing({ color }) {
  // Tailwind animate-ping: scale 1 -> 2 and fade out, 1s, forever
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: 9999,
          backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.75, 0, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 2, 2] }) }],
        },
      ]}
    />
  );
}

export default function LocationPrompt() {
  const navigate = useNavigate();
  const routeLocation = useRouteLocation();
  const t = useTheme();
  const d = t.dark;
  const { location, loading, permissionGranted, requestLocation } = useLocation();
  // Default Location Mode switched OFF clears the default location; having no location again re-runs the check below.
  const hasLocation = Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
  const [showPrompt, setShowPrompt] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [geoPermission, setGeoPermission] = useState('unknown');
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isConsumerAppPath(routeLocation.pathname)) {
      setShowPrompt(false);
      return undefined;
    }

    let cancelled = false;

    const maybeShow = async () => {
      if (skipNextPrompt) {
        skipNextPrompt = false;
        setLocationPending(false);
        return;
      }

      const permissionState = await queryGeoPermission();
      if (cancelled) return;
      setGeoPermission(permissionState);

      if (permissionState === 'granted') {
        if (!hasValidStoredUserLocation()) {
          setLocationPending(true);
          try {
            await requestLocation();
            markLocationAllowed();
          } catch {}
        }
        setLocationPending(false);
        return;
      }

      // No Permissions API: all we can go by is having a location.
      if (permissionState === 'unknown' && (permissionGranted || hasValidStoredUserLocation())) {
        setLocationPending(false);
        return;
      }

      // Location access is mandatory: keep asking on every screen until it is granted.
      setLocationPending(!hasValidStoredUserLocation());
      setShowPrompt(true);
      cardAnim.setValue(0);
      Animated.timing(cardAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    };

    maybeShow();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionGranted, routeLocation.pathname, hasLocation]);

  // Close once access is actually granted (a stored location alone isn't enough now).
  useEffect(() => {
    if (!showPrompt) return undefined;
    let cancelled = false;
    queryGeoPermission().then((state) => {
      if (cancelled) return;
      setGeoPermission(state);
      const granted = state === 'granted' || (state === 'unknown' && hasValidStoredUserLocation());
      if (granted) {
        setShowPrompt(false);
        setLocationPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [location, showPrompt]);

  const handleAllow = async () => {
    setIsRequesting(true);
    try {
      await requestLocation();
      markLocationAllowed();
      setShowPrompt(false);
      setLocationPending(false);
    } catch {
      // Keep prompt open so user can try again or pick manually.
      setGeoPermission(await queryGeoPermission());
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSelectManually = () => {
    skipNextPrompt = true;
    setShowPrompt(false);
    setLocationPending(false);
    const path = String(routeLocation.pathname || '');
    if (path.startsWith('/taxi')) {
      navigate('/taxi/user/ride/select-location');
      return;
    }
    navigate('/food/user/address-selector');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setLocationPending(false);
  };

  if (!showPrompt || !isConsumerAppPath(routeLocation.pathname)) return null;

  const busy = loading || isRequesting;

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.root}>
        <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', 0.6) }]} />
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: d ? colors.zinc[900] : colors.white, borderColor: d ? colors.zinc[800] : colors.zinc[100] },
            { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
          ]}
        >
          <Pressable
            onPress={handleDismiss}
            hitSlop={6}
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: d ? alpha(colors.red[950], pressed ? 0.6 : 0.4) : pressed ? colors.red[100] : colors.red[50] },
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
          >
            {({ pressed }) => <X size={18} strokeWidth={2.5} color={pressed ? '#B91C1C' : '#DC2626'} />}
          </Pressable>

          <View style={{ position: 'relative', marginBottom: 20, marginTop: 16 }}>
            <PingRing color={d ? alpha(colors.red[950], 0.4) : colors.red[100]} />
            {/* ring-8 ring-red-100/50 */}
            <View style={{ padding: 8, borderRadius: 9999, backgroundColor: d ? alpha(colors.red[950], 0.1) : alpha(colors.red[100], 0.5), margin: -8 }}>
              <View
                style={{
                  height: 64,
                  width: 64,
                  borderRadius: 9999,
                  backgroundColor: d ? alpha(colors.red[950], 0.3) : colors.red[50],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MapPin size={32} color="#DC2626" />
              </View>
            </View>
          </View>

          <Text style={[styles.title, { color: d ? colors.zinc[50] : colors.zinc[900] }]}>Enable Location Services</Text>

          <Text style={[styles.body, { color: d ? colors.zinc[400] : colors.zinc[500] }]}>
            {String(routeLocation.pathname || '').startsWith('/taxi')
              ? 'Allow location access once so we can find rides near you. The same location is used in Food and Taxi.'
              : 'Allow location access once to see nearby food and offers. The same location is used in Food and Taxi.'}
          </Text>

          {geoPermission === 'denied' && (
            <Text style={styles.denied}>Location is blocked for this app. Turn it on in your browser or phone settings, then tap Allow again.</Text>
          )}

          <View style={{ flexDirection: 'column', gap: 10, marginTop: 24, width: '100%' }}>
            <Pressable
              onPress={handleAllow}
              disabled={busy}
              style={({ pressed }) => [styles.allow, pressed && { backgroundColor: '#B91C1C' }, busy && { opacity: 0.85 }]}
            >
              {busy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size={16} color="#ffffff" />
                  <Text style={styles.allowText}>Getting Location...</Text>
                </View>
              ) : (
                <Text style={styles.allowText}>Allow Location Access</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleSelectManually}
              style={({ pressed }) => [
                styles.manual,
                {
                  backgroundColor: d ? alpha(colors.zinc[400], pressed ? 0.2 : 0.1) : alpha(colors.zinc[500], pressed ? 0.2 : 0.1),
                  borderColor: d ? alpha(colors.zinc[400], 0.2) : alpha(colors.zinc[500], 0.2),
                },
              ]}
            >
              <Text style={[styles.manualText, { color: d ? colors.zinc[200] : colors.zinc[700] }]}>Select Location Manually</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 384, borderWidth: 1, borderRadius: 28, padding: 24, alignItems: 'center', ...shadow['2xl'] },
  close: { position: 'absolute', right: 16, top: 16, padding: 6, borderRadius: 9999, ...shadow.sm, zIndex: 2 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22.75, textAlign: 'center', marginTop: 12, paddingHorizontal: 4 },
  denied: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#DC2626', textAlign: 'center', marginTop: 12, paddingHorizontal: 4 },
  allow: {
    width: '100%',
    height: 48,
    borderRadius: 9999,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  allowText: { color: '#ffffff', fontWeight: '600', fontSize: 14, lineHeight: 20 },
  manual: { width: '100%', height: 48, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  manualText: { fontWeight: '700', fontSize: 14, lineHeight: 20 },
});
