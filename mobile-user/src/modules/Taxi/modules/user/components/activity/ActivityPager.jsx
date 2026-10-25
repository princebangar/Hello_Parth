// Web: modules/Taxi/modules/user/components/activity/ActivityPager.jsx — Previous / Page x / y / Next.
// Colours follow index.css: white / slate-50 surfaces -> card colour, the black Next button -> yellow accent.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/native/ui';
import { colors } from '@/theme';
import { useUserPalette, USER_SHADOW } from '../../../../shared/context/UserThemeContext';

const ActivityPager = ({ pagination, onPrevious, onNext }) => {
  const p = useUserPalette();
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <View style={[styles.wrap, { borderTopColor: p.border }]}>
      <View style={[styles.box, { borderColor: p.border, backgroundColor: p.cardBg }, USER_SHADOW]}>
        <Pressable
          onPress={onPrevious}
          disabled={!pagination.hasPrevPage}
          style={[styles.btn, { borderColor: p.border, backgroundColor: p.cardBg }, !pagination.hasPrevPage && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: p.textSecondary }]}>Previous</Text>
        </Pressable>
        <View style={[styles.page, { borderColor: p.border, backgroundColor: p.cardBg }]}>
          <Text style={[styles.btnText, { color: p.textMuted }]}>
            Page {pagination.page} / {pagination.totalPages}
          </Text>
        </View>
        <Pressable
          onPress={onNext}
          disabled={!pagination.hasNextPage}
          style={[styles.btn, { borderColor: colors.slate[900], backgroundColor: p.accent }, !pagination.hasNextPage && styles.disabled]}
        >
          <Text style={[styles.btnText, { color: '#0b1220' }]}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 16, borderTopWidth: 1, paddingTop: 16 },
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  btn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  page: { flexShrink: 0, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  btnText: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.3 },
  disabled: { opacity: 0.45 },
});

export default ActivityPager;
