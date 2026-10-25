import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import discountPromoIcon from "@food/assets/category-icons/discount_promo.png";
import vegPromoIcon from "@food/assets/category-icons/veg_promo.png";
import pricePromoIcon from "@food/assets/category-icons/price_promo.png";
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, makeStyles, shadow, sp, useTheme } from '@/theme';

export default function PromoRow({ handleVegModeChange, navigate, isVegMode, toggleRef }) {
  const s = useStyles();
  const t = useTheme();
  const promoCardsData = [
    {
      id: 'offers',
      title: "MIN.",
      value: "40% off",
      icon: discountPromoIcon,
      bg: t.dark ? [alpha(colors.rose[950], 0.4), alpha(colors.orange[950], 0.2)] : [colors.rose[50], colors.orange[50]],
      borderColor: t.dark ? alpha(colors.rose[800], 0.4) : alpha(colors.rose[200], 0.6),
      textColor: t.dark ? colors.rose[400] : colors.rose[600],
      iconContainerColor: t.dark ? alpha(colors.rose[400], 0.1) : alpha(colors.rose[500], 0.1),
    },
    {
      id: 'pure-veg',
      title: "PURE",
      value: "Veg",
      icon: vegPromoIcon,
      bg: t.dark ? [alpha(colors.emerald[950], 0.4), alpha(colors.teal[950], 0.2)] : [colors.emerald[50], colors.teal[50]],
      borderColor: t.dark ? alpha(colors.emerald[800], 0.4) : alpha(colors.emerald[200], 0.6),
      textColor: t.dark ? colors.emerald[400] : colors.emerald[600],
      iconContainerColor: t.dark ? alpha(colors.emerald[400], 0.1) : alpha(colors.emerald[500], 0.1),
    },
    {
      id: 'under-250',
      title: "UNDER",
      value: "₹250",
      icon: pricePromoIcon,
      bg: t.dark ? [alpha(colors.amber[950], 0.4), alpha(colors.orange[950], 0.2)] : [colors.amber[50], colors.orange[50]],
      borderColor: t.dark ? alpha(colors.amber[800], 0.4) : alpha(colors.amber[200], 0.6),
      textColor: t.dark ? colors.amber[400] : colors.amber[600],
      iconContainerColor: t.dark ? alpha(colors.amber[400], 0.1) : alpha(colors.amber[500], 0.1),
    },
  ];

  return (
    <View style={s.row}>
      {promoCardsData.map((promo, idx) => {
        const ringed = promo.id === 'pure-veg' && isVegMode;
        return (
          <Pressable
            key={idx}
            ref={promo.id === 'pure-veg' ? toggleRef : null}
            collapsable={false}
            onPress={() => {
              if (promo.id === 'pure-veg') handleVegModeChange(!isVegMode);
              else if (promo.id === 'offers') navigate('/food/user/offers');
              else if (promo.id === 'under-250') navigate('/food/user/under-250');
            }}
            style={({ pressed }) => [
              s.card,
              { borderColor: ringed ? colors.emerald[500] : promo.borderColor, borderWidth: ringed ? 2 : 1 },
              ringed && { ...shadow.lg, shadowColor: colors.emerald[500], shadowOpacity: 0.2 },
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
          >
            <LinearGradient colors={promo.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fill} />
            <View style={s.head}>
              <Text style={s.title}>{promo.title}</Text>
              <Text numberOfLines={1} style={[s.value, { color: promo.textColor }]}>{promo.value}</Text>
            </View>
            <View style={[s.iconBox, { backgroundColor: promo.iconContainerColor }]}>
              <AppImage source={promo.icon} style={s.icon} contentFit="contain" />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: sp(3), paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(6), backgroundColor: t.dark ? '#0a0a0a' : colors.white },
  card: { flex: 1, height: 130, borderRadius: 32, padding: sp(1.5), alignItems: 'center', overflow: 'hidden', ...shadow.sm },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  head: { paddingVertical: sp(2.5), paddingHorizontal: sp(1), alignItems: 'center', width: '100%' },
  title: { fontSize: 9, lineHeight: 9, fontWeight: '900', color: t.dark ? colors.gray[500] : alpha(colors.gray[400], 0.8), letterSpacing: 1.35, textTransform: 'uppercase', marginBottom: sp(1) },
  value: { fontSize: 12, lineHeight: 13, fontWeight: '900', paddingHorizontal: sp(1), textAlign: 'center', width: '100%' },
  iconBox: { flex: 1, width: '100%', borderRadius: 25.6, alignItems: 'center', justifyContent: 'center', padding: sp(2.5), marginTop: 'auto', marginBottom: sp(1), overflow: 'hidden' },
  icon: { width: '100%', height: '100%' },
}));
