// Native conversion of Frontend/src/modules/Food/components/user/AddToCartButton.jsx
import React from "react"
import { View } from "react-native"
import { Plus, Minus } from "lucide-react-native"
import { Button } from "@food/components/ui/button"
import { useCart } from "@food/context/CartContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useNavigate, useLocation } from "@/lib/router"
import { Text } from "@/native/ui"
import { colors, fontSize, radius, shadow, sp } from "@/theme"

export default function AddToCartButton({ item, style }) {
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const inCart = isInCart(item.id)
  const cartItem = getCartItem(item.id)
  // kept from the web (unused there too)
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate()
  // eslint-disable-next-line no-unused-vars
  const location = useLocation()

  const handleAddToCart = () => {
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'))
      return
    }

    addToCart(item)
  }

  const handleIncrease = () => {
    updateQuantity(item.id, (cartItem?.quantity || 0) + 1)
  }

  const handleDecrease = () => {
    updateQuantity(item.id, (cartItem?.quantity || 0) - 1)
  }

  if (inCart) {
    return (
      <View style={[{ flexDirection: "row", alignItems: "center", gap: sp(2) }, style]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: sp(1),
            backgroundColor: "#DC2626",
            borderRadius: radius.md,
            ...shadow.sm,
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            style={{ height: 32, width: 24, paddingHorizontal: 0 }}
            onPress={handleDecrease}
          >
            <Minus size={16} color={colors.white} />
          </Button>
          <Text
            style={{
              paddingHorizontal: sp(1),
              ...fontSize.sm,
              fontWeight: "700",
              minWidth: 16,
              textAlign: "center",
              color: colors.white,
            }}
          >
            {cartItem?.quantity || 0}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            style={{ height: 32, width: 24, paddingHorizontal: 0 }}
            onPress={handleIncrease}
          >
            <Plus size={16} color={colors.white} />
          </Button>
        </View>
      </View>
    )
  }

  return (
    <Button
      size="sm"
      onPress={handleAddToCart}
      style={{ backgroundColor: "#DC2626", ...shadow.md }}
    >
      <Text style={{ ...fontSize.sm, fontWeight: "700", color: colors.white }}>Add to Cart</Text>
    </Button>
  )
}
