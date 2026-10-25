import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Loader2, MapPin, ShieldCheck, Navigation } from 'lucide-react-native';
import { useParams } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { AppMap, Marker, regionFor, toLatLng } from '@/native/ui/AppMap';
import { Spin } from '@/shared/components/Loader';
import { colors, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';

// Public page behind the "Share ride" link: no login. Shows where the captain is right now, who is driving and how
// the trip is going. It refreshes by itself every few seconds until the trip is over.
const POLL_MS = 5000;

const STATUS_TEXT = {
  searching: 'Finding a captain',
  accepted: 'Captain is on the way to pick up',
  arriving: 'Captain has reached the pickup point',
  started: 'Trip in progress',
  ongoing: 'Trip in progress',
  arrived: 'Reaching the drop point',
  completed: 'Trip completed - reached safely',
  cancelled: 'This trip was cancelled',
};

// --user-* palette of modules/Taxi/index.css (this page sits inside the Taxi `user-app-theme` scope)
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8' };
// `.user-app-theme .shadow` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const Dot = ({ color }) => (
  <View style={[styles.dot, { backgroundColor: color }]} />
);

// animate-pulse
const PulseDot = ({ color }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.liveDot, { backgroundColor: color, opacity }]} />;
};

const PublicRideTrack = () => {
  const { token } = useParams();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = null;

    const load = async () => {
      try {
        const response = await api.get(`/common/track/${encodeURIComponent(token)}`, { dedupe: false });
        if (!active) return;
        setTrip(response?.data || response);
        setError('');
        if (!(response?.data || response)?.ended) {
          timer = setTimeout(load, POLL_MS);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'This tracking link is not available');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  const driverPos = trip?.driverLocation || null;
  const center = driverPos || trip?.pickup || trip?.drop || { lat: 22.7196, lng: 75.8577 };
  const initialRegion = useMemo(() => regionFor(center, 15), [Boolean(trip)]); // eslint-disable-line react-hooks/exhaustive-deps

  // First time: show pickup, drop and the captain together. After that the map follows the captain smoothly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !trip) return;
    if (!fittedRef.current) {
      const points = [trip.pickup, trip.drop, driverPos].filter(Boolean).map(toLatLng);
      if (points.length) {
        if (points.length === 1) map.animateCamera({ center: points[0] }, { duration: 300 });
        else map.fitToCoordinates(points, { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: false });
        fittedRef.current = true;
      }
    } else if (driverPos && !trip.ended) {
      map.animateCamera({ center: toLatLng(driverPos) }, { duration: 500 });
    }
  }, [trip, driverPos?.lat, driverPos?.lng, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusText = useMemo(() => {
    if (!trip) return '';
    return STATUS_TEXT[trip.liveStatus] || STATUS_TEXT[trip.status] || 'Trip';
  }, [trip]);

  if (loading) {
    return (
      <Screen bg={p.card}>
        <View style={styles.center}>
          <Spin>
            <Loader2 size={28} color={p.sec} />
          </Spin>
        </View>
      </Screen>
    );
  }

  if (error || !trip) {
    return (
      <Screen bg={p.card}>
        <View style={[styles.center, { gap: 12, paddingHorizontal: 32 }]}>
          <ShieldCheck size={42} color={p.sec} />
          <Text style={[styles.errTitle, { color: p.text }]}>Tracking link not available</Text>
          <Text style={[styles.errText, { color: p.muted }]}>{error || 'This link is not valid or has expired.'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg={p.soft} edges={[]}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <AppMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onMapReady={() => setMapReady(true)}
          zoomControlEnabled
        >
          {trip.pickup && (
            <Marker coordinate={toLatLng(trip.pickup)} title="Pickup" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <Dot color="#16a34a" />
            </Marker>
          )}
          {trip.drop && (
            <Marker coordinate={toLatLng(trip.drop)} title="Drop" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <Dot color="#dc2626" />
            </Marker>
          )}
          {driverPos && (
            <Marker coordinate={toLatLng(driverPos)} title="Captain" anchor={{ x: 0.5, y: 0.5 }} zIndex={10} tracksViewChanges={false}>
              <Dot color="#2563eb" />
            </Marker>
          )}
        </AppMap>
        <View style={[styles.livePill, SH, { top: insets.top + 12, backgroundColor: p.card }]}>
          {trip.ended ? <View style={[styles.liveDot, { backgroundColor: colors.slate[400] }]} /> : <PulseDot color={colors.emerald[500]} />}
          <Text style={[styles.liveText, { color: p.sec }]}>{trip.ended ? 'Trip ended' : 'Live'}</Text>
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: p.card, paddingBottom: Math.max(20, insets.bottom) }]}>
        <Text style={[styles.kicker, { color: p.sec }]}>LIVE RIDE TRACKING</Text>
        <Text style={[styles.status, { color: p.text }]}>{statusText}</Text>

        {trip.driver && (
          <View style={[styles.driverRow, { backgroundColor: p.card }]}>
            <View style={styles.driverIcon}><Car size={18} color={p.text} /></View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text numberOfLines={1} style={[styles.driverName, { color: p.text }]}>{trip.driver.name}</Text>
              <Text numberOfLines={1} style={[styles.driverSub, { color: p.muted }]}>
                {[trip.driver.vehicleLabel, trip.driver.vehicleNumber].filter(Boolean).join(' - ') || 'Vehicle details soon'}
              </Text>
            </View>
          </View>
        )}

        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={styles.addrRow}>
            <MapPin size={15} color={colors.emerald[600]} style={{ marginTop: 2 }} />
            <Text style={[styles.addr, { color: p.sec }]}>{trip.pickupAddress || 'Pickup'}</Text>
          </View>
          <View style={styles.addrRow}>
            <Navigation size={15} color={colors.rose[600]} style={{ marginTop: 2 }} />
            <Text style={[styles.addr, { color: p.sec }]}>{trip.dropAddress || 'Drop'}</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  errText: { fontSize: 13, lineHeight: 18, fontWeight: '500', textAlign: 'center' },
  // SymbolPath.CIRCLE scale 9, white 3px stroke
  dot: { width: 21, height: 21, borderRadius: 11, borderWidth: 3, borderColor: '#ffffff' },
  livePill: { position: 'absolute', left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
  },
  kicker: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 0.55 },
  status: { marginTop: 2, fontSize: 18, lineHeight: 22, fontWeight: '600' },
  driverRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  driverIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  driverSub: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  addr: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
});

export default PublicRideTrack;
