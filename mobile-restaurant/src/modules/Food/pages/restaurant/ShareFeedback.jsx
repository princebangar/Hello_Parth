// Web: pages/restaurant/ShareFeedback.jsx — "Share your feedback": 0-10 rating scale, Continue posts
// POST API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE { rating: ceil(rating / 2) || 1, module: 'restaurant', comment }
// and shows the "Thanks for your feedback" popup; Done / tap outside -> /food/restaurant/explore (replace). Same texts.
// Native: the motion buttons (spring scale on the chosen / neighbouring number, tap scale) use Animated.spring; the
// popup is a Dialog; the decorative bars keep the web's sizes and colours (h-22 is not a Tailwind class, so the web
// drew that bar with no height — the same here).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Dialog, Screen, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import api from '@food/api';
import { API_ENDPOINTS } from '@food/api/config';
import { useCompanyName } from '@food/hooks/useCompanyName';

const debugError = () => {};

const BRAND_GRADIENT = [restaurantTheme.brand, restaurantTheme.brandDark];

function ScaleNumber({ num, rating, onPress, first }) {
  const isActive = rating === num;
  const intensity = rating === null ? 0 : Math.abs(num - rating);
  const target = isActive ? 1.05 : intensity === 1 ? 1.02 : 1;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: target, stiffness: 260, damping: 20, useNativeDriver: true }).start();
  }, [target, scale]);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, stiffness: 260, damping: 20, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: target, stiffness: 260, damping: 20, useNativeDriver: true }).start()}
      style={[styles.numCell, !first && styles.numDivider]}
    >
      <Animated.View style={[styles.numInner, !isActive && { backgroundColor: colors.white }, { transform: [{ scale }] }]}>
        {isActive ? <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        <Text style={[styles.numText, isActive && { color: colors.white }]}>{num}</Text>
      </Animated.View>
    </Pressable>
  );
}

function RatedLine({ rating }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [rating, anim]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }}>
      <Text style={styles.rated}>
        You rated your experience <Text style={styles.ratedStrong}>{rating}/10</Text>.
      </Text>
    </Animated.View>
  );
}

export default function ShareFeedback() {
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(null);
  const [showThanks, setShowThanks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numbers = Array.from({ length: 11 }, (_, i) => i);

  const handleClose = () => {
    goBack();
  };

  const handleContinue = async () => {
    if (rating === null) return;

    try {
      setIsSubmitting(true);
      // Save feedback experience to backend
      const response = await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: Math.ceil(rating / 2) || 1, // Convert 0-10 to 1-5 for backend
        module: 'restaurant',
        comment: `User rated ${rating}/10 overall experience`,
      });

      if (response.data?.success) {
        setShowThanks(true);
      } else {
        throw new Error(response.data?.message || 'Failed to submit');
      }
    } catch (error) {
      debugError('Error submitting feedback:', error);
      toast.error(error.message || 'Failed to save feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const finish = () => {
    setShowThanks(false);
    navigate('/food/restaurant/explore', { replace: true });
  };

  const disabled = rating === null;

  return (
    <Screen bg={colors.white} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Share your feedback</Text>
        <Pressable onPress={handleClose} accessibilityLabel="Close" style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <X size={20} color={colors.gray[900]} />
        </Pressable>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {/* Question */}
        <View style={styles.question}>
          <Text style={styles.questionSub}>Tell us about your</Text>
          <Text style={styles.questionTitle}>Overall experience with {companyName.toLowerCase()}</Text>
        </View>

        {/* Rating scale */}
        <View style={styles.scaleWrap}>
          <View style={styles.scale}>
            {numbers.map((num) => (
              <ScaleNumber key={num} num={num} rating={rating} first={num === 0} onPress={() => setRating(num)} />
            ))}
          </View>
          <View style={styles.scaleLabels}>
            <Text style={[styles.scaleLabel, { color: restaurantTheme.brand }]}>Very Bad</Text>
            <Text style={[styles.scaleLabel, { color: colors.green[600] }]}>Very Good</Text>
          </View>
          {rating !== null ? <RatedLine rating={rating} /> : null}
        </View>

        {/* Illustration placeholder */}
        <View style={styles.illustrationWrap}>
          <LinearGradient
            colors={[colors.indigo[100], colors.pink[100], colors.yellow[100]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.illustration}
          >
            <View style={styles.bars}>
              <View style={[styles.bar, { height: 80, backgroundColor: colors.indigo[300] }]} />
              <View style={[styles.bar, { height: 128, backgroundColor: colors.pink[300] }]} />
              <View style={[styles.bar, { height: 96, backgroundColor: colors.purple[300] }]} />
              <View style={[styles.bar, { height: 112, backgroundColor: colors.green[300] }]} />
              <View style={[styles.bar, { height: 0, backgroundColor: colors.yellow[300] }]} />
            </View>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Bottom button */}
      <View style={[styles.footer, { paddingBottom: sp(6) + insets.bottom }]}>
        <Pressable
          onPress={handleContinue}
          disabled={disabled || isSubmitting}
          style={({ pressed }) => [styles.continueBtn, disabled && { backgroundColor: colors.gray[200] }, !disabled && pressed && { transform: [{ scale: 0.98 }] }]}
        >
          {!disabled ? <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
          <Text style={[styles.continueText, { color: disabled ? colors.gray[500] : colors.white }]}>Continue</Text>
        </Pressable>
      </View>

      {/* Thank you popup */}
      <Dialog open={showThanks} onClose={finish} backdropOpacity={0.5} style={styles.thanksCard}>
        <View style={styles.thanksBody}>
          <View style={styles.thanksIcon}>
            <CheckCircle2 size={28} color={colors.green[600]} />
          </View>
          <Text style={styles.thanksTitle}>Thanks for your feedback</Text>
          <Text style={styles.thanksText}>It helps us improve your experience with {companyName.toLowerCase()}.</Text>
          <Pressable onPress={finish} style={styles.doneBtn}>
            <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(3) },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.gray[900] },
  closeBtn: { padding: sp(2), borderRadius: 9999 },
  content: { paddingHorizontal: sp(4), paddingBottom: sp(4) },
  question: { marginTop: sp(6), marginBottom: sp(6) },
  questionSub: { fontSize: 14, lineHeight: 20, color: colors.gray[700], marginBottom: sp(1) },
  questionTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[900] },
  scaleWrap: { marginBottom: sp(3) },
  scale: { flexDirection: 'row', gap: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: colors.white, overflow: 'hidden' },
  numCell: { flex: 1 },
  numDivider: { borderLeftWidth: 1, borderLeftColor: colors.gray[200] },
  numInner: { paddingVertical: sp(2), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  numText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[900] },
  scaleLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: sp(1) },
  scaleLabel: { fontSize: 12, lineHeight: 16 },
  rated: { marginTop: sp(3), fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  ratedStrong: { fontWeight: '600', color: colors.gray[900] },
  illustrationWrap: { marginTop: sp(10), alignItems: 'center', justifyContent: 'center' },
  illustration: { width: '100%', maxWidth: 320, height: 192, borderRadius: 24, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: sp(6), paddingBottom: sp(6) },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: sp(2), width: '100%', justifyContent: 'space-between' },
  bar: { width: 40, borderRadius: 9999 },
  footer: { paddingHorizontal: sp(4), paddingTop: sp(2) },
  continueBtn: { width: '100%', paddingVertical: sp(3), borderRadius: 9999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  continueText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  thanksCard: { maxWidth: 384, borderRadius: 24, ...shadow.xl },
  thanksBody: { alignItems: 'center', paddingHorizontal: sp(5), paddingTop: sp(5), paddingBottom: sp(6) },
  thanksIcon: { marginBottom: sp(3), width: 48, height: 48, borderRadius: 24, backgroundColor: colors.green[100], alignItems: 'center', justifyContent: 'center' },
  thanksTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900], marginBottom: sp(1), textAlign: 'center' },
  thanksText: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginBottom: sp(4), textAlign: 'center' },
  doneBtn: { width: '100%', paddingVertical: sp(2.5), borderRadius: 9999, overflow: 'hidden', alignItems: 'center' },
  doneText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white },
});
