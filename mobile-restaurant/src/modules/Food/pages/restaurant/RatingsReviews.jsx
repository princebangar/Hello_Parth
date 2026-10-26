// Web: pages/restaurant/RatingsReviews.jsx — "Ratings, reviews": banner image, "Your restaurant's rating" badge (the
// web shows a fixed 4.0; the app shows the restaurant's real rating from /food/restaurant/current, "NEW" until rated), "View order ratings" -> /food/restaurant/feedback?tab=reviews, the "Select your concern"
// accordion, "Was this helpful" Yes / Not helpful and their BottomPopups. Same texts, same banner URL.
// Native: lenis smooth scroll -> native ScrollView; the accordion's height / opacity animation -> LayoutAnimation +
// an opacity fade; the banner (w-full h-auto of a 1200x400 image) keeps its 3:1 ratio.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, ChevronRight, Star, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { colors, restaurantTheme, sp } from '@/theme';
import { restaurantAPI } from '@food/api';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
// relative path: same file as @delivery/components/BottomPopup (scripts/check-converted.cjs has no @delivery alias)
import BottomPopup from '../../../DeliveryV2/components/BottomPopup';

const debugLog = () => {};


const accordionItems = [
  {
    id: 1,
    question: "How is my restaurant's rating calculated",
    answer:
      "Your restaurant's rating is calculated based on customer reviews and ratings from delivery and dining orders. The system takes an average of all ratings received, with more recent reviews having slightly more weight.",
  },
  {
    id: 2,
    question: 'Why am I not getting rating on all orders',
    answer:
      'Not all customers leave ratings after their orders. Some customers may skip the rating step, while others may not have the option to rate depending on the order type or platform. Typically, about 30-40% of customers provide ratings.',
  },
  {
    id: 3,
    question: 'Can I call customer to discuss rating',
    answer:
      'Yes, you can contact customers through the order details page if they have provided a phone number. However, please be respectful and professional when discussing ratings.',
  },
  {
    id: 4,
    question: 'How to raise a concern if I think rating was bad due to delivery partner',
    answer:
      "If you believe a low rating was due to delivery partner issues, you can raise a concern through the order details page. Navigate to the specific order, click on 'Raise Concern', and select 'Delivery Partner Issue'.",
  },
  {
    id: 5,
    question: "What if I don't agree with the rating",
    answer:
      "If you disagree with a customer's rating, you can reply to the review publicly to address concerns professionally. You can also raise a concern if you believe the rating violates our guidelines.",
  },
  {
    id: 6,
    question: 'How can I reply on a customer review',
    answer:
      "To reply to a customer review, go to the Reviews section in your restaurant dashboard. Find the review you want to respond to and click the 'Reply' button. Write a professional, courteous response.",
  },
];

function AccordionAnswer({ text }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View style={[styles.answer, { opacity: fade }]}>
      <Text style={styles.answerText}>{text}</Text>
    </Animated.View>
  );
}

export default function RatingsReviews() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [showThankYouPopup, setShowThankYouPopup] = useState(false);
  const [showNotHelpfulPopup, setShowNotHelpfulPopup] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [rating, setRating] = useState(null);

  useEffect(() => {
    let cancelled = false;
    restaurantAPI
      .getCurrentRestaurant()
      .then((response) => {
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (!cancelled && data) setRating({ value: Number(data.rating) || 0, count: Number(data.totalRatings) || 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAccordion = (itemId) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleThankYou = () => {
    setShowThankYouPopup(true);
    setFeedbackSubmitted(true);
  };

  const handleNotHelpful = () => {
    setShowNotHelpfulPopup(true);
    setFeedbackSubmitted(true);
  };

  const handleThankYouPopupClose = () => {
    setShowThankYouPopup(false);
  };

  const handleNotHelpfulPopupClose = () => {
    setShowNotHelpfulPopup(false);
  };

  return (
    <Screen bg={colors.white} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <Text style={styles.headerTitle}>Ratings, reviews</Text>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        {/* Top Banner Section */}
        <View style={styles.bannerWrap}>
          {/* the web used a stock (unsplash) photo here; the app shows the restaurant gradient instead (no sample pictures) */}
          <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner} />
        </View>

        {/* Your Restaurant's Rating Section */}
        <View style={styles.ratingSection}>
          <View style={styles.ratingRow}>
            <View style={styles.flexShrink}>
              <Text style={styles.ratingTitle}>Your restaurant's rating</Text>
              {rating && rating.count > 0 ? (
                <Text style={styles.ratingCount}>{`${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`}</Text>
              ) : null}
            </View>
            <View style={[styles.ratingBadge, !(rating && rating.value > 0) && { backgroundColor: colors.gray[500] }]}>
              <Text style={styles.ratingValue}>{rating == null ? '—' : rating.value > 0 ? rating.value.toFixed(1) : 'NEW'}</Text>
              <Star size={16} color={colors.white} fill={colors.white} />
            </View>
          </View>
          <Pressable onPress={() => navigate('/food/restaurant/feedback?tab=reviews')} style={styles.linkRow}>
            <Text style={styles.linkText}>View order ratings</Text>
            <ChevronRight size={16} color={restaurantTheme.brand} />
          </Pressable>
        </View>

        {/* Select Your Concern Section */}
        <View style={styles.concernSection}>
          <View style={styles.concernCard}>
            <Text style={styles.concernTitle}>Select your concern</Text>
            <View>
              {accordionItems.map((item, index) => {
                const isExpanded = expandedItems.has(item.id);
                return (
                  <View key={item.id}>
                    <Pressable onPress={() => toggleAccordion(item.id)} style={styles.question}>
                      <Text style={styles.questionText}>{item.question}</Text>
                      <ChevronDown size={20} color={colors.gray[900]} style={isExpanded ? { transform: [{ rotate: '180deg' }] } : null} />
                    </Pressable>

                    {index < accordionItems.length - 1 ? <View style={styles.divider} /> : null}

                    {isExpanded ? <AccordionAnswer text={item.answer} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Feedback Section */}
        {!feedbackSubmitted ? (
          <View style={styles.feedback}>
            <Text style={styles.feedbackTitle}>Was this helpful in resolving your query?</Text>
            <View style={styles.feedbackRow}>
              <Pressable onPress={handleThankYou} style={({ pressed }) => [styles.yesBtn, pressed && { backgroundColor: colors.blue[50] }]}>
                <ThumbsUp size={20} color={restaurantTheme.brand} />
                <Text style={styles.yesText}>Yes, thank you</Text>
              </Pressable>
              <Pressable onPress={handleNotHelpful} style={({ pressed }) => [styles.noBtn, pressed && { backgroundColor: colors.gray[50] }]}>
                <ThumbsDown size={20} color={colors.gray[600]} />
                <Text style={styles.noText}>Not helpful</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Thank You Popup */}
      <BottomPopup isOpen={showThankYouPopup} onClose={handleThankYouPopupClose} showHandle>
        <View style={styles.popupBody}>
          <View style={[styles.popupIcon, { backgroundColor: colors.green[100] }]}>
            <ThumbsUp size={32} color={colors.green[600]} />
          </View>
          <Text style={styles.popupTitle}>Thank you!</Text>
          <Text style={styles.popupText}>We're glad we could help resolve your query.</Text>
        </View>
      </BottomPopup>

      {/* Not Helpful Popup */}
      <BottomPopup isOpen={showNotHelpfulPopup} onClose={handleNotHelpfulPopupClose} showHandle>
        <View style={styles.popupBody}>
          <View style={[styles.popupIcon, { backgroundColor: colors.gray[100] }]}>
            <ThumbsDown size={32} color={colors.gray[600]} />
          </View>
          <Text style={styles.popupTitle}>We're sorry</Text>
          <Text style={[styles.popupText, { marginBottom: sp(4) }]}>
            We're sorry this wasn't helpful. Please contact our support team for further assistance.
          </Text>
          <Pressable
            onPress={() => {
              setShowNotHelpfulPopup(false);
              debugLog('Contact support');
            }}
            style={styles.supportBtn}
          >
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.supportText}>Contact Support</Text>
          </Pressable>
        </View>
      </BottomPopup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  ratingCount: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginTop: 2 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 50 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 10 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  scrollContent: { paddingBottom: sp(4) },
  bannerWrap: { width: '100%' },
  banner: { width: '100%', aspectRatio: 3 },
  ratingSection: { paddingHorizontal: sp(4), paddingVertical: sp(4), backgroundColor: colors.white },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(2) },
  ratingTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900], flexShrink: 1 },
  ratingBadge: { backgroundColor: colors.green[600], paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  ratingValue: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1), alignSelf: 'flex-start' },
  linkText: { color: restaurantTheme.brand, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  concernSection: { paddingHorizontal: sp(4), paddingVertical: sp(4) },
  concernCard: { borderWidth: 1, borderColor: colors.gray[100], borderRadius: 10, padding: sp(4) },
  concernTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], marginBottom: sp(4) },
  question: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: sp(3) },
  questionText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.gray[900], fontWeight: '400', paddingRight: sp(4) },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray[300] },
  answer: { paddingBottom: sp(3), paddingTop: sp(1), overflow: 'hidden' },
  answerText: { fontSize: 14, lineHeight: 22.75, color: colors.gray[700], fontWeight: '400' },
  feedback: { paddingHorizontal: sp(4), paddingTop: sp(6), paddingBottom: sp(8) },
  feedbackTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900], textAlign: 'center', marginBottom: sp(4) },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  yesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    borderWidth: 2,
    borderColor: restaurantTheme.brand,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
  },
  yesText: { color: restaurantTheme.brand, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  noBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    borderWidth: 2,
    borderColor: colors.gray[400],
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
  },
  noText: { color: colors.gray[600], fontSize: 14, lineHeight: 20, fontWeight: '600' },
  popupBody: { alignItems: 'center', paddingVertical: sp(6) },
  popupIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
  popupTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900], marginBottom: sp(2), textAlign: 'center' },
  popupText: { fontSize: 14, lineHeight: 20, color: colors.gray[600], textAlign: 'center' },
  supportBtn: { width: '100%', paddingVertical: sp(3), paddingHorizontal: sp(4), borderRadius: 10, overflow: 'hidden', alignItems: 'center' },
  supportText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: '600' },
});
