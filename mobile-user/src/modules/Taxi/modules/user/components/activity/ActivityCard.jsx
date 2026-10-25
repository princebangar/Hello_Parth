// Web: modules/Taxi/modules/user/components/activity/ActivityCard.jsx — one trip / booking row of the Rides tab.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Calendar, ChevronRight, Clock } from 'lucide-react-native';
import { AppImage, Text } from '@/native/ui';
import { colors } from '@/theme';
import { buildAvatarFallback } from './activityHelpers';
import ServiceArt, { ServiceArtBox } from '../ServiceArt';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

// index.css remaps bg-emerald-50 / bg-rose-50 / bg-amber-50 to the soft card colour and border-*-100 stay as they are.
const statusStyle = (tone, p) => {
  if (tone === 'success') return { bg: p.cardSoft, fg: colors.emerald[700], border: colors.emerald[100] };
  if (tone === 'danger') return { bg: p.cardSoft, fg: colors.rose[700], border: colors.rose[100] };
  return { bg: p.cardSoft, fg: colors.amber[700], border: colors.amber[100] };
};

const ActivityCard = ({ type, title, address, date, time, status, statusTone, price, onClick, onPress, driverName, driverImage, vehicleImage, eyebrow }) => {
  const p = useUserPalette();
  const [driverBroken, setDriverBroken] = useState(false);
  const resolvedDriverImage = driverBroken ? buildAvatarFallback(driverName) : driverImage;
  // No picture (or it fails to load) -> a vehicle glyph, never a leftover placeholder image.
  const artHint = type === 'parcel' ? 'parcel' : type === 'bus' ? 'bus' : title;
  const tone = statusStyle(statusTone, p);
  const handlePress = onPress || onClick;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.row}>
        <View style={styles.artWrap}>
          <ServiceArtBox style={styles.art}>
            <ServiceArt src={vehicleImage} label={type} hint={artHint} size={28} contentFit="cover" />
          </ServiceArtBox>
          <View style={[styles.avatar, { borderColor: p.cardBg, backgroundColor: p.cardBg }]}>
            <AppImage
              src={resolvedDriverImage}
              accessibilityLabel={driverName}
              contentFit="cover"
              style={styles.fill}
              onError={() => setDriverBroken(true)}
            />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={[styles.title, { color: p.textPrimary }]}>
                {title}
              </Text>
              <Text numberOfLines={2} style={[styles.eyebrow, { color: p.textMuted }]}>
                {eyebrow || driverName}
              </Text>
              <Text numberOfLines={2} style={[styles.address, { color: p.textSecondary }]}>
                {address}
              </Text>
            </View>
            <Text style={[styles.price, { color: p.textPrimary }]}>Rs {price}</Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Calendar size={11} strokeWidth={2.4} color={p.textMuted} />
              <Text style={[styles.metaText, { color: p.textMuted }]}>{date}</Text>
            </View>
            <View style={styles.meta}>
              <Clock size={11} strokeWidth={2.4} color={p.textMuted} />
              <Text style={[styles.metaText, { color: p.textMuted }]}>{time}</Text>
            </View>
            <View style={[styles.status, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Text style={[styles.statusText, { color: tone.fg }]}>
                {String(status || '').charAt(0).toUpperCase() + String(status || '').slice(1).toLowerCase()}
              </Text>
            </View>
          </View>
        </View>

        <ChevronRight size={18} strokeWidth={2.4} color={p.textMuted} style={{ marginTop: 4, flexShrink: 0 }} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  card: { width: '100%', borderRadius: 20, padding: 14, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  artWrap: { position: 'relative', height: 64, width: 64, flexShrink: 0 },
  art: { height: 64, width: 64, borderRadius: 16 },
  avatar: { position: 'absolute', bottom: 4, right: 4, height: 28, width: 28, overflow: 'hidden', borderRadius: 14, borderWidth: 2 },
  body: { minWidth: 0, flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 15, lineHeight: 19, fontWeight: '600' },
  eyebrow: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  address: { marginTop: 6, fontSize: 12, lineHeight: 16 },
  price: { flexShrink: 0, paddingLeft: 4, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  metaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, lineHeight: 11, fontWeight: '500' },
  status: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, lineHeight: 11, fontWeight: '600' },
});

export default ActivityCard;
