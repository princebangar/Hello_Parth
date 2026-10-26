import React, { useState, useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, Star } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { Screen, Skeleton, Text } from '@/native/ui';
import { colors, fonts, shadow } from '@/theme';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

/**
 * MyReviewsV2 - Reviews given by customers to the logged-in delivery partner.
 */
export const MyReviewsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getMyReviews({ limit: 200 });
        if (response?.data?.success) {
          const data = response.data.data || {};
          setReviews(data.reviews || []);
          setAverageRating(data.averageRating || 0);
          setTotal(data.total || 0);
        }
      } catch {
        toast.error('Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, []);

  const renderStars = (rating) => {
    const count = Math.round(rating || 0);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={16}
            color={s <= count ? colors.amber[400] : colors.gray[300]}
            fill={s <= count ? colors.amber[400] : 'none'}
          />
        ))}
      </View>
    );
  };

  const formatDate = (value) => {
    if (!value) return '';
    try {
      const d = new Date(value);
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[50] }]}>
        <ArrowLeft size={24} color={colors.gray[950]} />
      </Pressable>
      <Star size={20} color={PRIMARY} />
      <Text style={styles.title}>My Reviews</Text>
      {!loading ? (
        <View style={styles.totalPill}>
          <Text style={styles.totalText}>{String(total)}</Text>
        </View>
      ) : null}
    </View>
  );

  const summary = (
    <View style={styles.summary}>
      <View>
        <Text style={styles.summaryLabel}>AVERAGE RATING</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Text style={styles.summaryValue}>{averageRating ? String(averageRating) : '—'}</Text>
          <Star size={24} color={colors.amber[400]} fill={colors.amber[400]} />
        </View>
      </View>
      {renderStars(averageRating)}
    </View>
  );

  const renderReview = ({ item: r }) => (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.customer}>{r.customer}</Text>
        {renderStars(r.rating)}
      </View>
      {r.review ? (
        <Text style={styles.reviewText}>{r.review}</Text>
      ) : (
        <Text style={styles.noReview}>No written feedback</Text>
      )}
      <View style={[styles.rowBetween, { paddingTop: 4 }]}>
        {r.orderId ? <Text style={[styles.meta, { fontFamily: 'monospace' }]}>{`#${r.orderId}`}</Text> : <View />}
        <Text style={styles.meta}>{formatDate(r.submittedAt || r.deliveredAt)}</Text>
      </View>
    </View>
  );

  return (
    <Screen bg={colors.white}>
      {header}

      {loading ? (
        <View style={styles.body}>
          {/* Average rating skeleton */}
          <View style={[styles.skelSummary]}>
            <View style={{ gap: 8 }}>
              <Skeleton width={96} height={12} rounded={4} />
              <Skeleton width={64} height={24} rounded={4} />
            </View>
            <Skeleton width={112} height={20} rounded={4} />
          </View>
          {/* Review card skeletons */}
          {Array.from({ length: 4 }).map((_, idx) => (
            <View key={idx} style={styles.skelCard}>
              <View style={styles.rowBetween}>
                <Skeleton width={112} height={16} rounded={4} />
                <Skeleton width={80} height={16} rounded={4} />
              </View>
              <Skeleton width="100%" height={12} rounded={4} />
              <Skeleton width="66%" height={12} rounded={4} />
            </View>
          ))}
        </View>
      ) : reviews.length === 0 ? (
        <View style={[styles.body, { paddingVertical: 80, alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
          <Star size={40} color={colors.gray[200]} />
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[400] }}>No reviews yet</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, color: colors.gray[400], textAlign: 'center', paddingHorizontal: 32 }}>
            Once customers rate your deliveries, their reviews will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r, idx) => String(r.orderId || idx)}
          renderItem={renderReview}
          ListHeaderComponent={summary}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          ListHeaderComponentStyle={{ marginBottom: 16 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80 }}
        />
      )}
    </Screen>
  );
};

export default MyReviewsV2;

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[50],
    zIndex: 50,
    ...shadow.sm,
  },
  backBtn: { padding: 4, borderRadius: 9999 },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.gray[950], letterSpacing: 0.2 },
  totalPill: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, backgroundColor: colors.slate[100] },
  totalText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[700] },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  skelSummary: { backgroundColor: colors.slate[50], borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1DCEB', ...RX },
  skelCard: { borderWidth: 1, borderColor: '#D1DCEB', borderRadius: 16, padding: 16, gap: 12, backgroundColor: colors.white, ...RX },
  summary: { backgroundColor: colors.amber[50], borderWidth: 1, borderColor: '#D1DCEB', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...RX },
  summaryLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.amber[600], letterSpacing: 0.6 },
  summaryValue: { fontFamily: fonts.sora, fontSize: 30, lineHeight: 36, fontWeight: '900', color: colors.amber[700] },
  card: { borderWidth: 1, borderColor: '#D1DCEB', borderRadius: 16, padding: 16, gap: 8, backgroundColor: colors.white, ...RX },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customer: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  reviewText: { fontSize: 14, lineHeight: 22, color: colors.gray[600] },
  noReview: { fontSize: 14, lineHeight: 20, color: colors.gray[400], fontStyle: 'italic' },
  meta: { fontSize: 11, lineHeight: 16, color: colors.gray[400], fontWeight: '500' },
});
