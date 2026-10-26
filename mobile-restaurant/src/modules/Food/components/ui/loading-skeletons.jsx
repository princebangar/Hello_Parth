// Web: modules/Food/components/ui/loading-skeletons.jsx. Same exports and props (className -> style).
// Phone-width layout of each skeleton (sm:/md:/lg: sizes ignored); gradients via expo-linear-gradient, the
// radial glows via react-native-svg.
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { alpha, colors, useTheme } from '@/theme';
import { Skeleton } from '@food/components/ui/skeleton';

const DEFAULT_CARD_COUNT = 4;
const range = (n) => Array.from({ length: n }, (_, i) => i);

/** radial-gradient(circle at <cx cy>, <color> 0, transparent <stop>) as an absolutely filled layer */
function RadialGlow({ id, glows }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {glows.map((g, i) => (
          <RadialGradient key={`${id}-${i}`} id={`${id}-${i}`} cx={g.cx} cy={g.cy} r={g.r} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
            <Stop offset="1" stopColor={g.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {glows.map((g, i) => (
        <Rect key={`r-${i}`} x="0" y="0" width="100%" height="100%" fill={`url(#${id}-${i})`} />
      ))}
    </Svg>
  );
}

function LoadingSkeletonRegion({ label = 'Loading content', style, children }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={style}>
      {children}
    </View>
  );
}

function SkeletonLines({ lines = 3, style, lineStyle }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {range(lines).map((index) => (
        <Skeleton key={`line-${index}`} style={[{ height: 16, borderRadius: 9999, width: index === lines - 1 ? '66.666%' : '100%' }, lineStyle]} />
      ))}
    </View>
  );
}

function HeroBannerSkeleton({ style, compact = false }) {
  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          borderWidth: 1,
          borderColor: alpha('#ffffff', 0.5),
          height: compact ? 160 : 224,
          shadowColor: 'rgb(235,89,14)',
          shadowOpacity: 0.14,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 18 },
          elevation: 6,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['#fff8ef', '#fff0de', '#ffe3c5']}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <RadialGlow
        id="hero"
        glows={[
          { cx: '0%', cy: '0%', r: '30%', color: 'rgb(235,89,14)', opacity: 0.22 },
          { cx: '100%', cy: '100%', r: '28%', color: 'rgb(251,191,36)', opacity: 0.2 },
        ]}
      />
      <View style={{ position: 'relative', flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Skeleton style={{ height: 40, width: 40, borderRadius: 9999, backgroundColor: alpha('#ffffff', 0.6) }} />
          <Skeleton style={{ height: 40, width: 96, borderRadius: 9999, backgroundColor: alpha('#ffffff', 0.65) }} />
        </View>
        <View style={{ maxWidth: '70%', width: '70%', gap: 12 }}>
          <Skeleton style={{ height: 16, width: 96, borderRadius: 9999, backgroundColor: alpha('#ffffff', 0.55) }} />
          <Skeleton style={{ height: 36, width: '75%', borderRadius: 16, backgroundColor: alpha('#ffffff', 0.7) }} />
          <Skeleton style={{ height: 16, width: '66.666%', borderRadius: 9999, backgroundColor: alpha('#ffffff', 0.55) }} />
        </View>
      </View>
    </View>
  );
}

function CategoryChipRowSkeleton({ count = 8, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 12, overflow: 'hidden' }, style]}>
      {range(count).map((index) => (
        <Skeleton
          key={`chip-${index}`}
          style={{ height: 36, flexShrink: 0, flexGrow: 0, borderRadius: 9999, width: index % 3 === 0 ? 112 : index % 2 === 0 ? 96 : 80 }}
        />
      ))}
    </View>
  );
}

function ExploreTileSkeleton() {
  return (
    <View style={{ flexDirection: 'column', alignItems: 'center', gap: 8, width: 80, flexShrink: 0 }}>
      <Skeleton style={{ height: 80, width: 80, borderRadius: 16 }} />
      <Skeleton style={{ height: 12, width: 48, borderRadius: 9999 }} />
    </View>
  );
}

function ExploreGridSkeleton({ count = 6, style, noWrapper = false }) {
  const items = range(count).map((index) => <ExploreTileSkeleton key={`explore-${index}`} />);
  if (noWrapper) return <>{items}</>;
  return <View style={[{ flexDirection: 'row', gap: 16, overflow: 'hidden' }, style]}>{items}</View>;
}

function RestaurantCardSkeleton({ style, compact = false }) {
  const t = useTheme();
  const dark = t.dark;
  const light = (o) => (dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', o));
  return (
    <View style={[{ height: '100%' }, style]}>
      <View
        style={{
          height: '100%',
          overflow: 'hidden',
          borderRadius: 24,
          borderWidth: 1,
          borderColor: dark ? alpha('#ffffff', 0.1) : '#efe2d4',
          backgroundColor: dark ? '#141414' : colors.white,
          shadowColor: 'rgb(15,23,42)',
          shadowOpacity: 0.05,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 18 },
          elevation: 3,
        }}
      >
        <View style={{ position: 'relative', overflow: 'hidden', height: compact ? 160 : 176 }}>
          <LinearGradient
            colors={dark ? ['#262626', '#181818'] : ['#fff7ee', '#ffe7cf']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <RadialGlow
            id={dark ? 'rcd' : 'rcl'}
            glows={[{ cx: '0%', cy: '0%', r: '25%', color: dark ? 'rgb(255,153,102)' : 'rgb(235,89,14)', opacity: dark ? 0.14 : 0.2 }]}
          />
          <Skeleton style={{ position: 'absolute', left: 16, top: 16, height: 32, width: 80, borderRadius: 9999, backgroundColor: light(0.6) }} />
          <Skeleton style={{ position: 'absolute', right: 16, top: 16, height: 36, width: 36, borderRadius: 9999, backgroundColor: light(0.6) }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
            <Skeleton style={{ height: 20, width: '66.666%', borderRadius: 9999, backgroundColor: dark ? alpha('#ffffff', 0.12) : alpha('#ffffff', 0.7) }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Skeleton style={{ height: 16, width: 64, borderRadius: 9999, backgroundColor: light(0.55) }} />
              <Skeleton style={{ height: 16, width: 80, borderRadius: 9999, backgroundColor: light(0.45) }} />
            </View>
          </View>
        </View>
        <View style={{ gap: 16, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ minWidth: 0, flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 20, width: '80%', borderRadius: 9999 }} />
              <Skeleton style={{ height: 16, width: '66.666%', borderRadius: 9999 }} />
            </View>
            <Skeleton style={{ height: 32, width: 48, borderRadius: 12 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Skeleton style={{ height: 16, width: 64, borderRadius: 9999 }} />
            <Skeleton style={{ height: 16, width: 96, borderRadius: 9999 }} />
            <Skeleton style={{ height: 16, width: 80, borderRadius: 9999 }} />
          </View>
          <SkeletonLines lines={2} />
        </View>
      </View>
    </View>
  );
}

function RestaurantGridSkeleton({ count = DEFAULT_CARD_COUNT, style, compact = false }) {
  return (
    <View style={[{ flexDirection: 'column', gap: 16 }, style]}>
      {range(count).map((index) => (
        <RestaurantCardSkeleton key={`restaurant-card-${index}`} compact={compact} style={{ height: undefined }} />
      ))}
    </View>
  );
}

function TableSkeleton({ rows = 8, columns = 6, style }) {
  const t = useTheme();
  const dark = t.dark;
  return (
    <View
      style={[
        {
          overflow: 'hidden',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: dark ? alpha('#ffffff', 0.1) : colors.slate[200],
          backgroundColor: dark ? '#121212' : colors.white,
          elevation: 1,
        },
        style,
      ]}
    >
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: dark ? alpha('#ffffff', 0.1) : colors.slate[200],
          backgroundColor: dark ? alpha('#ffffff', 0.05) : colors.slate[50],
          paddingHorizontal: 24,
          paddingVertical: 16,
          flexDirection: 'row',
          gap: 16,
        }}
      >
        {range(columns).map((index) => (
          <View key={`table-head-${index}`} style={{ flex: 1 }}>
            <Skeleton style={{ height: 12, width: '75%', borderRadius: 9999 }} />
          </View>
        ))}
      </View>
      {range(rows).map((rowIndex) => (
        <View
          key={`table-row-${rowIndex}`}
          style={{
            flexDirection: 'row',
            gap: 16,
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderTopWidth: rowIndex === 0 ? 0 : 1,
            borderTopColor: dark ? alpha('#ffffff', 0.05) : colors.slate[100],
          }}
        >
          {range(columns).map((columnIndex) => (
            <View key={`table-cell-${rowIndex}-${columnIndex}`} style={{ flex: 1 }}>
              <Skeleton
                style={{ height: 16, borderRadius: 9999, width: columnIndex === columns - 1 ? '50%' : columnIndex === 0 ? 48 : '80%' }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function OrdersDashboardSkeleton({ style }) {
  const t = useTheme();
  return (
    <LoadingSkeletonRegion label="Loading orders dashboard" style={[{ gap: 24 }, style]}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.dark ? alpha('#ffffff', 0.1) : colors.slate[200],
          backgroundColor: t.dark ? '#121212' : colors.white,
          padding: 24,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: 'column', gap: 16 }}>
          <View style={{ gap: 12 }}>
            <Skeleton style={{ height: 32, width: 240, borderRadius: 9999 }} />
            <Skeleton style={{ height: 16, width: 144, borderRadius: 9999 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Skeleton style={{ height: 44, width: 288, borderRadius: 12 }} />
            <Skeleton style={{ height: 44, width: 112, borderRadius: 12 }} />
            <Skeleton style={{ height: 44, width: 112, borderRadius: 12 }} />
            <Skeleton style={{ height: 44, width: 44, borderRadius: 12 }} />
          </View>
        </View>
      </View>
      <TableSkeleton rows={8} columns={7} />
    </LoadingSkeletonRegion>
  );
}

function WalletSkeleton({ style }) {
  const t = useTheme();
  return (
    <LoadingSkeletonRegion label="Loading wallet" style={[{ gap: 24 }, style]}>
      <View style={{ flexDirection: 'column', gap: 24 }}>
        <View style={{ flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <Skeleton style={{ height: 96, width: 96, borderRadius: 28 }} />
          <View style={{ gap: 12, alignItems: 'center' }}>
            <Skeleton style={{ height: 32, width: 192, borderRadius: 9999 }} />
            <Skeleton style={{ height: 48, width: 160, borderRadius: 16 }} />
            <Skeleton style={{ height: 20, width: 128, borderRadius: 9999 }} />
            <Skeleton style={{ height: 16, width: 256, borderRadius: 9999 }} />
          </View>
        </View>
        <Skeleton style={{ height: 56, width: '100%', borderRadius: 16 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, overflow: 'hidden' }}>
        <Skeleton style={{ height: 40, width: 96, borderRadius: 9999 }} />
        <Skeleton style={{ height: 40, width: 112, borderRadius: 9999 }} />
        <Skeleton style={{ height: 40, width: 112, borderRadius: 9999 }} />
      </View>
      <View style={{ gap: 16 }}>
        {range(6).map((index) => (
          <View
            key={`wallet-item-${index}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: t.dark ? alpha('#ffffff', 0.1) : colors.slate[200],
              backgroundColor: t.dark ? '#141414' : colors.white,
              padding: 16,
              elevation: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Skeleton style={{ height: 48, width: 48, borderRadius: 16 }} />
              <View style={{ gap: 8 }}>
                <Skeleton style={{ height: 16, width: 160, borderRadius: 9999 }} />
                <Skeleton style={{ height: 12, width: 112, borderRadius: 9999 }} />
              </View>
            </View>
            <View style={{ gap: 8, alignItems: 'flex-end' }}>
              <Skeleton style={{ height: 16, width: 80, borderRadius: 9999 }} />
              <Skeleton style={{ height: 12, width: 64, borderRadius: 9999 }} />
            </View>
          </View>
        ))}
      </View>
    </LoadingSkeletonRegion>
  );
}

function ContentPageSkeleton({ style, hero = true }) {
  const t = useTheme();
  const card = {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: t.dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.5),
    backgroundColor: t.dark ? '#141414' : colors.white,
    padding: 24,
    elevation: 1,
  };
  return (
    <LoadingSkeletonRegion label="Loading page" style={[{ flex: 1 }, style]}>
      <LinearGradient colors={t.dark ? ['#0a0a0a', '#151515'] : [colors.gray[50], colors.white]} style={StyleSheet.absoluteFill} />
      <ScrollView scrollEnabled={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 24 }}>
        <View style={{ marginBottom: 32, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Skeleton style={{ height: 40, width: 40, borderRadius: 9999 }} />
          <Skeleton style={{ height: 32, width: 160, borderRadius: 9999 }} />
        </View>
        {hero ? (
          <View style={[card, { marginBottom: 24 }]}>
            <View style={{ flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <Skeleton style={{ height: 80, width: 80, borderRadius: 9999 }} />
              <Skeleton style={{ height: 32, width: 224, borderRadius: 9999 }} />
              <SkeletonLines style={{ width: '100%' }} lines={3} />
            </View>
          </View>
        ) : null}
        <View style={[card, { gap: 16, borderColor: t.dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.6) }]}>
          <Skeleton style={{ height: 24, width: 192, borderRadius: 9999 }} />
          <SkeletonLines lines={5} />
          <Skeleton style={{ height: 176, width: '100%', borderRadius: 24 }} />
          <SkeletonLines lines={4} />
        </View>
      </ScrollView>
    </LoadingSkeletonRegion>
  );
}

function RestaurantDetailSkeleton({ style }) {
  const t = useTheme();
  const card = {
    borderWidth: 1,
    borderColor: t.dark ? alpha('#ffffff', 0.1) : colors.slate[200],
    backgroundColor: t.dark ? '#141414' : colors.white,
    elevation: 1,
  };
  return (
    <LoadingSkeletonRegion label="Loading restaurant details" style={[{ flex: 1, backgroundColor: t.dark ? '#0a0a0a' : colors.white }, style]}>
      <ScrollView scrollEnabled={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton style={{ height: 44, width: 44, borderRadius: 9999 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton style={{ height: 44, width: 96, borderRadius: 9999 }} />
            <Skeleton style={{ height: 44, width: 44, borderRadius: 9999 }} />
          </View>
        </View>
        <View style={{ marginTop: 20, gap: 20 }}>
          <HeroBannerSkeleton compact style={{ height: 224, borderRadius: 30 }} />
          <View style={[card, { borderRadius: 30, padding: 20 }]}>
            <View style={{ gap: 12 }}>
              <Skeleton style={{ height: 32, width: '75%', borderRadius: 9999 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Skeleton style={{ height: 20, width: 80, borderRadius: 9999 }} />
                <Skeleton style={{ height: 20, width: 96, borderRadius: 9999 }} />
                <Skeleton style={{ height: 20, width: 64, borderRadius: 9999 }} />
              </View>
              <SkeletonLines lines={2} />
            </View>
          </View>
          <CategoryChipRowSkeleton count={5} />
          <View style={{ gap: 16 }}>
            {range(5).map((index) => (
              <View key={`detail-item-${index}`} style={[card, { borderRadius: 24, padding: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{ minWidth: 0, flex: 1, gap: 12 }}>
                    <Skeleton style={{ height: 24, width: '60%', borderRadius: 9999 }} />
                    <Skeleton style={{ height: 16, width: 80, borderRadius: 9999 }} />
                    <SkeletonLines lines={2} />
                  </View>
                  <Skeleton style={{ height: 96, width: 96, borderRadius: 16 }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </LoadingSkeletonRegion>
  );
}

// Food with a last known zone of "out of service": the screen that follows is the out-of-zone screen, not the home,
// (restaurant app: the user app's Taxi / Food boot header is not part of this app; always the generic skeleton)
// eslint-disable-next-line no-unused-vars
function AppShellSkeleton({ style, plain = false }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <LoadingSkeletonRegion label="Loading application" style={[{ flex: 1 }, style]}>
      <LinearGradient colors={t.dark ? ['#0b0b0b', '#151515'] : ['#fffdf9', '#fff8f1']} style={StyleSheet.absoluteFill} />
      {!t.dark ? <RadialGlow id="shell" glows={[{ cx: '0%', cy: '0%', r: '34%', color: '#fff8ef', opacity: 1 }]} /> : null}
      <View style={{ flex: 1, flexDirection: 'column', gap: 24, paddingHorizontal: 20, paddingTop: 24 + insets.top, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Skeleton style={{ height: 44, width: 160, borderRadius: 9999 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton style={{ height: 44, width: 96, borderRadius: 9999 }} />
            <Skeleton style={{ height: 44, width: 44, borderRadius: 9999 }} />
          </View>
        </View>
        <View
          style={{
            borderRadius: 28,
            borderWidth: 1,
            borderColor: t.dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.5),
            backgroundColor: t.dark ? '#141414' : alpha('#ffffff', 0.7),
            padding: 16,
            elevation: 1,
          }}
        >
          <Skeleton style={{ height: 192, width: '100%', borderRadius: 22 }} />
        </View>
        <View style={{ gap: 20, overflow: 'hidden', flex: 1 }}>
          <View style={{ gap: 12 }}>
            <Skeleton style={{ height: 28, width: 208, borderRadius: 9999 }} />
            <CategoryChipRowSkeleton count={5} />
          </View>
          <RestaurantGridSkeleton count={3} />
        </View>
      </View>
    </LoadingSkeletonRegion>
  );
}

function OnboardingSkeleton({ style }) {
  const t = useTheme();
  const dark = t.dark;
  const panel = { backgroundColor: dark ? '#121212' : colors.white };
  const line = { borderColor: dark ? colors.gray[800] : colors.gray[100] };
  const field = (labelW) => (
    <View>
      <Skeleton style={{ height: 12, width: labelW, borderRadius: 8, marginBottom: 8 }} />
      <Skeleton style={{ height: 40, width: '100%', borderRadius: 8 }} />
    </View>
  );
  const cardStyle = [panel, line, { padding: 16, borderRadius: 8, gap: 20, borderWidth: 1 }];
  return (
    <LoadingSkeletonRegion label="Loading onboarding" style={[{ flex: 1, backgroundColor: dark ? '#0a0a0a' : colors.gray[50], flexDirection: 'column' }, style]}>
      <View style={[panel, line, { paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton style={{ width: 36, height: 36, borderRadius: 9999 }} />
          <Skeleton style={{ height: 20, width: 160, borderRadius: 8 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton style={{ height: 16, width: 80, borderRadius: 8 }} />
          <Skeleton style={{ width: 36, height: 36, borderRadius: 9999 }} />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} scrollEnabled={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 24 }}>
        <View style={cardStyle}>
          <Skeleton style={{ height: 24, width: 192, borderRadius: 8 }} />
          <View style={{ gap: 16 }}>
            {field(112)}
            <View>
              <Skeleton style={{ height: 12, width: 144, borderRadius: 8, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Skeleton style={{ height: 32, width: 96, borderRadius: 9999 }} />
                <Skeleton style={{ height: 32, width: 112, borderRadius: 9999 }} />
              </View>
            </View>
          </View>
        </View>
        <View style={cardStyle}>
          <Skeleton style={{ height: 24, width: 128, borderRadius: 8 }} />
          <View style={{ gap: 16 }}>
            {field(80)}
            {field(96)}
            {field(96)}
          </View>
        </View>
        <View style={cardStyle}>
          <Skeleton style={{ height: 24, width: 224, borderRadius: 8 }} />
          <View style={{ gap: 16 }}>
            {field(144)}
            {field(96)}
            {field(112)}
          </View>
        </View>
      </ScrollView>
      <View style={[panel, line, { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'flex-end' }]}>
        <Skeleton style={{ height: 40, width: 112, borderRadius: 8 }} />
      </View>
    </LoadingSkeletonRegion>
  );
}

export {
  AppShellSkeleton,
  CategoryChipRowSkeleton,
  ContentPageSkeleton,
  ExploreGridSkeleton,
  HeroBannerSkeleton,
  LoadingSkeletonRegion,
  OnboardingSkeleton,
  OrdersDashboardSkeleton,
  RestaurantCardSkeleton,
  RestaurantDetailSkeleton,
  RestaurantGridSkeleton,
  SkeletonLines,
  TableSkeleton,
  WalletSkeleton,
};
