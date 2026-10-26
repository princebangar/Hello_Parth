// Web: pages/restaurant/DishRatings.jsx — header (back, "Dish Ratings", hint) + the empty-state text. Same texts.
// Native: the sticky white header sits under the status bar (white status-bar area).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { colors, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

export default function DishRatings() {
  const goBack = useRestaurantBackNavigation();

  return (
    <Screen bg={colors.gray[100]} edges={[]}>
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>Dish Ratings</Text>
            <View style={styles.hintRow}>
              <Text style={styles.hint}>Ratings will appear here when customers review dishes.</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.empty}>You haven't received any dish rating yet</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 40 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 10 },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginTop: 2 },
  hint: { fontSize: 12, lineHeight: 16, color: colors.gray[500], flexShrink: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(4) },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.gray[600] },
});
