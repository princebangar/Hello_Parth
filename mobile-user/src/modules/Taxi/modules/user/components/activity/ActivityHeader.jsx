// Web: modules/Taxi/modules/user/components/activity/ActivityHeader.jsx — back arrow + "Recent activity" header.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

const ActivityHeader = ({ helperText, onBack }) => {
  const p = useUserPalette();
  return (
    <View style={[styles.header, { backgroundColor: p.cardBg, borderBottomColor: p.border }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          accessibilityLabel="Back"
          hitSlop={4}
          style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <ArrowLeft size={22} strokeWidth={2.4} color={p.textPrimary} />
        </Pressable>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={[styles.caption, { color: p.textMuted }]}>My bookings</Text>
          <Text numberOfLines={1} style={[styles.title, { color: p.textPrimary }]}>
            Recent activity
          </Text>
          <Text style={[styles.helper, { color: p.textSecondary }]}>{helperText}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 16 },
  back: { marginLeft: -8, borderRadius: 999, padding: 8 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  title: { marginTop: 2, fontSize: 20, lineHeight: 28, fontWeight: '600', letterSpacing: -0.5 },
  helper: { marginTop: 4, fontSize: 12, lineHeight: 16 },
});

export default ActivityHeader;
