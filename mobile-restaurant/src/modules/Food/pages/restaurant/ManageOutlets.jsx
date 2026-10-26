// Web: pages/restaurant/ManageOutlets.jsx — "Restaurant" page: "Select an option" list (Timings, Contacts, FSSAI Food
// License, Bank account details, Profile picture, Name/address/location, Ratings/reviews, Delivery area changes); each
// opens its page with state { from }, "Delivery area changes" shows a 5 s info toast. Same texts and targets
// ("Contacts" does nothing, as on the web).
// Native: the fixed bottom toast (framer-motion spring from y 50) is an absolute card animated with Animated.spring;
// the chevron is the web's inline SVG path.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeft, Info } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

const debugLog = () => {};

const options = [
  'Timings',
  'Contacts',
  'FSSAI Food License',
  'Bank account details',
  'Profile picture',
  'Name, address, location',
  'Ratings, reviews',
  'Delivery area changes',
];

function DeliveryAreaToast({ visible }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, { toValue: 1, damping: 25, stiffness: 300, useNativeDriver: true }).start();
      return undefined;
    }
    const a = Animated.spring(anim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => a.stop();
  }, [visible, anim]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastWrap,
        { bottom: sp(6) + insets.bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }] },
      ]}
    >
      <View style={styles.toastCard}>
        <View style={styles.toastRow}>
          <Info size={20} color={restaurantTheme.brand} style={{ marginTop: 2 }} />
          <View style={styles.toastBody}>
            <Text style={styles.toastTitle}>You can not modify the delivery areas of your restaurant</Text>
            <Text style={styles.toastText}>
              Delivery area is defined by the appropriate distance our delivery partners can travel to deliver your orders in time. This can vary basis the time of the day or external conditions like rain etc.
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function ManageOutlets() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRestaurantBackNavigation();
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleOptionClick = (option) => {
    // Navigate based on option selected
    switch (option) {
      case 'Timings':
        navigate('/food/restaurant/outlet-timings', { state: { from: location.pathname } });
        break;
      case 'FSSAI Food License':
        navigate('/food/restaurant/fssai', { state: { from: location.pathname } });
        break;
      case 'Bank account details':
        navigate('/food/restaurant/update-bank-details', { state: { from: location.pathname } });
        break;
      case 'Profile picture':
        navigate('/food/restaurant/outlet-info', { state: { from: location.pathname } });
        break;
      case 'Name, address, location':
        navigate('/food/restaurant/outlet-info', { state: { from: location.pathname } });
        break;
      case 'Ratings, reviews':
        navigate('/food/restaurant/ratings-reviews', { state: { from: location.pathname } });
        break;
      case 'Delivery area changes':
        setShowToast(true);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setShowToast(false), 5000);
        break;
      default:
        debugLog(`${option} clicked`);
    }
  };

  return (
    <Screen bg={colors.white} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.headerTitle}>Restaurant</Text>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardHeadText}>Select an option</Text>
          </View>
          {options.map((option, idx) => (
            <Pressable
              key={option}
              onPress={() => handleOptionClick(option)}
              style={({ pressed }) => [styles.option, idx > 0 && styles.optionDivider, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <Text style={styles.optionText}>{option}</Text>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.gray[500]} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </Svg>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <DeliveryAreaToast visible={showToast} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
    paddingBottom: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { padding: sp(2), borderRadius: 9999 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(6) },
  card: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' },
  cardHead: { paddingHorizontal: sp(4), paddingVertical: sp(3), backgroundColor: colors.gray[50] },
  cardHeadText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  option: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp(4) },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.gray[200] },
  optionText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900], flexShrink: 1 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: sp(4), zIndex: 200, elevation: 200 },
  toastCard: {
    width: '100%',
    maxWidth: 448,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    borderRadius: 10,
    ...shadow['2xl'],
  },
  toastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
  toastBody: { flex: 1, gap: sp(2) },
  toastTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  toastText: { fontSize: 12, lineHeight: 19.5, color: colors.gray[600] },
});
