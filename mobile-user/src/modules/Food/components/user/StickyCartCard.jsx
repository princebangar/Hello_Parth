// Native conversion of Frontend/src/modules/Food/components/user/StickyCartCard.jsx
// The web card is `position: fixed; bottom: 85px` (above the bottom navigation) — here it is an absolutely
// positioned sibling the parent screen renders outside its scroll view.
import React, { useRef, useState } from "react"
import { Animated, Easing, Pressable, View } from "react-native"
import { X, ChevronRight } from "lucide-react-native"
import { Link } from "@/lib/router"
import { useCart } from "@food/context/CartContext"
import { AppImage, Text } from "@/native/ui"
import { colors, fontSize, makeStyles, radius, shadow, sp } from "@/theme"

export default function StickyCartCard() {
  const { cart, getCartCount } = useCart()
  const [isVisible, setIsVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const exitAnim = useRef(new Animated.Value(0)).current
  const s = useStyles()
  const cartCount = getCartCount()

  // Get restaurant info from first cart item or use default
  const restaurantName = cart[0]?.restaurant || "Restaurant"
  const restaurantImage = cart[0]?.image || "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=200&h=200&fit=crop"

  // Create restaurant slug from restaurant name
  const restaurantSlug = restaurantName.toLowerCase().replace(/\s+/g, "-")

  // Calculate total price (kept from the web, not shown there either)
  // eslint-disable-next-line no-unused-vars
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity * 83), 0)

  // exit variant: opacity 0, scale 0.8, y 100, rotate -5, 0.4s ease [0.4, 0, 0.2, 1]
  const close = () => {
    if (exiting) return
    setExiting(true)
    Animated.timing(exitAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => setIsVisible(false))
  }

  // Close button: whileTap scale 0.9 (spring 400/17)
  const tapScale = useRef(new Animated.Value(1)).current
  const springTap = (to) => Animated.spring(tapScale, { toValue: to, stiffness: 400, damping: 17, mass: 1, useNativeDriver: true }).start()

  // Don't render if cart is empty
  if (cartCount === 0) return null
  if (!isVisible) return null

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        s.wrap,
        {
          opacity: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            { translateY: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 100] }) },
            { scale: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) },
            { rotate: exitAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-5deg"] }) },
          ],
        },
      ]}
    >
      <View style={s.card}>
        <View style={s.row}>
          {/* Restaurant Image */}
          <View style={{ flexShrink: 0 }}>
            <AppImage src={restaurantImage} style={s.image} contentFit="cover" />
          </View>

          {/* Restaurant Info */}
          <Link to={`/food/user/restaurants/${restaurantSlug}`} style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {restaurantName}
            </Text>
            <View style={s.viewMenuRow}>
              <Text style={s.viewMenu}>View Menu</Text>
              <ChevronRight size={12} color={s.viewMenu.color} />
            </View>
          </Link>

          {/* View Cart Button */}
          <Link to="/food/user/cart" style={({ pressed }) => [s.cartBtn, pressed && s.cartBtnPressed]}>
            <View style={{ alignItems: "center" }}>
              <Text style={[s.cartBtnText, { opacity: 0.9 }]}>View Cart</Text>
              <Text style={[s.cartBtnText, { fontWeight: "700" }]}>
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </Text>
            </View>
          </Link>

          {/* Close Button */}
          <Animated.View style={{ transform: [{ scale: tapScale }] }}>
            <Pressable
              onPress={close}
              onPressIn={() => springTap(0.9)}
              onPressOut={() => springTap(1)}
              style={s.closeBtn}
            >
              <X size={16} color={s.closeIcon.color} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  )
}

const useStyles = makeStyles((t) => ({
  // fixed bottom-[85px] left-0 right-0 z-50 px-4 pb-4
  wrap: { position: "absolute", left: 0, right: 0, bottom: 85, zIndex: 50, paddingHorizontal: sp(4), paddingBottom: sp(4) },
  card: {
    backgroundColor: t.dark ? "#0a0a0a" : colors.white,
    borderRadius: radius["3xl"],
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    overflow: "hidden",
    ...shadow["2xl"],
  },
  row: { flexDirection: "row", alignItems: "center", gap: sp(3), padding: sp(3) },
  image: { width: 56, height: 56, borderRadius: radius.lg },
  name: { fontWeight: "700", color: t.dark ? colors.gray[200] : colors.gray[900], ...fontSize.base, marginBottom: 2 },
  viewMenuRow: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  viewMenu: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  cartBtn: {
    flexShrink: 0,
    backgroundColor: t.dark ? "#991B1B" : "#DC2626",
    paddingHorizontal: sp(4),
    paddingVertical: sp(2.5),
    borderRadius: radius.lg,
  },
  cartBtnPressed: { backgroundColor: t.dark ? "#7a0d2a" : "#991B1B" },
  cartBtnText: { ...fontSize.xs, fontWeight: "600", color: colors.white, textAlign: "center" },
  closeBtn: { flexShrink: 0, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  closeIcon: { color: t.dark ? colors.gray[400] : colors.gray[500] },
}))
