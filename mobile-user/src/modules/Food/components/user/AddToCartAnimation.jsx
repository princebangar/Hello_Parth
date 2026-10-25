// Native conversion of Frontend/src/modules/Food/components/user/AddToCartAnimation.jsx
//
// - Fly-to-cart animation when products are added (thumbnail flies from the tapped button into the pill)
// - Fly-back animation when products are removed
// - Pulse animation on cart changes
// - "View cart" pill at bottom center
//
// The web used gsap timelines on fixed-position DOM nodes and getBoundingClientRect(). Here the same timelines run
// with Animated on an overlay that covers the parent screen; positions come from measureInWindow() and the
// sourcePosition the caller stored ({ viewportX, viewportY } in window coordinates, scroll 0).
import React, { useEffect, useRef, useState } from "react"
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Path } from "react-native-svg"
import { useLocation, useNavigate } from "@/lib/router"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import dishFallbackImage from "@food/assets/dish_fallback.webp"
import { AppImage, Text } from "@/native/ui"
import { alpha, colors, shadow, sp } from "@/theme"

// eslint-disable-next-line no-unused-vars
const debugLog = (...args) => {}

const power2Out = Easing.out(Easing.quad)
const power2In = Easing.in(Easing.quad)
const power2InOut = Easing.inOut(Easing.quad)
const power1Out = Easing.out(Easing.sin)
const power1In = Easing.in(Easing.sin)

// "bottom-[92px]" (the web passes a Tailwind class) or a number -> px
const parseBottom = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const m = String(value || "").match(/bottom-\[(\d+(?:\.\d+)?)px\]/)
  if (m) return Number(m[1])
  const n = String(value || "").match(/bottom-(\d+(?:\.\d+)?)/)
  return n ? Number(n[1]) * 4 : null
}

const measure = (ref) =>
  new Promise((resolve) => {
    if (!ref?.current?.measureInWindow) return resolve(null)
    ref.current.measureInWindow((x, y, width, height) => resolve({ left: x, top: y, width, height }))
  })

// Source position in window coordinates. Natively the stored point is already window-relative (a fixed overlay has
// no document scroll), so the web's scroll-delta correction is always 0.
const resolveSourcePoint = (pos) => {
  if (pos.viewportX !== undefined && pos.viewportY !== undefined) {
    return { x: pos.viewportX, y: pos.viewportY }
  }
  return { x: pos.x, y: pos.y }
}

function FlyingThumb({ image, from, delta, rotation, onDone }) {
  const scale = useRef(new Animated.Value(1)).current
  const x = useRef(new Animated.Value(0)).current
  const y = useRef(new Animated.Value(0)).current
  const rot = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const t = (v, toValue, duration, easing) => Animated.timing(v, { toValue, duration, easing, useNativeDriver: true })
    const anim = Animated.sequence([
      // Step 1: Pop out (scale up slightly)
      t(scale, 1.3, 150, power2Out),
      // Step 2: Fly with rotation (slight X overshoot)
      Animated.parallel([
        t(x, delta.x * 0.98, 400, power2InOut),
        t(y, delta.y, 400, power2InOut),
        t(rot, rotation, 400, power2InOut),
        t(scale, 1.1, 400, power2InOut),
      ]),
      // Step 3: Bounce back slightly
      Animated.parallel([t(x, delta.x, 150, power2Out), t(y, delta.y, 150, power2Out), t(scale, 0.9, 150, power2Out)]),
      // Step 4: Final bounce into position
      t(scale, 0.85, 100, power2In),
      // Step 5: Fade out smoothly
      Animated.parallel([t(scale, 0.7, 150, power2In), t(opacity, 0, 150, power2In)]),
    ])
    anim.start(() => onDone?.())
    return () => anim.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flyingThumb,
        {
          left: from.x - 16,
          top: from.y - 16,
          opacity,
          transform: [
            { translateX: x },
            { translateY: y },
            { rotate: rot.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] }) },
            { scale },
          ],
        },
      ]}
    >
      <AppImage src={image || dishFallbackImage} fallback={dishFallbackImage} style={styles.fill} contentFit="cover" />
    </Animated.View>
  )
}

function ThumbnailBubble({ imgSrc, idx }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.spring(anim, { toValue: 1, delay: idx * 100, stiffness: 500, damping: 25, mass: 1, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [anim, idx])
  return (
    <Animated.View style={[styles.thumb, idx > 0 && { marginLeft: -16 }, { opacity: anim, transform: [{ scale: anim }] }]}>
      <AppImage src={imgSrc} fallback={dishFallbackImage} style={styles.fill} contentFit="cover" />
    </Animated.View>
  )
}

export default function AddToCartAnimation({
  bottomOffset = 96,
  pillStyle,
  hideOnPages = true,
  linkTo = '/food/user/cart',
  dynamicBottom = null,
}) {
  const { items, itemCount, total, lastAddEvent, lastRemoveEvent } = useCart();
  const { orderType } = useProfile();
  const isTakeaway = orderType === 'takeaway';
  // Navigate to the correct cart for the active mode
  const cartLinkTo = isTakeaway ? '/food/user/cart' : (linkTo || '/food/user/cart');
  const location = useLocation();
  const navigate = useNavigate();
  const linkRef = useRef(null);
  const rootRef = useRef(null);
  const [removedProduct, setRemovedProduct] = useState(null);
  const [flyingProduct, setFlyingProduct] = useState(null);

  // Hide pill on cart pages, order pages, and account page (if enabled)
  const iscartPage = location.pathname === '/cart' ||
    location.pathname === '/user/cart' ||
    location.pathname.startsWith('/cart/') ||
    location.pathname.startsWith('/user/cart/');
  const isOrderPage = location.pathname.startsWith('/orders/');
  const isAccountPage = location.pathname === '/account';
  const shouldHidePill = hideOnPages && (iscartPage || isOrderPage || isAccountPage);
  const pillVisible = itemCount > 0 && !shouldHidePill

  // Pill enter / exit: spring 400/30/0.8 from { y: 60, opacity: 0, scale: 0.8 }
  const [pillMounted, setPillMounted] = useState(pillVisible)
  const pillAnim = useRef(new Animated.Value(pillVisible ? 1 : 0)).current
  useEffect(() => {
    if (pillVisible) setPillMounted(true)
    const a = Animated.spring(pillAnim, { toValue: pillVisible ? 1 : 0, stiffness: 400, damping: 30, mass: 0.8, useNativeDriver: true })
    a.start(({ finished }) => {
      if (finished && !pillVisible) setPillMounted(false)
    })
    return () => a.stop()
  }, [pillVisible, pillAnim])

  // Positions relative to this overlay (window coordinates minus the overlay origin)
  const toLocal = async (point) => {
    const root = await measure(rootRef)
    return root ? { x: point.x - root.left, y: point.y - root.top } : point
  }

  // Handle removal animation when product is removed (fly from the pill back to the source)
  useEffect(() => {
    if (lastRemoveEvent && lastRemoveEvent.sourcePosition && linkRef.current) {
      const { product, sourcePosition } = lastRemoveEvent;
      const savedSourcePosition = { ...sourcePosition };
      const savedProduct = { ...product };
      let cancelled = false
      const timer = setTimeout(async () => {
        const pillRect = await measure(linkRef)
        if (cancelled || !pillRect) return
        // Start position: first thumbnail of the pill
        const start = await toLocal({ x: pillRect.left + 16, y: pillRect.top + pillRect.height / 2 })
        const target = await toLocal(resolveSourcePoint(savedSourcePosition))
        setRemovedProduct({
          product: savedProduct,
          from: start,
          delta: { x: target.x - start.x, y: target.y - start.y },
          key: Date.now(),
        })
      }, 10)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRemoveEvent]);

  // Handle fly-to-cart animation when product is added
  useEffect(() => {
    if (lastAddEvent && lastAddEvent.sourcePosition) {
      const { product, sourcePosition } = lastAddEvent;
      const savedSourcePosition = { ...sourcePosition };
      const savedProduct = { ...product };
      let cancelled = false
      // Wait a bit longer to ensure pill is fully rendered and in position
      const timer = setTimeout(async () => {
        const pillRect = await measure(linkRef)
        if (cancelled || !pillRect) return
        const end = await toLocal({ x: pillRect.left + pillRect.width / 2, y: pillRect.top + pillRect.height / 2 })
        const source = await toLocal(resolveSourcePoint(savedSourcePosition))
        setFlyingProduct({
          product: savedProduct,
          from: source,
          delta: { x: end.x - source.x, y: end.y - source.y },
          key: Date.now(),
        })
      }, 150)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAddEvent]);

  // Pulse animation when cart changes (but not on removal or fly-to-cart)
  const pulse = useRef(new Animated.Value(1)).current
  const [glow, setGlow] = useState(false)
  useEffect(() => {
    if (itemCount > 0 && linkRef.current && !removedProduct && !flyingProduct && !lastRemoveEvent) {
      pulse.stopAnimation()
      setGlow(true)
      const t = (toValue, duration, easing) => Animated.timing(pulse, { toValue, duration, easing, useNativeDriver: true })
      const a = Animated.sequence([
        t(1.08, 150, power2Out),
        t(1.0, 200, power2InOut),
        t(1.04, 100, power1Out),
        t(1.0, 150, power1In),
      ])
      a.start(() => setGlow(false))
      return () => a.stop()
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, total, removedProduct, flyingProduct, lastRemoveEvent]);

  // Get up to 3 most recently added items for thumbnails
  const safeItems = Array.isArray(items) ? items : [];
  const thumbnailItems = safeItems
    .slice(-3)
    .reverse()
    .filter((item) => item && typeof item === 'object');

  const bottom = dynamicBottom ? (parseBottom(dynamicBottom) ?? 20) : (bottomOffset || 20)

  return (
    <View ref={rootRef} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Removed product thumbnail - flying back to source */}
      {removedProduct && (
        <FlyingThumb
          key={`rm-${removedProduct.key}`}
          image={removedProduct?.product?.imageUrl}
          from={removedProduct.from}
          delta={removedProduct.delta}
          rotation={-360}
          onDone={() => setRemovedProduct(null)}
        />
      )}

      {/* Flying product thumbnail - going to cart */}
      {flyingProduct && (
        <FlyingThumb
          key={`fly-${flyingProduct.key}`}
          image={flyingProduct?.product?.imageUrl}
          from={flyingProduct.from}
          delta={flyingProduct.delta}
          rotation={360}
          onDone={() => setFlyingProduct(null)}
        />
      )}

      {pillMounted && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.pillWrap,
            { bottom },
            {
              opacity: pillAnim,
              transform: [
                { translateY: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                { scale: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
              ],
            },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <Pressable
              ref={linkRef}
              collapsable={false}
              onPress={() => {
                debugLog('View cart clicked, navigating to:', linkTo);
                navigate(cartLinkTo, { state: { from: location.pathname } });
              }}
              style={[styles.pill, glow ? styles.pillGlow : null, pillStyle]}
            >
              <LinearGradient
                colors={["#991b1b", "#DC2626", "#991b1b"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 9999 }]}
              />
              {/* Left: Product thumbnails */}
              <View style={styles.thumbRow}>
                {thumbnailItems.map((item, idx) => {
                  const imgSrc = item?.image || item?.product?.imageUrl || item?.imageUrl || dishFallbackImage
                  return <ThumbnailBubble key={item?.product?.id || item?.id || `thumb-${idx}`} imgSrc={imgSrc} idx={idx} />
                })}
              </View>

              {/* Middle: Text */}
              <SlideIn from={-10} delay={100}>
                <Text style={styles.pillTitle}>{isTakeaway ? 'Takeaway Cart' : 'View cart'}</Text>
                <Text style={styles.pillSub}>
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </Text>
              </SlideIn>

              {/* Right: Arrow icon */}
              <SlideIn from={10} delay={150} style={styles.arrow}>
                <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                  <Path d="M6 12L10 8L6 4" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </SlideIn>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// initial { opacity: 0, x: ±10 } -> animate { opacity: 1, x: 0 } (0.3s, delay)
function SlideIn({ from, delay, style, children }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: 300, delay, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [a, delay])
  return (
    <Animated.View
      style={[
        style,
        { opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  flyingThumb: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: "hidden",
    backgroundColor: colors.white,
    zIndex: 1000,
    elevation: 20,
    ...shadow.lg,
  },
  // left-0 right-0 flex justify-center px-4 pb-4
  pillWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9990,
    elevation: 30,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: sp(4),
    paddingBottom: sp(4),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha("#DC2626", 0.3),
    // shadow-xl shadow-[#DC2626]/30
    elevation: 12,
    shadowColor: "#DC2626",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  pillGlow: { shadowOpacity: 0.4, shadowRadius: 25, shadowOffset: { width: 0, height: 10 } },
  thumbRow: { flexDirection: "row", alignItems: "center" },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: alpha("#ffffff", 0.9),
    overflow: "hidden",
    backgroundColor: colors.white,
    ...shadow.md,
  },
  pillTitle: { fontSize: 12, lineHeight: 15, fontWeight: "700", color: colors.white },
  pillSub: { fontSize: 10, lineHeight: 12.5, fontWeight: "500", color: colors.white, opacity: 0.95 },
  arrow: { marginLeft: "auto", backgroundColor: alpha("#ffffff", 0.25), borderRadius: 9999, padding: sp(1) },
})
