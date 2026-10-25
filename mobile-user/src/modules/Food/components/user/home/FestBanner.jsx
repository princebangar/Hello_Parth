import React, { useState, useEffect, useRef } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path } from 'react-native-svg';
import { Utensils, Soup } from 'lucide-react-native';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, makeStyles, radius, shadow, sp } from '@/theme';

// Images for different modes - Extended pool for rotation
const images = {
  nonVeg: [
    "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&h=500&fit=crop", // Taco
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&h=500&fit=crop", // Platter
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop", // Burger
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&h=500&fit=crop", // Grilled Chicken
    "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=500&h=500&fit=crop", // Kebabs
  ],
  veg: [
    "https://images.unsplash.com/photo-1585238341267-1cfec2046a55?w=500&h=500&fit=crop", // Veg Taco
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&h=500&fit=crop", // Salad/Platter
    "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=500&h=500&fit=crop", // Paneer/Veg
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&h=500&fit=crop", // Healthy Bowl
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop", // Veg Pizza
  ]
};

const preloadedFestPools = new Set();
function preloadFestPool(pool, poolKey) {
  if (!pool?.length || preloadedFestPools.has(poolKey)) return;
  preloadedFestPools.add(poolKey);
  ExpoImage.prefetch(pool, 'memory-disk').catch(() => {});
}

const spring = Easing.out(Easing.back(1.3));
const kf = (from, to, ease) =>
  new Keyframe({
    0: { opacity: from.o, transform: [{ translateX: from.x }, { translateY: from.y }, { rotate: from.r }, { scale: from.s }] },
    100: { opacity: to.o, transform: [{ translateX: to.x }, { translateY: to.y }, { rotate: to.r }, { scale: to.s }], ...(ease ? { easing: spring } : {}) },
  }).duration(800);
const LEFT_OUT = { o: 0, x: -100, y: 0, r: '-45deg', s: 0.5 };
const LEFT_IN = { o: 1, x: 0, y: 0, r: '-15deg', s: 1 };
const RIGHT_OUT = { o: 0, x: 100, y: 0, r: '45deg', s: 0.5 };
const RIGHT_IN = { o: 1, x: 0, y: 0, r: '15deg', s: 1 };
const CENTER_START = { o: 0, x: 0, y: 100, r: '0deg', s: 0.5 };
const CENTER_IN = { o: 1, x: 0, y: 0, r: '0deg', s: 1 };
const CENTER_EXIT = { o: 0, x: 0, y: 50, r: '0deg', s: 0.5 };
const enterLeft = kf(LEFT_OUT, LEFT_IN, true);
const exitLeft = kf(LEFT_IN, LEFT_OUT);
const enterRight = kf(RIGHT_OUT, RIGHT_IN, true);
const exitRight = kf(RIGHT_IN, RIGHT_OUT);
const enterCenter = kf(CENTER_START, CENTER_IN, true);
const exitCenter = kf(CENTER_IN, CENTER_EXIT);

function useLoop(duration, delay = 0) {
  const v = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    let loop = null;
    const id = setTimeout(() => {
      loop = RNAnimated.loop(RNAnimated.timing(v, { toValue: 1, duration, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
  }, [v, duration, delay]);
  return v;
}

function Sparks({ lastWhite }) {
  return (
    <View style={{ position: 'absolute', top: -12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 2, height: 8, backgroundColor: '#fff200', borderRadius: 9999, transform: [{ rotate: '-20deg' }] }} />
      <View style={{ width: 2, height: 10, backgroundColor: '#fff200', borderRadius: 9999 }} />
      <View style={{ width: 2, height: 8, backgroundColor: lastWhite ? colors.white : '#fff200', borderRadius: 9999, transform: [{ rotate: '20deg' }] }} />
    </View>
  );
}

function Wave({ bottom }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: 6, ...(bottom ? { bottom: -6 } : { top: -6 }) }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none">
        <Path d={bottom ? "M0 5 Q 25 10, 50 5 T 100 5" : "M0 5 Q 25 0, 50 5 T 100 5"} fill="none" stroke="#fff200" strokeWidth="2" opacity={0.6} />
      </Svg>
    </View>
  );
}

function FestVideo({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.black, 0.35) }} />
    </View>
  );
}

function TitlePop({ children }) {
  const v = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.spring(v, { toValue: 1, damping: 10, stiffness: 100, useNativeDriver: true }).start();
  }, [v]);
  return (
    <RNAnimated.View
      style={{
        marginTop: sp(4),
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      {children}
    </RNAnimated.View>
  );
}

export default function FestBanner({ isVegMode, videoUrl = "", hideFoodImages = false }) {
  const s = useStyles();
  const [imgIndex, setImgIndex] = useState(0);
  const currentPool = isVegMode ? images.veg : images.nonVeg;
  const poolKey = isVegMode ? "veg" : "nonVeg";
  const hasVideo = typeof videoUrl === "string" && videoUrl.trim().length > 0;
  const leftY = useLoop(3500);
  const rightY = useLoop(4000, 400);
  const centerRot = useLoop(6000);
  const bobY = (v) => v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -12, 0] });

  useEffect(() => {
    preloadFestPool(currentPool, poolKey);
  }, [currentPool, poolKey]);

  // Dynamic rotation
  useEffect(() => {
    const timer = setInterval(() => {
      setImgIndex(prev => (prev + 1) % currentPool.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [currentPool.length]);

  // Reset index when mode changes
  useEffect(() => {
    setImgIndex(0);
  }, [isVegMode]);

  // Get 3 images starting from current index
  const displayImages = [
    currentPool[(imgIndex) % currentPool.length],
    currentPool[(imgIndex + 1) % currentPool.length],
    currentPool[(imgIndex + 2) % currentPool.length]
  ];

  return (
    <View style={s.root}>
      {hasVideo && <FestVideo uri={videoUrl} />}

      <View style={s.content}>
        <TitlePop key={isVegMode ? 'veg-title' : 'nonveg-title'}>
          <Text style={s.title}>{isVegMode ? 'VEGGIE DELIGHT' : 'FLAVOUR FEST'}</Text>
        </TitlePop>

        <View style={s.pill}>
          {/* Left Icon with Sparks */}
          <View>
            <Sparks />
            <Utensils size={24} color="#fff200" />
          </View>

          {/* Text with Wavy Lines */}
          <View style={{ paddingHorizontal: sp(2) }}>
            <Wave />
            <Text numberOfLines={1} style={s.pillText}>
              {isVegMode ? 'Pure Veg Magic!' : 'Good Food, Great Mood!'}
            </Text>
            <Wave bottom />
          </View>

          {/* Right Icon with Sparks */}
          <View>
            <Sparks lastWhite />
            <Soup size={28} color="#fff200" />
          </View>
        </View>

        {hideFoodImages ? (
          <View style={{ height: 112 }} />
        ) : (
          <View style={s.trio}>
            <RNAnimated.View style={{ width: 64, height: 64, zIndex: 10, transform: [{ translateY: bobY(leftY) }] }}>
              <Animated.View key={`img-left-${isVegMode}-${imgIndex}`} entering={enterLeft} exiting={exitLeft} style={[s.slotFill, { transform: [{ rotate: '-15deg' }] }]}>
                <AppImage src={displayImages[0]} style={[s.sideImg, { transform: [{ rotate: '12deg' }] }]} contentFit="cover" transition={0} />
              </Animated.View>
            </RNAnimated.View>

            <RNAnimated.View
              style={{
                width: 96,
                height: 96,
                zIndex: 30,
                marginBottom: -sp(2),
                transform: [{ rotate: centerRot.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: ['0deg', '5deg', '-5deg', '0deg'] }) }],
              }}
            >
              <Animated.View key={`img-center-${isVegMode}-${imgIndex}`} entering={enterCenter} exiting={exitCenter} style={s.slotFill}>
                <AppImage src={displayImages[1]} style={s.centerImg} contentFit="cover" transition={0} />
              </Animated.View>
            </RNAnimated.View>

            <RNAnimated.View style={{ width: 64, height: 64, zIndex: 10, transform: [{ translateY: bobY(rightY) }] }}>
              <Animated.View key={`img-right-${isVegMode}-${imgIndex}`} entering={enterRight} exiting={exitRight} style={[s.slotFill, { transform: [{ rotate: '15deg' }] }]}>
                <AppImage src={displayImages[2]} style={[s.sideImg, { backgroundColor: colors.white, transform: [{ rotate: '-12deg' }] }]} contentFit="cover" transition={0} />
              </Animated.View>
            </RNAnimated.View>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { paddingHorizontal: sp(4), paddingTop: sp(2), paddingBottom: sp(4), overflow: 'hidden', minHeight: 140, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, backgroundColor: 'transparent' },
  content: { zIndex: 10, alignItems: 'center', gap: sp(4) },
  title: {
    fontSize: 36,
    lineHeight: 36,
    fontWeight: '900',
    color: colors.white,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'center',
    textShadowColor: '#5a0000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    paddingHorizontal: sp(6),
    paddingVertical: sp(1.5),
    backgroundColor: alpha(colors.white, 0.1),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    ...shadow.xl,
  },
  pillText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.white,
    textShadowColor: alpha(colors.black, 0.25),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  trio: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: sp(5), paddingTop: sp(10), width: '100%', marginBottom: sp(2) },
  slotFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sideImg: { width: '100%', height: '100%', borderRadius: radius['2xl'], borderWidth: 3, borderColor: colors.white, ...shadow['2xl'] },
  centerImg: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.white,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 27,
    shadowOffset: { width: 0, height: 22 },
  },
}));
