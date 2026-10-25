// Web: modules/Taxi/modules/user/pages/bus/BusPreview.jsx — one bus: photo gallery, times, journey summary, stops and
// policies, with the fixed "Select Seats" bar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Armchair, BusFront, CalendarDays, ChevronRight, Clock3, Images, MapPin, Phone, ShieldCheck, Ticket } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Screen, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { buildBusRouteState } from './busNavigationState';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
  routeName: bus?.route?.routeName || bus?.routeName || '',
});

const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
};

const formatDurationBrief = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Direct';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

// border / text colour per stop type (the bg-*-50 tint is the theme's card-soft)
const stopBadgeTone = {
  pickup: { borderColor: colors.emerald[200], color: colors.emerald[700] },
  drop: { borderColor: colors.rose[200], color: colors.rose[700] },
  both: { borderColor: colors.indigo[200], color: colors.indigo[700] },
};

const HEADER_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } };
const CARD_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } };

const BusPreview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const [activeImage, setActiveImage] = useState(bus?.coverImage || bus?.image || bus?.galleryImages?.[0] || '');
  const [barHeight, setBarHeight] = useState(112);
  const enter = useRef(new Animated.Value(0)).current;
  const missingBus = !bus?.busServiceId || !bus?.scheduleId;

  // The web redirected while rendering; a native screen redirects right after mounting.
  useEffect(() => {
    if (missingBus) navigate(`${routePrefix}/bus`, { replace: true });
  }, [missingBus, navigate, routePrefix]);

  useEffect(() => {
    setActiveImage(bus?.coverImage || bus?.image || bus?.galleryImages?.[0] || '');
  }, [bus?.coverImage, bus?.galleryImages, bus?.image]);

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [enter]);

  if (missingBus) {
    return null;
  }

  const gallery = [
    bus?.coverImage || bus?.image || '',
    ...(Array.isArray(bus?.galleryImages) ? bus.galleryImages : []),
  ].filter(Boolean).filter((image, index, list) => list.indexOf(image) === index);
  const routeStops = Array.isArray(bus?.route?.stops) ? bus.route.stops : [];
  const displayRoute = getDisplayRoute(bus, fromCity, toCity);

  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const label = [styles.label, { color: P.textSecondary }];

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, HEADER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={styles.row}>
          <Pressable onPress={() => navigate(-1)} style={[styles.backBtn, USER_SHADOW, card]}>
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text numberOfLines={1} style={[styles.h1, { color: P.textPrimary }]}>{bus.operator || 'Bus Details'}</Text>
            <Text style={[label, { marginTop: 2 }]}>
              {`${displayRoute.fromCity} to ${displayRoute.toCity} • ${formatTravelDate(date)}`.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: Math.max(112, barHeight + 16) }]} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.heroCard,
            CARD_SHADOW,
            card,
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}
        >
          <View style={[styles.hero, { backgroundColor: P.cardBg }]}>
            {activeImage ? (
              <AppImage src={activeImage} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={bus.busName || bus.operator || 'Bus'} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: bus.busColor || '#0f172a' }]}>
                <BusFront size={70} color={alpha('#ffffff', 0.9)} />
              </View>
            )}
            <LinearGradient
              colors={[alpha(colors.slate[950], 0.75), alpha(colors.slate[900], 0.2), 'transparent']}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroInfo}>
              <View style={[styles.rowBetween, { alignItems: 'flex-end', gap: 16 }]}>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={[styles.label, { color: alpha('#ffffff', 0.7) }]}>{String(bus.busName || 'Coach Service').toUpperCase()}</Text>
                  <Text numberOfLines={1} style={[styles.heroTitle, { color: P.textPrimary }]}>{bus.operator}</Text>
                  <Text style={[styles.heroSub, { color: alpha('#ffffff', 0.75) }]}>{bus.type} • {displayRoute.routeName || 'Direct route'}</Text>
                </View>
                <View style={[styles.pricePill, { backgroundColor: alpha('#ffffff', 0.12) }]}>
                  <Text style={[styles.label, { color: alpha('#ffffff', 0.7), letterSpacing: 1.6 }]}>STARTS AT</Text>
                  <Text style={[styles.heroPrice, { color: P.textPrimary }]}>Rs {Number(bus.price || 0)}</Text>
                </View>
              </View>
            </View>
          </View>

          {gallery.length > 1 ? (
            <View style={[styles.gallery, { borderTopColor: P.border }]}>
              <View style={[styles.row, { gap: 8, marginBottom: 12 }]}>
                <Images size={14} color={P.textSecondary} />
                <Text style={[label, { letterSpacing: 2 }]}>GALLERY</Text>
              </View>
              <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                {gallery.map((image, index) => (
                  <Pressable
                    key={`${image}-${index}`}
                    onPress={() => setActiveImage(image)}
                    style={[styles.thumb, { borderColor: activeImage === image ? colors.orange[400] : 'transparent' }]}
                  >
                    <AppImage src={image} style={styles.thumbImg} contentFit="cover" accessibilityLabel={`${bus.operator} ${index + 1}`} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Animated.View>

        <View style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
          <View style={[styles.stat, USER_SHADOW, card]}>
            <Text style={label}>DEPARTURE</Text>
            <Text style={[styles.statValue, { color: P.textPrimary }]}>{formatBusTime(bus.departure, 'NA')}</Text>
          </View>
          <View style={[styles.stat, USER_SHADOW, card]}>
            <Text style={label}>ARRIVAL</Text>
            <Text style={[styles.statValue, { color: P.textPrimary }]}>{formatBusTime(bus.arrival, 'NA')}</Text>
          </View>
          <View style={[styles.stat, USER_SHADOW, card]}>
            <Text style={label}>SEATS LEFT</Text>
            <Text style={[styles.statValue, { color: colors.emerald[600] }]}>{bus.availableSeats || 0}</Text>
          </View>
        </View>

        <View style={[styles.section, USER_SHADOW, card]}>
          <View style={[styles.rowBetween, { gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[label, { letterSpacing: 2 }]}>JOURNEY SUMMARY</Text>
              <Text style={[styles.h3, { color: P.textPrimary }]}>{displayRoute.fromCity} to {displayRoute.toCity}</Text>
            </View>
            <View style={[styles.durationPill, { backgroundColor: P.cardSoft }]}>
              <Text style={styles.durationText}>{formatDurationBrief(bus.duration)}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20, gap: 12 }}>
            <View style={[styles.infoRow, card]}>
              <View style={[styles.row, { gap: 8 }]}>
                <CalendarDays size={14} color={P.textSecondary} />
                <Text style={[styles.infoText, { color: P.textSecondary }]}>{formatTravelDate(date)}</Text>
              </View>
              <View style={[styles.row, { gap: 8 }]}>
                <Clock3 size={14} color={P.textSecondary} />
                <Text style={[styles.infoText, { color: P.textSecondary }]}>{formatBusTime(bus.departure)} to {formatBusTime(bus.arrival)}</Text>
              </View>
            </View>
            <View style={[styles.infoRow, card]}>
              <View style={[styles.row, { gap: 8 }]}>
                <Armchair size={14} color={P.textSecondary} />
                <Text style={[styles.infoText, { color: P.textSecondary }]}>{bus.type}</Text>
              </View>
              <View style={[styles.row, { gap: 8 }]}>
                <Ticket size={14} color={P.textSecondary} />
                <Text style={[styles.infoText, { color: P.textSecondary }]}>Rs {Number(bus.price || 0)} per seat</Text>
              </View>
            </View>
            {(bus.driverName || bus.driverPhone) ? (
              <View style={[styles.infoRow, card]}>
                <View>
                  <Text style={[label, { letterSpacing: 1.6 }]}>BUS STAFF</Text>
                  <Text style={[styles.staffName, { color: P.textPrimary }]}>{bus.driverName || 'Assigned crew'}</Text>
                </View>
                {bus.driverPhone ? (
                  <View style={[styles.row, { gap: 8 }]}>
                    <Phone size={14} color={P.textSecondary} />
                    <Text style={[styles.infoText, { color: P.textSecondary }]}>{bus.driverPhone}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.section, USER_SHADOW, card]}>
          <Text style={[label, { letterSpacing: 2 }]}>STOPS & BOARDING POINTS</Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            {routeStops.length > 0 ? routeStops.map((stop, index) => {
              const tone = stopBadgeTone[stop.stopType] || stopBadgeTone.both;
              return (
                <View key={stop.id || `${bus.id}-stop-${index}`} style={[styles.stop, { borderColor: P.border, backgroundColor: P.cardSoft }]}>
                  <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <View style={[styles.row, { gap: 8 }]}>
                        <MapPin size={14} color={P.accent} />
                        <Text numberOfLines={1} style={[styles.stopName, { color: P.textPrimary, flexShrink: 1 }]}>{stop.city || stop.pointName || `Stop ${index + 1}`}</Text>
                      </View>
                      <Text numberOfLines={1} style={[styles.stopPoint, { color: P.textMuted }]}>{stop.pointName || 'Point not set'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.badge, { borderColor: tone.borderColor, backgroundColor: P.cardSoft }]}>
                        <Text style={[styles.badgeText, { color: tone.color }]}>
                          {stop.stopType === 'both' ? 'BP + DP' : stop.stopType === 'drop' ? 'DP' : 'BP'}
                        </Text>
                      </View>
                      <Text style={[styles.stopTime, { color: P.textMuted }]}>{formatBusTime(stop.arrivalTime || stop.departureTime)}</Text>
                    </View>
                  </View>
                </View>
              );
            }) : (
              <View style={[styles.emptyStops, { borderColor: P.border, backgroundColor: P.cardBg }]}>
                <Text style={[styles.emptyStopsText, { color: P.textMuted }]}>No stop details added for this bus yet.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.section, USER_SHADOW, card]}>
          <View style={[styles.row, { gap: 8 }]}>
            <ShieldCheck size={16} color={colors.emerald[500]} />
            <Text style={[label, { letterSpacing: 2 }]}>POLICIES & COMFORT</Text>
          </View>

          {Array.isArray(bus.amenities) && bus.amenities.length > 0 ? (
            <View style={styles.amenities}>
              {bus.amenities.map((amenity) => (
                <View key={amenity} style={[styles.amenity, card]}>
                  <Text style={[styles.amenityText, { color: P.textSecondary }]}>{amenity}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 16, gap: 12 }}>
            {[
              ['BOARDING POLICY', bus.boardingPolicy],
              ['CANCELLATION POLICY', bus.cancellationPolicy],
              ['LUGGAGE POLICY', bus.luggagePolicy],
            ].map(([title, text]) =>
              text ? (
                <View key={title} style={[styles.policy, card]}>
                  <Text style={label}>{title}</Text>
                  <Text style={[styles.policyText, { color: P.textSecondary }]}>{text}</Text>
                </View>
              ) : null,
            )}
          </View>
        </View>
      </ScrollView>

      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={[styles.bar, { backgroundColor: P.cardBg, borderTopColor: P.border, paddingBottom: 32 + insets.bottom }]}
      >
        <Pressable
          onPress={() => navigate(`${routePrefix}/bus/seats`, { state: buildBusRouteState(state) })}
          style={[styles.cta, USER_SHADOW, { backgroundColor: P.accent }]}
        >
          <Text style={[styles.ctaText, { color: P.accentInk }]}>Select Seats</Text>
          <ChevronRight size={18} color={P.accentInk} />
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  heroCard: { overflow: 'hidden', borderRadius: 30, borderWidth: 1 },
  hero: { height: 224, overflow: 'hidden' },
  heroInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20 },
  heroTitle: { marginTop: 4, fontSize: 22, lineHeight: 30, fontWeight: '700' },
  heroSub: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  pricePill: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-end' },
  heroPrice: { marginTop: 4, fontSize: 24, lineHeight: 32, fontWeight: '700' },
  gallery: { borderTopWidth: 1, padding: 16 },
  thumb: { overflow: 'hidden', borderRadius: 16, borderWidth: 2 },
  thumbImg: { height: 80, width: 112 },
  stat: { flex: 1, borderRadius: 22, borderWidth: 1, padding: 16 },
  statValue: { marginTop: 8, fontSize: 18, lineHeight: 28, fontWeight: '700' },
  section: { borderRadius: 28, borderWidth: 1, padding: 20 },
  h3: { marginTop: 4, fontSize: 18, lineHeight: 28, fontWeight: '700' },
  durationPill: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 8 },
  durationText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.orange[600] },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  infoText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  staffName: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stop: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  stopName: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stopPoint: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  badge: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  stopTime: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  emptyStops: { borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 16, paddingVertical: 24 },
  emptyStopsText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  amenities: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenity: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  amenityText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  policy: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  policyText: { marginTop: 8, fontSize: 14, lineHeight: 24, fontWeight: '600' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16 },
  cta: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, paddingVertical: 16 },
  ctaText: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
});

export default BusPreview;
