// old one (the web page is the same: static sample product table, not linked from any screen)

import React, { useState, useMemo } from "react"
import { Alert, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "expo-blur"
import { ArrowLeft, Star, Clock, MapPin, ShoppingBag, Plus, Minus, Calendar } from "lucide-react-native"
import { useParams, Link, useNavigate } from "@/lib/router"
import { Screen, Text, AppImage } from "@/native/ui"
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import AnimatedPage from "@food/components/user/AnimatedPage"
import Footer from "@food/components/user/Footer"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { useCart } from "@food/context/CartContext"
import { useOrders } from "@food/context/OrdersContext"
import { isModuleAuthenticated } from "@food/utils/auth"

// Sample product data - in a real app, this would come from an API
const productsData = {
  // Featured Dishes
  1: { id: 1, name: "Margherita Pizza", restaurant: "Pizza Corner", restaurantSlug: "pizza-corner", price: 12.99, image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Classic Italian pizza with fresh tomato sauce, mozzarella cheese, and basil leaves. Made with our signature wood-fired crust.", category: "Pizza", ingredients: ["Tomato sauce", "Mozzarella cheese", "Fresh basil", "Olive oil"], preparationTime: "15-20 min", calories: 280 },
  2: { id: 2, name: "Classic Burger", restaurant: "Burger Paradise", restaurantSlug: "burger-paradise", price: 9.99, image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&h=400&fit=crop&q=80", rating: 4.7, description: "Juicy beef patty with fresh lettuce, tomato, onion, and our special sauce. Served on a toasted bun.", category: "Burgers", ingredients: ["Beef patty", "Lettuce", "Tomato", "Onion", "Special sauce", "Bun"], preparationTime: "10-15 min", calories: 520 },
  3: { id: 3, name: "Salmon Sushi Roll", restaurant: "Sushi Master", restaurantSlug: "sushi-master", price: 15.99, image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=600&h=400&fit=crop&q=80", rating: 4.9, description: "Fresh salmon with creamy avocado, wrapped in nori and sushi rice. Served with soy sauce and wasabi.", category: "Sushi", ingredients: ["Fresh salmon", "Avocado", "Nori", "Sushi rice", "Soy sauce", "Wasabi"], preparationTime: "20-25 min", calories: 320 },
  4: { id: 4, name: "Chicken Tacos", restaurant: "Taco Fiesta", restaurantSlug: "taco-fiesta", price: 8.99, image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&h=400&fit=crop&q=80", rating: 4.6, description: "Soft shell tacos with grilled chicken, fresh vegetables, and our signature salsa. Served with lime wedges.", category: "Tacos", ingredients: ["Grilled chicken", "Lettuce", "Tomato", "Onion", "Cheese", "Salsa", "Lime"], preparationTime: "12-15 min", calories: 380 },
  5: { id: 5, name: "Chicken Biryani", restaurant: "Spice Garden", restaurantSlug: "spice-garden", price: 14.99, image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Fragrant basmati rice cooked with tender chicken pieces, aromatic spices, and herbs. Served with raita and pickle.", category: "Indian", ingredients: ["Basmati rice", "Chicken", "Onions", "Spices", "Yogurt", "Herbs"], preparationTime: "30-35 min", calories: 650 },
  6: { id: 6, name: "Pad Thai", restaurant: "Thai Express", restaurantSlug: "thai-express", price: 13.99, image: "https://images.unsplash.com/photo-1559314809-0d155b1c5b8e?w=600&h=400&fit=crop&q=80", rating: 4.7, description: "Stir-fried rice noodles with shrimp, tofu, bean sprouts, and peanuts in a tangy tamarind sauce.", category: "Thai", ingredients: ["Rice noodles", "Shrimp", "Tofu", "Bean sprouts", "Peanuts", "Tamarind sauce"], preparationTime: "18-22 min", calories: 420 },
  7: { id: 7, name: "Grilled Salmon", restaurant: "Ocean Breeze", restaurantSlug: "ocean-breeze", price: 18.99, image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=400&fit=crop&q=80", rating: 4.9, description: "Fresh Atlantic salmon grilled to perfection with lemon butter sauce. Served with seasonal vegetables and rice.", category: "Seafood", ingredients: ["Atlantic salmon", "Lemon", "Butter", "Herbs", "Seasonal vegetables", "Rice"], preparationTime: "25-30 min", calories: 480 },
  8: { id: 8, name: "BBQ Ribs", restaurant: "Smokehouse", restaurantSlug: "smokehouse", price: 16.99, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Slow-cooked pork ribs smothered in our signature BBQ sauce. Served with coleslaw and cornbread.", category: "BBQ", ingredients: ["Pork ribs", "BBQ sauce", "Coleslaw", "Cornbread"], preparationTime: "35-40 min", calories: 720 },
  // Quick Bites
  9: { id: 9, name: "Chicken Wings", restaurant: "Burger Paradise", restaurantSlug: "burger-paradise", price: 8.99, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Crispy fried chicken wings tossed in your choice of sauce. Served with celery sticks and blue cheese dip.", category: "Appetizers", ingredients: ["Chicken wings", "Hot sauce", "Butter", "Celery", "Blue cheese"], preparationTime: "15-18 min", calories: 450 },
  10: { id: 10, name: "French Fries", restaurant: "Burger Paradise", restaurantSlug: "burger-paradise", price: 4.99, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=400&fit=crop&q=80", rating: 4.7, description: "Golden crispy fries made from premium potatoes. Served hot with ketchup.", category: "Sides", ingredients: ["Potatoes", "Salt", "Oil"], preparationTime: "8-10 min", calories: 320 },
  11: { id: 11, name: "Onion Rings", restaurant: "Burger Paradise", restaurantSlug: "burger-paradise", price: 5.99, image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=400&fit=crop&q=80", rating: 4.6, description: "Crispy battered onion rings, perfectly golden and crunchy. Served with dipping sauce.", category: "Sides", ingredients: ["Onions", "Batter", "Oil"], preparationTime: "10-12 min", calories: 280 },
  12: { id: 12, name: "Mozzarella Sticks", restaurant: "Pizza Corner", restaurantSlug: "pizza-corner", price: 6.99, image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=400&fit=crop&q=80", rating: 4.9, description: "Golden fried mozzarella sticks with a crispy exterior and gooey center. Served with marinara sauce.", category: "Appetizers", ingredients: ["Mozzarella cheese", "Breadcrumbs", "Marinara sauce"], preparationTime: "8-10 min", calories: 350 },
  13: { id: 13, name: "Nachos", restaurant: "Taco Fiesta", restaurantSlug: "taco-fiesta", price: 7.99, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Crispy tortilla chips loaded with melted cheese, jalape�os, and your choice of toppings.", category: "Appetizers", ingredients: ["Tortilla chips", "Cheese", "Jalape�os", "Sour cream", "Salsa"], preparationTime: "10-12 min", calories: 420 },
  14: { id: 14, name: "Garlic Bread", restaurant: "Pizza Corner", restaurantSlug: "pizza-corner", price: 4.49, image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=400&fit=crop&q=80", rating: 4.7, description: "Fresh baked bread brushed with garlic butter and herbs. Perfect as a side or appetizer.", category: "Sides", ingredients: ["Bread", "Garlic", "Butter", "Herbs"], preparationTime: "5-8 min", calories: 220 },
  // Trending Now
  15: { id: 15, name: "Spicy Ramen", restaurant: "Noodle House", restaurantSlug: "noodle-house", price: 11.99, image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop&q=80", rating: 4.9, description: "Rich and spicy ramen broth with tender noodles, soft-boiled egg, and fresh vegetables.", category: "Noodles", ingredients: ["Ramen noodles", "Broth", "Egg", "Vegetables", "Spices"], preparationTime: "20-25 min", calories: 480 },
  16: { id: 16, name: "BBQ Chicken Pizza", restaurant: "Pizza Corner", restaurantSlug: "pizza-corner", price: 13.99, image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop&q=80", rating: 4.8, description: "Wood-fired pizza with BBQ sauce, grilled chicken, red onions, and mozzarella cheese.", category: "Pizza", ingredients: ["BBQ sauce", "Grilled chicken", "Red onions", "Mozzarella cheese"], preparationTime: "15-20 min", calories: 380 },
  17: { id: 17, name: "Sushi Platter", restaurant: "Sushi Master", restaurantSlug: "sushi-master", price: 19.99, image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=600&h=400&fit=crop&q=80", rating: 4.9, description: "Assorted sushi platter with salmon, tuna, and California rolls. Served with soy sauce, wasabi, and pickled ginger.", category: "Sushi", ingredients: ["Salmon", "Tuna", "Avocado", "Rice", "Nori", "Soy sauce"], preparationTime: "25-30 min", calories: 450 },
  18: { id: 18, name: "Loaded Burger", restaurant: "Burger Paradise", restaurantSlug: "burger-paradise", price: 10.99, image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&h=400&fit=crop&q=80", rating: 4.7, description: "Double beef patty with bacon, cheese, lettuce, tomato, onion, and special sauce. Served with fries.", category: "Burgers", ingredients: ["Double beef patty", "Bacon", "Cheese", "Lettuce", "Tomato", "Onion", "Special sauce"], preparationTime: "12-15 min", calories: 680 },
}

// Restaurant data
const restaurantsData = {
  "pizza-corner": { name: "Pizza Corner", cuisine: "Italian", rating: 4.7, deliveryTime: "15-20 min", distance: "0.5 km", priceRange: "$$", address: "321 Elm Street, New York, NY 10004", phone: "+1 (555) 456-7890" },
  "burger-paradise": { name: "Burger Paradise", cuisine: "American", rating: 4.6, deliveryTime: "20-25 min", distance: "0.8 km", priceRange: "$", address: "456 Oak Avenue, New York, NY 10002", phone: "+1 (555) 234-5678" },
  "sushi-master": { name: "Sushi Master", cuisine: "Japanese", rating: 4.9, deliveryTime: "30-35 min", distance: "2.1 km", priceRange: "$$$", address: "789 Cherry Lane, New York, NY 10003", phone: "+1 (555) 345-6789" },
  "taco-fiesta": { name: "Taco Fiesta", cuisine: "Mexican", rating: 4.5, deliveryTime: "20-25 min", distance: "1.5 km", priceRange: "$", address: "654 Pine Street, New York, NY 10005", phone: "+1 (555) 567-8901" },
  "spice-garden": { name: "Spice Garden", cuisine: "Indian", rating: 4.8, deliveryTime: "25-30 min", distance: "1.8 km", priceRange: "$$", address: "123 Spice Road, New York, NY 10001", phone: "+1 (555) 123-4567" },
  "thai-express": { name: "Thai Express", cuisine: "Thai", rating: 4.7, deliveryTime: "22-28 min", distance: "1.3 km", priceRange: "$$", address: "456 Thai Street, New York, NY 10002", phone: "+1 (555) 234-5678" },
  "ocean-breeze": { name: "Ocean Breeze", cuisine: "Seafood", rating: 4.9, deliveryTime: "30-35 min", distance: "2.5 km", priceRange: "$$$", address: "789 Ocean Drive, New York, NY 10003", phone: "+1 (555) 345-6789" },
  "smokehouse": { name: "Smokehouse", cuisine: "BBQ", rating: 4.8, deliveryTime: "35-40 min", distance: "2.2 km", priceRange: "$$", address: "321 BBQ Lane, New York, NY 10004", phone: "+1 (555) 456-7890" },
  "noodle-house": { name: "Noodle House", cuisine: "Asian", rating: 4.8, deliveryTime: "20-25 min", distance: "1.1 km", priceRange: "$$", address: "654 Noodle Street, New York, NY 10005", phone: "+1 (555) 567-8901" },
}

// Generate sample reviews
const generateReviews = (productName, totalReviews = 20) => {
  const reviews = []
  const names = ["Alex Johnson", "Sarah Chen", "Michael Brown", "Emily Davis", "David Wilson", "Jessica Martinez", "Chris Anderson", "Amanda Taylor", "Ryan Garcia", "Lisa Thompson"]
  const comments = [
    "Absolutely amazing! The flavors were incredible and the quality was top-notch. Highly recommend!",
    "Great experience overall. Food arrived hot and fresh. Will definitely order again!",
    "One of the best dishes I've tried. The quality is outstanding and prices are reasonable.",
    "Delicious food and fast delivery. The packaging was excellent too. Very satisfied!",
    "Excellent service and amazing food quality. This has become my go-to dish.",
    "The food exceeded my expectations! Everything was perfectly cooked and seasoned.",
    "Fast delivery and great tasting food. The portion sizes are generous too.",
    "Love this dish! The food is always fresh and the flavors are authentic.",
    "Outstanding quality and service. The food arrived on time and was still hot.",
    "Highly recommend! The food is delicious and the customer service is excellent."
  ]

  for (let i = 0; i < Math.min(15, totalReviews); i++) {
    const rating = 3.5 + Math.random() * 1.5
    const roundedRating = Math.round(rating * 10) / 10
    reviews.push({
      id: i + 1,
      userName: names[i % names.length],
      userAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(names[i % names.length])}&background=ffc107&color=fff&size=128`,
      rating: roundedRating,
      comment: comments[i % comments.length],
      date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      helpful: Math.floor(Math.random() * 50),
      verified: Math.random() > 0.3,
      orderType: ["Delivery", "Dine-in", "Takeout"][Math.floor(Math.random() * 3)]
    })
  }

  return reviews.sort((a, b) => b.rating - a.rating)
}


export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const t = useTheme()
  const s = useStyles()
  const product = productsData[parseInt(id)]
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const { getAllOrders } = useOrders()
  const [quantity, setQuantity] = useState(1)
  const [reviews, setReviews] = useState(() =>
    product ? generateReviews(product.name) : []
  )

  const restaurant = product ? restaurantsData[product.restaurantSlug] : null
  const inCart = product ? isInCart(product.id) : false
  const cartItem = product ? getCartItem(product.id) : null
  const orders = getAllOrders()

  // Get order history for this product
  const orderHistory = useMemo(() => {
    if (!product) return []
    return orders.filter(order =>
      order.items?.some(item => item.id === product.id)
    ).slice(0, 5) // Show last 5 orders
  }, [orders, product])

  // Calculate average rating
  const averageRating = useMemo(() => {
    if (reviews.length === 0) return product?.rating || 0
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
    return Math.round((sum / reviews.length) * 10) / 10
  }, [reviews, product])

  const handleAddToCart = async () => {
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'))
      return
    }
    if (product) {
      // One call with the full quantity (N parallel adds raced each other).
      const result = await addToCart({ ...product, quantity })
      if (result?.ok === false) {
        Alert.alert("", result.error || "Cannot add item from different restaurant. Please clear cart first.")
      }
    }
  }

  const handleIncrease = () => {
    if (inCart && cartItem) {
      updateQuantity(product.id, cartItem.quantity + 1)
    } else {
      setQuantity(prev => prev + 1)
    }
  }

  const handleDecrease = () => {
    if (inCart && cartItem) {
      if (cartItem.quantity > 1) {
        updateQuantity(product.id, cartItem.quantity - 1)
      }
    } else {
      setQuantity(prev => Math.max(1, prev - 1))
    }
  }

  const renderStars = (rating, size = 16) => {
    return Array.from({ length: 5 }, (_, i) => {
      const color = i < Math.floor(rating)
        ? colors.yellow[400]
        : i < rating
          ? colors.yellow[200]
          : colors.gray[300]
      return <Star key={i} size={size} color={color} fill={color} />
    })
  }

  const bgColors = t.dark ? ["#0a0a0a", "#0a0a0a", "#0a0a0a"] : [alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]

  if (!product) {
    return (
      <Screen bg={t.bg}>
        <LinearGradient colors={bgColors} style={{ flex: 1 }}>
          <AnimatedPage style={{ flex: 1 }}>
            <View style={s.notFound}>
              <Text style={[s.notFoundTitle, s.fg]}>Product Not Found</Text>
              <Link to="/user">
                {({ pressed }) => (
                  <View style={[s.primaryBtn, pressed && { opacity: 0.9 }]}>
                    <Text style={s.primaryBtnText}>Go Back Home</Text>
                  </View>
                )}
              </Link>
            </View>
          </AnimatedPage>
        </LinearGradient>
      </Screen>
    )
  }

  const ghostIconStyle = ({ pressed }) => [s.ghostIcon, pressed && { backgroundColor: "#F9F9FB" }]

  return (
    <Screen bg={t.bg}>
      <LinearGradient colors={bgColors} style={{ flex: 1 }}>
        <AnimatedPage style={{ flex: 1 }}>
          <ScrollView>
            <View style={{ paddingHorizontal: sp(4) }}>

              {/* Hero Image Section */}
              <View style={s.hero}>
                <AppImage src={product.image} style={s.fill} contentFit="cover" />

                {/* Back Button - Overlay on Image */}
                <View style={s.heroBack}>
                  <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.white }]}>
                    <BlurView intensity={8} tint="light" style={s.absFill} />
                    <ArrowLeft size={20} color={s.fg.color} />
                  </Pressable>
                </View>

                {/* Rating Badge - Top Right */}
                <View style={s.heroRating}>
                  <View style={[s.badge, s.badgeRed, shadow.lg]}>
                    <Star size={12} color={colors.white} fill={colors.white} style={{ marginRight: sp(1) }} />
                    <Text style={s.badgeRedText}>{averageRating}</Text>
                  </View>
                </View>

                {/* Product Info Card Overlay */}
                <View style={s.infoCard}>
                  <View style={s.infoRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.nameRow}>
                        <Text style={s.productName}>{product.name}</Text>
                      </View>
                      <Text style={s.description} numberOfLines={2}>
                        {product.description}
                      </Text>
                      <View style={s.ratingRow}>
                        <View style={s.starsRow}>
                          {renderStars(averageRating, 16)}
                          <Text style={s.avgText}>{averageRating}</Text>
                        </View>
                        <Text style={s.pipe}>|</Text>
                        <Text style={s.reviewsText}>
                          {reviews.length} {reviews.length === 1 ? 'Review' : 'Reviews'}
                        </Text>
                        <Text style={s.pipe}>|</Text>
                        <View style={[s.badge, s.badgeOutline]}>
                          <Text style={[s.badgeOutlineText, s.fg]}>{product.category}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexShrink: 0, alignItems: "flex-end" }}>
                      <Text style={s.price}>₹{(product.price * 83).toFixed(0)}</Text>
                      <Text style={s.perServing}>per serving</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={s.body}>
                {/* Product Info */}
                <ScrollReveal>
                  <View style={{ gap: sp(4) }}>
                    {/* Breadcrumb */}
                    <View style={s.breadcrumb}>
                      <Link to="/user">
                        <Text style={[s.crumb, s.muted]}>Home</Text>
                      </Link>
                      <Text style={[s.crumb, s.muted]}>/</Text>
                      <Text style={[s.crumb, s.fg, { fontWeight: "500", flexShrink: 1 }]} numberOfLines={1}>{restaurant?.name || "Restaurant"}</Text>
                      <Text style={[s.crumb, s.muted]}>/</Text>
                      <Text style={[s.crumb, s.fg, { fontWeight: "500", flexShrink: 1 }]} numberOfLines={1}>{product.name}</Text>
                    </View>
                  </View>
                </ScrollReveal>

                {/* Add to Cart */}
                <ScrollReveal>
                  <View style={s.sectionBorder}>
                    <Text style={[s.h2, s.fg]}>Order</Text>
                    {inCart ? (
                      <View style={s.orderRow}>
                        <View style={[s.qtyBox, { borderColor: "#DC2626" }]}>
                          <Pressable style={ghostIconStyle} onPress={handleDecrease}>
                            <Minus size={20} color={s.fg.color} />
                          </Pressable>
                          <Text style={[s.qtyText, s.fg]}>{cartItem?.quantity || 0}</Text>
                          <Pressable style={ghostIconStyle} onPress={handleIncrease}>
                            <Plus size={20} color={s.fg.color} />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.small, s.muted]}>In cart</Text>
                          <Text style={s.inCartTotal}>₹{(product.price * 83 * (cartItem?.quantity || 0)).toFixed(0)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={s.orderRow}>
                        <View style={[s.qtyBox, { borderColor: colors.gray[300] }]}>
                          <Pressable style={s.ghostIcon} onPress={() => setQuantity(prev => Math.max(1, prev - 1))}>
                            <Minus size={20} color={s.fg.color} />
                          </Pressable>
                          <Text style={[s.qtyText, s.fg]}>{quantity}</Text>
                          <Pressable style={s.ghostIcon} onPress={() => setQuantity(prev => prev + 1)}>
                            <Plus size={20} color={s.fg.color} />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1, alignItems: "flex-start" }}>
                          <Pressable onPress={handleAddToCart} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.9 }]}>
                            <ShoppingBag size={20} color={colors.white} style={{ marginRight: sp(2) }} />
                            <Text style={s.addBtnText}>Add to Cart - ₹{(product.price * 83 * quantity).toFixed(0)}</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </ScrollReveal>

                {/* Restaurant Info */}
                {restaurant && (
                  <ScrollReveal>
                    <View style={[s.sectionBorder, { gap: sp(3) }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View>
                          <Text style={[s.h3, s.fg]}>{restaurant.name}</Text>
                          <Text style={[s.small, s.muted]}>{restaurant.cuisine}</Text>
                        </View>
                        <View style={[s.badge, s.badgeRed]}>
                          <Text style={[s.badgeRedText, { fontSize: 14, lineHeight: 20 }]}>{restaurant.priceRange}</Text>
                        </View>
                      </View>
                      <View style={s.restMeta}>
                        <View style={s.restMetaItem}>
                          <Star size={16} color={colors.yellow[400]} fill={colors.yellow[400]} />
                          <Text style={[s.small, s.fg, { fontWeight: "600" }]}>{restaurant.rating}</Text>
                        </View>
                        <View style={s.restMetaItem}>
                          <Clock size={16} color={s.muted.color} />
                          <Text style={[s.small, s.fg]}>{restaurant.deliveryTime}</Text>
                        </View>
                        <View style={s.restMetaItem}>
                          <MapPin size={16} color={s.muted.color} />
                          <Text style={[s.small, s.fg]}>{restaurant.distance}</Text>
                        </View>
                      </View>
                    </View>
                  </ScrollReveal>
                )}

                {/* Product Details */}
                <ScrollReveal>
                  <View style={s.sectionBorder}>
                    <Text style={[s.h2, s.fg]}>Details</Text>
                    <View style={s.detailsGrid}>
                      <View style={s.detailCell}>
                        <Text style={[s.small, s.muted, { marginBottom: sp(1) }]}>Category</Text>
                        <Text style={[s.small, s.fg, { fontWeight: "600" }]}>{product.category}</Text>
                      </View>
                      <View style={s.detailCell}>
                        <Text style={[s.small, s.muted, { marginBottom: sp(1) }]}>Preparation Time</Text>
                        <Text style={[s.small, s.fg, { fontWeight: "600" }]}>{product.preparationTime}</Text>
                      </View>
                      <View style={s.detailCell}>
                        <Text style={[s.small, s.muted, { marginBottom: sp(1) }]}>Calories</Text>
                        <Text style={[s.small, s.fg, { fontWeight: "600" }]}>{product.calories} kcal</Text>
                      </View>
                      <View style={s.detailCell}>
                        <Text style={[s.small, s.muted, { marginBottom: sp(1) }]}>Ingredients</Text>
                        <Text style={[s.small, s.fg, { fontWeight: "600" }]}>{product.ingredients.length} items</Text>
                      </View>
                    </View>
                    <View>
                      <Text style={[s.small, s.muted, { marginBottom: sp(2) }]}>Ingredients</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp(2) }}>
                        {product.ingredients.map((ingredient, index) => (
                          <View key={index} style={[s.badge, s.badgeOutline]}>
                            <Text style={[s.badgeOutlineText, s.fg]}>{ingredient}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </ScrollReveal>

                {/* Order History */}
                {orderHistory.length > 0 && (
                  <ScrollReveal>
                    <View style={s.sectionBorder}>
                      <Text style={[s.h2, s.fg]}>Your Order History</Text>
                      <View style={{ gap: sp(3) }}>
                        {orderHistory.map((order, index) => (
                          <View key={order.id} style={[s.historyRow, index === orderHistory.length - 1 && { borderBottomWidth: 0 }]}>
                            <View>
                              <Text style={[s.fg, { fontWeight: "600" }]}>Order {order.id}</Text>
                              <View style={s.historyMeta}>
                                <Calendar size={12} color={s.muted.color} />
                                <Text style={[s.small, s.muted]}>{new Date(order.createdAt).toLocaleDateString()}</Text>
                                <Text style={[s.small, s.muted]}>•</Text>
                                <Text style={[s.small, s.muted]}>{order.status}</Text>
                              </View>
                            </View>
                            <View style={[s.badge, s.badgeOutline]}>
                              <Text style={[s.badgeOutlineText, s.fg]}>{order.status}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </ScrollReveal>
                )}
              </View>
            </View>
            <Footer />
          </ScrollView>
        </AnimatedPage>
      </LinearGradient>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fg: { color: t.dark ? "#fafafa" : brand.foreground },
  muted: { color: t.dark ? "#a1a1a1" : brand.mutedForeground },
  notFound: { paddingHorizontal: sp(4), paddingVertical: sp(20), alignItems: "center" },
  notFoundTitle: { ...fontSize["2xl"], fontWeight: "700", marginBottom: sp(4) },
  primaryBtn: { height: 36, paddingHorizontal: sp(4), borderRadius: radius.md, backgroundColor: t.dark ? "#ebebeb" : brand.primary, alignItems: "center", justifyContent: "center", ...shadow.xs },
  primaryBtnText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? "#171717" : brand.primaryForeground },
  hero: { position: "relative", width: "100%", height: 350, overflow: "hidden", borderRadius: radius.lg, marginTop: sp(4) },
  heroBack: { position: "absolute", top: sp(4), left: sp(4), zIndex: 10 },
  backBtn: { width: 36, height: 36, borderRadius: radius.full, overflow: "hidden", backgroundColor: alpha(colors.white, 0.9), alignItems: "center", justifyContent: "center", ...shadow.md },
  heroRating: { position: "absolute", top: sp(4), right: sp(4), zIndex: 10 },
  badge: { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "flex-start", borderRadius: radius.full, borderWidth: 1, borderColor: "transparent", paddingHorizontal: sp(2), paddingVertical: sp(0.5), gap: sp(1) },
  badgeRed: { backgroundColor: "#DC2626" },
  badgeRedText: { ...fontSize.xs, fontWeight: "500", color: colors.white },
  badgeOutline: { borderColor: t.dark ? alpha("#ffffff", 0.1) : brand.border },
  badgeOutlineText: { ...fontSize.xs, fontWeight: "500" },
  infoCard: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"], padding: sp(4) },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(4) },
  nameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: sp(2) },
  productName: { ...fontSize.xl, lineHeight: 25, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  description: { ...fontSize.sm, color: t.dark ? colors.gray[300] : colors.gray[600], marginBottom: sp(2) },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: sp(3), flexWrap: "wrap" },
  starsRow: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  avgText: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  pipe: { color: colors.gray[400], ...fontSize.sm },
  reviewsText: { ...fontSize.sm, color: t.dark ? colors.gray[300] : colors.gray[600], textDecorationLine: "underline" },
  price: { ...fontSize["2xl"], fontWeight: "800", color: "#DC2626" },
  perServing: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
  body: { paddingHorizontal: sp(4), paddingVertical: sp(6), gap: sp(6) },
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: sp(2), flexWrap: "wrap" },
  crumb: { ...fontSize.xs },
  sectionBorder: { gap: sp(4), paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: t.dark ? alpha("#ffffff", 0.1) : brand.border },
  h2: { ...fontSize.xl, fontWeight: "700" },
  h3: { ...fontSize.lg, fontWeight: "700" },
  small: { ...fontSize.sm },
  orderRow: { flexDirection: "row", alignItems: "center", gap: sp(4) },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: sp(2), borderWidth: 1, borderRadius: radius.lg },
  ghostIcon: { height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  qtyText: { paddingHorizontal: sp(4), ...fontSize.lg, fontWeight: "600", minWidth: 32, textAlign: "center" },
  inCartTotal: { ...fontSize.lg, fontWeight: "700", color: "#DC2626" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 36, paddingHorizontal: sp(3), borderRadius: radius.md, backgroundColor: "#DC2626", ...shadow.xs },
  addBtnText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
  restMeta: { flexDirection: "row", alignItems: "center", gap: sp(4), flexWrap: "wrap" },
  restMetaItem: { flexDirection: "row", alignItems: "center", gap: sp(1.5) },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: sp(4) },
  detailCell: { width: "50%", paddingRight: sp(2) },
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: t.dark ? alpha("#ffffff", 0.1) : brand.border },
  historyMeta: { flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: sp(1) },
}))
