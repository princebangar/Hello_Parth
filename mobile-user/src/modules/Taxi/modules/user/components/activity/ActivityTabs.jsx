// Web: modules/Taxi/modules/user/components/activity/ActivityTabs.jsx — the pill tab row (All / Rides / Parcels ...).
// The web's right-edge fade mask is a gradient in the card colour over the end of the row.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/native/ui';
import { alpha } from '@/theme';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

// onSelect: the web's onChange (either works)
const ActivityTabs = ({ tabs, activeTab, onChange, onSelect }) => {
  const select = onSelect || onChange;
  const p = useUserPalette();
  return (
    <View style={[styles.wrap, { backgroundColor: p.cardBg, borderBottomColor: p.border }]}>
      <View style={[styles.pillRow, { backgroundColor: p.cardSoft }]}>
        <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={`${String(tab || '').trim() || 'tab'}-${index}`}
                onPress={() => select?.(tab)}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.tab,
                  isActive && [{ backgroundColor: p.accent }, styles.activeShadow],
                  pressed && { transform: [{ scale: 0.99 }] },
                ]}
              >
                <Text style={[styles.tabText, { color: isActive ? p.accentInk : p.textSecondary }]}>{tab}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <LinearGradient pointerEvents="none" colors={[alpha(p.cardSoft, 0), p.cardSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fade} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  pillRow: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, padding: 4, overflow: 'hidden' },
  scroll: { gap: 4 },
  tab: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  activeShadow: { elevation: 3, shadowColor: '#FFC400', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '13%' },
});

export default ActivityTabs;
