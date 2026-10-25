import React, { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { Alert, Animated, Dimensions, Easing, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path, Polyline as SvgPolyline } from 'react-native-svg';
import { Plus, Minus, ArrowLeft, ChevronRight, MapPin, Phone, FileText, Utensils, Tag, Percent, Share2, Share, X, Check, CreditCard, Wallet, Sparkles, Banknote, Zap, CheckCircle2, MessageCircle, Send, Mail, Copy, ShoppingBag, AlertTriangle } from 'lucide-react-native';
import { Link, useNavigate, useLocation } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Dialog, Screen, Sheet, Skeleton, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, colors, makeStyles, shadow, sp, useTheme } from '@/theme';

import AnimatedPage from '@food/components/user/AnimatedPage';
import { Button } from '@food/components/ui/button';
import { useCart } from '@food/context/CartContext';
import { useProfile } from '@food/context/ProfileContext';
import { useOrders } from '@food/context/OrdersContext';
import { useLocation as useUserLocation } from '@food/hooks/useLocation';
import { useZone } from '@food/hooks/useZone';
import { useLocationSelector } from '@food/components/user/UserLayout';
import { authAPI, orderAPI, restaurantAPI, adminAPI, userAPI, API_ENDPOINTS } from '@food/api';
import { API_BASE_URL } from '@food/api/config';
import { initRazorpayPayment, preloadRazorpayScript } from '@food/utils/razorpay';
import { getCompanyNameAsync } from '@food/utils/businessSettings';
import { calculateDistance, removePlusCode } from '@food/utils/common';
import { useCompanyName } from '@food/hooks/useCompanyName';
import { getRestaurantAvailabilityStatus } from '@food/utils/restaurantAvailability';
import useAppBackNavigation from '@food/hooks/useAppBackNavigation';
import { filterPublicOffers, mapPublicOfferToCartCoupon } from '@food/utils/offerUtils';
import dishFallbackImage from '@food/assets/dish_fallback.webp';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
import { recallLastKnown, rememberLastKnown } from '@/shared/utils/lastKnown';
import { networkErrorMessage } from '@/shared/utils/networkError';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

// window.alert() of the web
const alert = (message) => Alert.alert('', String(message ?? ''));

const ADDON_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop';

/**
 * Format full address string from address object
 */
const formatFullAddress = (address) => {
  if (!address) return '';

  const looksLikeLatLng = (s) => {
    if (!s) return false;
    const v = String(s).trim();
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v);
  };

  if (address.formattedAddress && address.formattedAddress !== 'Select location') {
    if (!looksLikeLatLng(address.formattedAddress)) {
      return removePlusCode(address.formattedAddress);
    }
  }

  const addressParts = [];
  if (address.street) addressParts.push(address.street);
  if (address.additionalDetails) addressParts.push(address.additionalDetails);
  if (address.city) addressParts.push(address.city);
  if (address.state) addressParts.push(address.state);
  if (address.zipCode) addressParts.push(address.zipCode);

  if (addressParts.length > 0) {
    return removePlusCode(addressParts.join(', '));
  }

  if (address.address && address.address !== 'Select location') {
    return removePlusCode(address.address);
  }

  return '';
};

const RUPEE_SYMBOL = '₹';
const CART_RECIPIENT_DETAILS_STORAGE_KEY = 'food-cart-recipient-details-v1';
const CART_ORDER_NOTE_STORAGE_KEY = 'food-cart-order-note-v1';

// ---------------------------------------------------------------- small native pieces of the web's CSS animations
function useLoop(duration, { delay = 0, easing = Easing.linear } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    const id = setTimeout(() => {
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, delay]);
  return v;
}

function useEnter(duration, { delay = 0, easing = Easing.out(Easing.ease), native = true } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: native }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, delay, native]);
  return v;
}

/** animate-spin ring (border-4 border-t-color) */
function SpinRing({ size, width, color, trackColor }) {
  const v = useLoop(1000);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: trackColor }} />
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: width,
          borderColor: 'transparent',
          borderTopColor: color,
          transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }}
      />
    </View>
  );
}

/** animate-pulse text (the web's "Finding your current address...") */
function PulseText({ style, children }) {
  const v = useLoop(2000, { easing: Easing.inOut(Easing.ease) });
  return (
    <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }) }}>
      <Text style={style}>{children}</Text>
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CONFETTI_COLORS = ['#DC2626', '#3b82f6', '#f59e0b', '#ef4444', '#991B1B', '#ec4899'];

/** The order-success page's 50 falling pieces (confettiFall, infinite) */
function FallingPiece({ seed }) {
  const { width, height } = Dimensions.get('window');
  const cfg = useMemo(
    () => ({
      left: Math.random() * width,
      color: CONFETTI_COLORS[Math.floor(Math.random() * 6)],
      duration: 2000 + Math.random() * 2000,
      delay: Math.random() * 2000,
      rotate: Math.random() * 360,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  );
  const v = useLoop(cfg.duration, { delay: cfg.delay });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.left,
        top: 0,
        width: 12,
        height: 12,
        borderRadius: 2,
        backgroundColor: cfg.color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-height * 0.1, height * 1.1] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${cfg.rotate}deg`, `${cfg.rotate + 720}deg`] }) },
        ],
      }}
    />
  );
}

function SuccessSparkle({ index }) {
  const v = useEnter(600, { delay: 300 + index * 100 });
  const angle = (index * 60 * Math.PI) / 180;
  const dist = v.interpolate({ inputRange: [0, 1], outputRange: [0, -80] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 64 - 4,
        left: 64 - 4,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.yellow[400],
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateX: Animated.multiply(dist, -Math.sin(angle)) },
          { translateY: Animated.multiply(dist, Math.cos(angle)) },
          { scale: v },
        ],
      }}
    />
  );
}

function SlideUpIn({ delay, style, children }) {
  const v = useEnter(500, { delay });
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function OrderSuccessView({ t, s, orderType, restaurantData, defaultAddress, onTrack }) {
  const fade = useEnter(300);
  const scaleIn = useEnter(500, { delay: 200, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const ring = useLoop(1500, { easing: Easing.out(Easing.ease) });
  const check = useEnter(500, { delay: 500, native: false });
  const [seeds] = useState(() => Array.from({ length: 50 }, (_, i) => i));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.successPage, { opacity: fade }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        {seeds.map((i) => (
          <FallingPiece key={i} seed={i} />
        ))}
      </View>

      <View style={s.successContent}>
        <Animated.View style={{ marginBottom: sp(8), opacity: scaleIn, transform: [{ scale: scaleIn }] }}>
          <Animated.View
            style={[
              s.successRing,
              {
                opacity: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0, 0] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.3, 1] }) }],
              },
            ]}
          />
          <LinearGradient
            colors={t.dark ? [colors.green[500], colors.emerald[500]] : [colors.green[500], colors.green[600]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.successCircle}
          >
            <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <AnimatedPath d="M5 12l5 5L19 7" strokeDasharray="100" strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [100, 0] })} />
            </Svg>
          </LinearGradient>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SuccessSparkle key={i} index={i} />
          ))}
        </Animated.View>

        <SlideUpIn delay={600} style={{ alignItems: 'center' }}>
          <View style={s.successLocRow}>
            {orderType === 'takeaway' ? (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.dark ? colors.red[400] : colors.red[500]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <SvgPolyline points="9 22 9 12 15 12 15 22" />
              </Svg>
            ) : (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={t.dark ? colors.red[400] : colors.red[500]}>
                <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </Svg>
            )}
            <Text style={s.successCity}>{orderType === 'takeaway' ? restaurantData?.name || 'Restaurant' : defaultAddress?.city || 'Your Location'}</Text>
          </View>
          <Text style={s.successAddr}>
            {orderType === 'takeaway'
              ? restaurantData?.location
                ? restaurantData.location.addressLine1 ||
                  restaurantData.location.formattedAddress ||
                  restaurantData.location.address ||
                  `${restaurantData.location.city || ''}${restaurantData.location.area ? ', ' + restaurantData.location.area : ''}`
                : restaurantData?.address || restaurantData?.formattedAddress || 'Self-Pickup from Restaurant'
              : defaultAddress
                ? formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || 'Delivery Address'
                : 'Delivery Address'}
          </Text>
        </SlideUpIn>

        <SlideUpIn delay={800} style={{ marginTop: sp(12), alignItems: 'center' }}>
          <Text style={s.successTitle}>Order Placed!</Text>
          <Text style={s.successSub}>{orderType === 'takeaway' ? 'Your delicious food is being prepared for pickup' : 'Your delicious food is on its way'}</Text>
        </SlideUpIn>

        <SlideUpIn delay={1000}>
          <Pressable onPress={onTrack} style={({ pressed }) => [s.trackBtn, pressed && { backgroundColor: '#991B1B' }]}>
            <Text style={s.trackBtnText}>Track Your Order</Text>
          </Pressable>
        </SlideUpIn>
      </View>
    </Animated.View>
  );
}

/** Spinning sunburst + glow of the auto-coupon popup */
function CouponSunburst() {
  const spin = useLoop(80000);
  const glow = useLoop(2000, { easing: Easing.inOut(Easing.ease) });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -64,
          alignSelf: 'center',
          width: 320,
          height: 320,
          opacity: 0.3,
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }}
      >
        <Svg width={320} height={320} viewBox="0 0 100 100" fill={alpha(colors.blue[500], 0.1)}>
          <G opacity={0.12}>
            <Path d="M50 50 L45 0 L55 0 Z" />
            <Path d="M50 50 L95 15 L100 25 Z" />
            <Path d="M50 50 L100 45 L100 55 Z" />
            <Path d="M50 50 L95 85 L85 95 Z" />
            <Path d="M50 50 L55 100 L45 100 Z" />
            <Path d="M50 50 L5 85 L0 75 Z" />
            <Path d="M50 50 L0 55 L0 45 Z" />
            <Path d="M50 50 L5 15 L15 5 Z" />
            <Path d="M50 50 L75 5 L85 15 Z" />
            <Path d="M50 50 L100 75 L95 85 Z" />
            <Path d="M50 50 L25 95 L15 85 Z" />
            <Path d="M50 50 L0 25 L5 15 Z" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: alpha(colors.blue[500], 0.2),
          opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }),
        }}
      />
    </>
  );
}

/** Bill amounts while pricing loads (inline-block h-4 w-12 rounded bg-gray-200 animate-pulse) */
function AmountSkeleton({ width = 48, height = 16, tint }) {
  const t = useTheme();
  return <Skeleton width={width} height={height} rounded={4} style={{ backgroundColor: tint || (t.dark ? colors.gray[700] : colors.gray[200]) }} />;
}

/** Placing-order sheet progress bar + shimmer */
function ProgressBar({ progress }) {
  const shimmer = useLoop(1500);
  return (
    <View style={{ position: 'relative', marginBottom: sp(6) }}>
      <View style={{ height: 10, backgroundColor: colors.gray[200], borderRadius: 999, overflow: 'hidden' }}>
        <LinearGradient colors={['#DC2626', '#991B1B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: `${progress}%`, borderRadius: 999 }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, height: 10, width: `${progress}%`, borderRadius: 999, overflow: 'hidden' }}>
        <Animated.View
          style={{
            width: '100%',
            height: '100%',
            transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-300, 300] }) }],
          }}
        >
          <LinearGradient colors={['transparent', alpha('#ffffff', 0.4), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </View>
  );
}


export default function Cart() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useAppBackNavigation()
  const orderSuccessAudioRef = useRef(null)
  const hasRestoredRecipientRef = useRef(false)
  const hasRestoredNoteRef = useRef(false)

  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef(null)

  // useCart() never throws (outside a CartProvider it returns the default cart), so the web's try/catch around it was dead code
  const cartContext = useCart()

  const { cart, updateQuantity, addToCart, getCartCount, clearCart, cleanCartForRestaurant } = cartContext;
  const { getDefaultAddress, getDefaultPaymentMethod, setDefaultAddress, addresses, paymentMethods, userProfile, orderType, setOrderType } = useProfile()
  const { createOrder } = useOrders()
  const { openLocationSelector } = useLocationSelector()
  const { location: currentLocation, loading: currentLocationLoading } = useUserLocation() // Get live location address

  const [showCouponSheet, setShowCouponSheet] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState(() => {
    try {
      if (typeof window === "undefined") return ""
      return localStorage.getItem("appliedCouponCode") || ""
    } catch {
      return ""
    }
  })
  const [manualCouponCode, setManualCouponCode] = useState(() => {
    try {
      if (typeof window === "undefined") return ""
      return localStorage.getItem("appliedCouponCode") || ""
    } catch {
      return ""
    }
  })

  // Persist coupon code to localStorage
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        if (couponCode) {
          localStorage.setItem("appliedCouponCode", couponCode)
        } else {
          localStorage.removeItem("appliedCouponCode")
        }
      }
    } catch {}
  }, [couponCode])

  // Clear coupon code if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      setAppliedCoupon(null)
      setCouponCode("")
      setManualCouponCode("")
    }
  }, [cart.length])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash")
  const [showPaymentSheet, setShowPaymentSheet] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)
  // Shown balance: the fresh one once loaded, until then the last one seen (null = never seen -> skeleton). The checks
  // ("enough balance?") keep using only the fresh walletBalance.
  const [rememberedWalletBalance] = useState(() => {
    const value = recallLastKnown("food:walletBalance")
    return typeof value === "number" ? value : null
  })
  const [walletBalanceLoaded, setWalletBalanceLoaded] = useState(false)
  const shownWalletBalance = walletBalanceLoaded ? walletBalance : rememberedWalletBalance
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [restaurantNote, setRestaurantNote] = useState(() => {
    try {
      if (typeof window === "undefined") return ""
      const raw = window.localStorage.getItem(CART_ORDER_NOTE_STORAGE_KEY)
      if (!raw) return ""
      const stored = JSON.parse(raw)
      return String(stored?.restaurantNote || "")
    } catch {
      return ""
    }
  })
  const [showRestaurantNoteInput, setShowRestaurantNoteInput] = useState(() => {
    try {
      if (typeof window === "undefined") return false
      const raw = window.localStorage.getItem(CART_ORDER_NOTE_STORAGE_KEY)
      if (!raw) return false
      const stored = JSON.parse(raw)
      const storedRestaurantNote = String(stored?.restaurantNote || "")
      return Boolean(stored?.showRestaurantNoteInput) || storedRestaurantNote.trim().length > 0
    } catch {
      return false
    }
  })
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [isEditingRecipient, setIsEditingRecipient] = useState(false)
  const [recipientDetails, setRecipientDetails] = useState({
    name: "",
    phone: "",
  })

  const [sendCutlery, setSendCutlery] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [showBillDetails, setShowBillDetails] = useState(false)
  const [showPlacingOrder, setShowPlacingOrder] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")
  const [orderProgress, setOrderProgress] = useState(0)
  const [showSavingsCongrats, setShowSavingsCongrats] = useState(false)
  const [congratsSavingsAmount, setCongratssSavingsAmount] = useState(0)
  const [congratsSavingsPercentage, setCongratssSavingsPercentage] = useState(0)
  const [congratsSavingsItems, setCongratssSavingsItems] = useState([])
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  const [orderSuccessSavingsAmount, setOrderSuccessSavingsAmount] = useState(0)
  const [placedOrderId, setPlacedOrderId] = useState(null)
  const [placedOrderObj, setPlacedOrderObj] = useState(null)
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    try {
      if (typeof window === "undefined") return "saved"
      return localStorage.getItem("deliveryAddressMode") || "saved"
    } catch {
      return "saved"
    }
  })


  const [customizationSettings, setCustomizationSettings] = useState({
    cod_enabled: true,
    takeaway_cod_enabled: true,
    delivery_cod_enabled: true,
    dining_cod_enabled: true,
    wallet_payment_enabled: true,
    online_payment_enabled: true,
  })

  useEffect(() => {
    userAPI.getCustomizationSettings()
      .then(res => {
        if (res?.data?.data) {
          setCustomizationSettings(prev => ({
            ...prev,
            ...res.data.data
          }))
        }
      })
      .catch(() => {
        debugError("Failed to fetch customization settings")
      })
  }, [])

  // Payment availability logic
  const isPaymentMethodEnabled = (methodId) => {
    if (methodId === "razorpay") return customizationSettings.online_payment_enabled !== false
    if (methodId === "wallet") return customizationSettings.wallet_payment_enabled !== false
    if (methodId === "cash") {
      if (customizationSettings.cod_blocking_feature_enabled !== false && userProfile?.isCodBlocked) return false
      
      // General COD toggle (Excludes Takeaway)
      if (orderType !== "takeaway") {
        if (customizationSettings.cod_enabled === false) return false
      }

      if (orderType === "takeaway") return customizationSettings.takeaway_cod_enabled !== false
      if (orderType === "delivery") return customizationSettings.delivery_cod_enabled !== false
      if (orderType === "dining") return customizationSettings.dining_cod_enabled !== false
      return true
    }
    return true
  }

  // Auto-switch payment method if current one becomes disabled
  useEffect(() => {
    if (!isPaymentMethodEnabled(selectedPaymentMethod)) {
      if (isPaymentMethodEnabled("cash")) {
        setSelectedPaymentMethod("cash")
      } else if (isPaymentMethodEnabled("razorpay")) {
        setSelectedPaymentMethod("razorpay")
      } else if (isPaymentMethodEnabled("wallet")) {
        setSelectedPaymentMethod("wallet")
      }
    }
  }, [orderType, customizationSettings, selectedPaymentMethod, userProfile])

  // Fetch latest user profile to ensure COD block status is up to date when entering Cart
  useEffect(() => {
    const checkLatestProfile = async () => {
      try {
        const res = await authAPI.getCurrentUser();
        const user = res?.data?.data?.user || res?.data?.user || res?.data;
        if (user && userProfile && user.isCodBlocked !== userProfile.isCodBlocked) {
           window.dispatchEvent(new Event("userAuthChanged"));
        }
      } catch (e) {
        console.error("Error checking latest profile", e);
      }
    };
    if (userProfile) checkLatestProfile();
  }, []);

  useEffect(() => {
    orderSuccessAudioRef.current = null;
  }, [])

  useEffect(() => {
    // No sound on order success
  }, [showOrderSuccess])

  // Auto-transition from savings congratulations to order success after 3 seconds
  useEffect(() => {
    if (!showSavingsCongrats) return
    const timer = setTimeout(() => {
      setShowSavingsCongrats(false)
      setShowOrderSuccess(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [showSavingsCongrats])

  // Cleanup savings data when showing order success
  useEffect(() => {
    if (showOrderSuccess) {
      setCongratssSavingsAmount(0)
      setCongratssSavingsPercentage(0)
      setCongratssSavingsItems([])
    }
  }, [showOrderSuccess])

  // Restaurant and pricing state
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [pricing, setPricing] = useState(null)
  const [loadingPricing, setLoadingPricing] = useState(false)

  // Use backend pricing if available, otherwise fallback to item sums
  const subtotal = pricing?.subtotal || cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)

  // Auto coupon popup state
  const hasShownPromoPopupRef = useRef({ delivery: false, takeaway: false, dining: false })
  const [showAutoCouponPopup, setShowAutoCouponPopup] = useState(false)
  const [bestCoupon, setBestCoupon] = useState(null)
  const bestCouponDiscount = useMemo(() => {
    if (!bestCoupon) return 0
    if (bestCoupon.discountType === "percentage") {
      const raw = subtotal * (Number(bestCoupon.discountPercentage || 0) / 100)
      return Math.round(Number(bestCoupon.maxDiscount) > 0 ? Math.min(raw, Number(bestCoupon.maxDiscount)) : raw)
    }
    return Math.round(Number(bestCoupon.originalPrice || 0))
  }, [bestCoupon, subtotal])

  // Addons state
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)

  // Coupons state - fetched from backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [userOrderCount, setUserOrderCount] = useState(0)

  const filteredCoupons = useMemo(() => {
    const subtotal = pricing?.subtotal || cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
    const filtered = availableCoupons.filter((coupon) => {
      // Filter by order type constraints
      if (coupon.couponType && coupon.couponType !== "all" && coupon.couponType !== orderType) {
        return false
      }
      // Filter out first-time coupons if the user is not a first-time user
      const isFirstTimeOnly = coupon.customerGroup === "new" || coupon.customerGroup === "first-time"
      if (isFirstTimeOnly && userOrderCount > 0) {
        return false
      }
      return true
    })

    // Sort: Applicable coupons first, then by discount value descending based on current subtotal
    return filtered.sort((a, b) => {
      const isApplicableA = subtotal >= (Number(a.minOrder) || 0)
      const isApplicableB = subtotal >= (Number(b.minOrder) || 0)

      if (isApplicableA && !isApplicableB) return -1
      if (!isApplicableA && isApplicableB) return 1

      const discountA = a.discountType === "percentage"
        ? Math.min(subtotal * (Number(a.discountPercentage || 0) / 100), Number(a.maxDiscount) || Infinity)
        : Number(a.originalPrice || 0)
      const discountB = b.discountType === "percentage"
        ? Math.min(subtotal * (Number(b.discountPercentage || 0) / 100), Number(b.maxDiscount) || Infinity)
        : Number(b.originalPrice || 0)
      return discountB - discountA
    })
  }, [availableCoupons, orderType, cart, pricing, userOrderCount])

  // Lock body scroll when auto coupon popup or coupon sheet is open
  // Preload Razorpay SDK as soon as cart opens so the modal appears instantly
  useEffect(() => {
    preloadRazorpayScript()
  }, [])

  // Handle Razorpay redirect callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const razorpay_payment_id = searchParams.get('razorpay_payment_id');
    const razorpay_order_id = searchParams.get('razorpay_order_id');
    const razorpay_signature = searchParams.get('razorpay_signature');
    const error_code = searchParams.get('error[code]');

    if (error_code) {
        toast.error("Payment failed: " + (searchParams.get('error[description]') || "Unknown error"));
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    } else if (razorpay_payment_id && razorpay_order_id && razorpay_signature) {
        const processRedirectPayment = async () => {
            const savedPayloadRaw = window.localStorage.getItem('pendingOrderPayload');
            if (savedPayloadRaw) {
                try {
                    setIsPlacingOrder(true);
                    const orderPayload = JSON.parse(savedPayloadRaw);
                    
                    const createOrderPayload = {
                      ...orderPayload,
                      razorpayOrderId: razorpay_order_id,
                      razorpayPaymentId: razorpay_payment_id,
                      razorpaySignature: razorpay_signature,
                    };

                    const createResponse = await orderAPI.createOrder(createOrderPayload);
                    if (createResponse.data?.success) {
                      const { order } = createResponse.data.data;
                      setPlacedOrderId(order._id || order.orderId);
                      setPlacedOrderObj(order);
                      setShowOrderSuccess(true);
                      window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }));
                      clearCart();
                      setRestaurantNote("");
                      setShowRestaurantNoteInput(false);
                      try { window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY) } catch {}
                      window.localStorage.removeItem('pendingOrderPayload');
                      window.localStorage.removeItem('pendingOrderSavings');
                    }
                } catch (error) {
                    debugError("Order creation after redirect payment error:", error);
                    const errorMessage =
                      error?.response?.data?.message ||
                      error?.message ||
                      "Payment verified but order creation failed. Please contact support.";
                    alert(errorMessage);
                } finally {
                    setIsPlacingOrder(false);
                    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
                }
            }
        };
        processRedirectPayment();
    }
  }, []);
  // (the web locked the page scroll here while a coupon sheet was open; native sheets are modal)

  const renderCartCouponCard = (coupon, { compact = false, blocked = false } = {}) => {
    const meetsMinOrder = subtotal >= (Number(coupon.minOrder) || 0)
    const isApplicable = !blocked && meetsMinOrder

    return (
      <View key={coupon.code} style={[s.couponCard, compact ? s.couponCardCompact : s.couponCardFull, blocked && s.grayed]}>
        <View style={s.couponLeft}>
          <View style={s.couponIcon}>
            <Percent size={16} color="#DC2626" />
          </View>
          <View style={{ minWidth: 0, flex: 1 }}>
            <View style={s.couponTitleRow}>
              <View style={s.couponCodeChip}>
                <Text style={s.couponCodeText}>{String(coupon.code || '').toUpperCase()}</Text>
              </View>
              <Text style={s.couponSave}>{coupon.discountDisplay || `Save ${RUPEE_SYMBOL}${coupon.discount}`}</Text>
            </View>
            <Text style={s.couponDesc} numberOfLines={compact ? 1 : 2}>
              {coupon.description || 'Save flat amount on your order'}
            </Text>
            {blocked ? (
              <Text style={s.couponHint}>Not available for this delivery location</Text>
            ) : !meetsMinOrder ? (
              <Text style={s.couponHint}>
                Add items worth {RUPEE_SYMBOL}
                {Math.max(0, (Number(coupon.minOrder) || 0) - subtotal).toFixed(0)} more to apply
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          disabled={!isApplicable}
          onPress={() => {
            handleApplyCoupon(coupon)
          }}
          style={({ pressed }) => [s.couponApply, isApplicable ? s.couponApplyOn : s.couponApplyOff, pressed && isApplicable && { transform: [{ scale: 0.95 }] }]}
        >
          <Text style={[s.couponApplyText, { color: isApplicable ? '#DC2626' : colors.gray[400] }]}>APPLY</Text>
        </Pressable>
      </View>
    )
  }



  const handleApplyAutoCoupon = () => {
    if (bestCoupon) {
      handleApplyCoupon(bestCoupon)
      setShowAutoCouponPopup(false)
    }
  }

  // Fee settings from database (used for platform fee and GST fallback only)
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryUpTo: 0,
    platformFee: 5,
    packagingFee: 0,
    gstRate: 5,
  })


  const availableTimeSlots = useMemo(() => {
    if (!isScheduled || !scheduledDate || !restaurantData) return []

    try {
      const targetDate = new Date(scheduledDate)
      const status = getRestaurantAvailabilityStatus(restaurantData, targetDate)

      let openingHour = 9
      let closingHour = 22

      if (status.openingTime) {
        const [h] = status.openingTime.split(':')
        openingHour = parseInt(h, 10)
      }

      if (status.closingTime) {
        const [h] = status.closingTime.split(':')
        closingHour = parseInt(h, 10)
      }

      if (closingHour < openingHour) {
        closingHour += 24 // Handle overnight slots
      }

      const slots = []
      const now = new Date()
      // Fix timezone date comparison by comparing date strings YYYY-MM-DD
      const nowStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
      const targetStr = scheduledDate
      const isToday = targetStr === nowStr
      const currentHour = now.getHours()

      for (let h = openingHour; h <= closingHour; h++) {
        const actualHour = h % 24
        // Skip past hours if today. Add 1 hour buffer so they can't order right at the boundary
        if (isToday && h <= currentHour) continue

        const period = actualHour >= 12 ? 'PM' : 'AM'
        const display12 = actualHour % 12 || 12
        const timeString = `${String(actualHour).padStart(2, '0')}:00`
        const displayString = `${display12}:00 ${period}`

        slots.push({ value: timeString, label: displayString })
      }

      return slots
    } catch {
      return []
    }
  }, [isScheduled, scheduledDate, restaurantData])

  // Reset scheduledTime if it's no longer valid in the new slots
  useEffect(() => {
    if (isScheduled && availableTimeSlots.length > 0) {
      const isValid = availableTimeSlots.some(slot => slot.value === scheduledTime)
      if (!isValid) {
        setScheduledTime(availableTimeSlots[0].value)
      }
    } else if (!isScheduled) {
      setScheduledDate("")
      setScheduledTime("")
    }
  }, [isScheduled, availableTimeSlots, scheduledTime])

  const cartCount = getCartCount()
  const getAddressId = (address) => address?.id || address?._id || null
  const normalizeAddressLabel = (label) => {
    if (!label) return ""
    const value = String(label).trim().toLowerCase()
    if (value === "work" || value === "office") return "office"
    if (value === "home") return "home"
    if (value === "other") return "other"
    return value
  }
  const getDisplayAddressLabel = (label) => {
    const normalized = normalizeAddressLabel(label)
    if (normalized === "office") return "Work"
    if (normalized === "home") return "Home"
    if (normalized === "other") return "Other"
    return label || "Saved address"
  }
  const sanitizeRecipientPhone = (value) => String(value || "").replace(/[^\d+]/g, "").slice(0, 14)
  const savedAddress = getDefaultAddress()
  const selectedAddress = addresses.find((addr) => getAddressId(addr) && getAddressId(addr) === selectedAddressId)

  const currentLocationAddress = useMemo(() => {
    // `LocationSelectorOverlay` updates backend + localStorage, but Cart's live hook might lag.
    // So we fall back to `localStorage.userLocation` when `currentLocation` doesn't have a usable payload yet.
    let locFromStorage = null
    try {
      const storedRaw = localStorage.getItem("userLocation")
      locFromStorage = storedRaw ? JSON.parse(storedRaw) : null
    } catch {
      locFromStorage = null
    }

    const loc = currentLocation?.latitude && currentLocation?.longitude ? currentLocation : locFromStorage
    if (!loc?.latitude || !loc?.longitude) return null

    const formattedAddress = loc?.formattedAddress || loc?.address || ""
    if (!formattedAddress || formattedAddress === "Select location") return null

    return {
      // Backend deliveryAddressSchema expects label in ['Home','Office','Other'].
      label: "Home",
      formattedAddress,
      address: formattedAddress,
      street: loc?.street || loc?.address || loc?.area || "Current Location",
      additionalDetails: loc?.area || "",
      city: loc?.city || loc?.area || "Current City",
      state: loc?.state || loc?.city || "Current State",
      zipCode: loc?.postalCode || loc?.zipCode || "",
      phone: userProfile?.phone || "",
      location: {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude], // [lng, lat]
      },
    }
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    currentLocation?.formattedAddress,
    currentLocation?.address,
    currentLocation?.street,
    currentLocation?.area,
    currentLocation?.city,
    currentLocation?.state,
    currentLocation?.postalCode,
    currentLocation?.zipCode,
    userProfile?.phone,
    // Re-evaluate derived address when mode changes (overlay closes -> Cart rerenders).
    deliveryAddressMode,
  ])

  const defaultAddress = useMemo(() => {
    return deliveryAddressMode === "current"
      ? currentLocationAddress || selectedAddress || savedAddress || null
      : selectedAddress || savedAddress || currentLocationAddress || null
  }, [deliveryAddressMode, currentLocationAddress, selectedAddress, savedAddress])

  const hasSavedAddress = Boolean(defaultAddress && formatFullAddress(defaultAddress))
  const recipientName = String(recipientDetails.name || "").trim() || userProfile?.name || "Your Name"
  const recipientPhone = sanitizeRecipientPhone(recipientDetails.phone || "") || userProfile?.phone || ""
  const selectedAddressCoordinates = defaultAddress?.location?.coordinates
  const zoneLocation = selectedAddressCoordinates?.length === 2
    ? {
      latitude: selectedAddressCoordinates[1],
      longitude: selectedAddressCoordinates[0]
    }
    : currentLocation
  const { zoneId, zoneStatus } = useZone(zoneLocation) // Prefer selected/saved address zone
  const defaultPayment = getDefaultPaymentMethod()

  const isCartZoneMismatch = useMemo(() => {
    if (orderType !== "delivery" || !cart.length || !zoneId || zoneStatus === "loading") {
      return false
    }
    const restaurantZoneId = cart[0]?.restaurantZoneId || restaurantData?.zoneId
    if (!restaurantZoneId) return false
    return String(restaurantZoneId).trim() !== String(zoneId).trim()
  }, [orderType, cart, zoneId, zoneStatus, restaurantData?.zoneId])

  useEffect(() => {
    // Sync delivery mode from overlay/localStorage changes.
    // No dependency array: overlay open/close re-renders Cart via provider state update,
    // even when GPS coords don't move enough to update `currentLocation`.
    try {
      const mode = localStorage.getItem("deliveryAddressMode") || "saved"
      setDeliveryAddressMode((prev) => (prev === mode ? prev : mode))
    } catch {
      // ignore
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(CART_RECIPIENT_DETAILS_STORAGE_KEY)
      if (!raw) {
        hasRestoredRecipientRef.current = true
        return
      }

      const stored = JSON.parse(raw)
      setRecipientDetails({
        name: stored?.name || "",
        phone: sanitizeRecipientPhone(stored?.phone || ""),
      })
      setIsEditingRecipient(Boolean(stored?.isEditingRecipient))
    } catch {
      setRecipientDetails({ name: "", phone: "" })
      setIsEditingRecipient(false)
    } finally {
      hasRestoredRecipientRef.current = true
    }
  }, [])

  useEffect(() => {
    setRecipientDetails((prev) => ({
      name: prev.name || userProfile?.name || "",
      phone: prev.phone || userProfile?.phone || "",
    }))
  }, [userProfile?.name, userProfile?.phone])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredRecipientRef.current) return

    try {
      window.localStorage.setItem(
        CART_RECIPIENT_DETAILS_STORAGE_KEY,
        JSON.stringify({
          name: recipientDetails.name || "",
          phone: sanitizeRecipientPhone(recipientDetails.phone || ""),
          isEditingRecipient,
        })
      )
    } catch {
      // Ignore storage errors and keep cart flow working.
    }
  }, [recipientDetails, isEditingRecipient])

  useEffect(() => {
    hasRestoredNoteRef.current = true
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredNoteRef.current) return

    try {
      window.localStorage.setItem(
        CART_ORDER_NOTE_STORAGE_KEY,
        JSON.stringify({
          restaurantNote,
          showRestaurantNoteInput,
        })
      )
    } catch {
      // Ignore storage errors and keep note flow working.
    }
  }, [restaurantNote, showRestaurantNoteInput])

  useEffect(() => {
    if (deliveryAddressMode === "current") {
      setSelectedAddressId(null)
    }
  }, [deliveryAddressMode])

  useEffect(() => {
    const defaultId = getAddressId(savedAddress)
    if (deliveryAddressMode !== "current" && !selectedAddressId && defaultId) {
      setSelectedAddressId(defaultId)
    }
  }, [savedAddress, selectedAddressId, deliveryAddressMode])

  // Get restaurant ID from cart or restaurant data
  // Priority: restaurantData > cart[0].restaurantId
  // DO NOT use cart[0].restaurant as slug fallback - it creates wrong slugs
  const restaurantId = cart.length > 0
    ? (restaurantData?._id || restaurantData?.restaurantId || cart[0]?.restaurantId || null)
    : null

  // Stable restaurant ID for addons fetch (memoized to prevent dependency array issues)
  // Prefer restaurantData IDs (more reliable) over slug from cart
  const restaurantIdForAddons = useMemo(() => {
    // Only use restaurantData if it's loaded, otherwise wait
    if (restaurantData) {
      return restaurantData._id || restaurantData.restaurantId || null
    }
    // If restaurantData is not loaded yet, return null to wait
    return null
  }, [restaurantData])



  // Full-screen modals: the page behind stops scrolling (they cover it) and is scrolled to the top, as on the web
  useEffect(() => {
    if (showPlacingOrder || showOrderSuccess || showSavingsCongrats) {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false })
    }
  }, [showPlacingOrder, showOrderSuccess, showSavingsCongrats])

  // Fetch restaurant data when cart has items
  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (cart.length === 0) {
        if (!showOrderSuccess && !showPlacingOrder && !showSavingsCongrats) {
          setRestaurantData(null)
        }
        return
      }

      // If we already have restaurantData, don't fetch again
      if (restaurantData) {
        return
      }

      setLoadingRestaurant(true)

      // Strategy 1: Try using restaurantId from cart if available
      if (cart[0]?.restaurantId) {
        try {
          const cartRestaurantId = cart[0].restaurantId;
          const cartRestaurantName = cart[0].restaurant;

          debugLog("?? Fetching restaurant data by restaurantId from cart:", cartRestaurantId)
          const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
          const data = response?.data?.data?.restaurant || response?.data?.restaurant

          if (data) {
            // CRITICAL: Validate that fetched restaurant matches cart items
            const fetchedRestaurantId = data.restaurantId || data._id?.toString();
            const fetchedRestaurantName = data.name;

            // Check if restaurantId matches
            const restaurantIdMatches =
              fetchedRestaurantId === cartRestaurantId ||
              data._id?.toString() === cartRestaurantId ||
              data.restaurantId === cartRestaurantId;

            // Check if restaurant name matches (if available in cart)
            const restaurantNameMatches =
              !cartRestaurantName ||
              fetchedRestaurantName?.toLowerCase().trim() === cartRestaurantName.toLowerCase().trim();

            if (!restaurantIdMatches) {
              debugError('? CRITICAL: Fetched restaurant ID does not match cart restaurantId!', {
                cartRestaurantId: cartRestaurantId,
                fetchedRestaurantId: fetchedRestaurantId,
                fetched_id: data._id?.toString(),
                fetched_restaurantId: data.restaurantId,
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Don't set restaurantData if IDs don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            if (!restaurantNameMatches) {
              debugWarn('?? WARNING: Restaurant name mismatch:', {
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Still proceed but log warning
            }

            debugLog("? Restaurant data loaded from cart restaurantId:", {
              _id: data._id,
              restaurantId: data.restaurantId,
              name: data.name,
              cartRestaurantId: cartRestaurantId,
              cartRestaurantName: cartRestaurantName
            })
            setRestaurantData(data)
            setLoadingRestaurant(false)
            return
          }
        } catch (error) {
          debugWarn("?? Failed to fetch by cart restaurantId, trying fallback...", error)
        }
      }

      // Strategy 2: If no restaurantId in cart, search by restaurant name
      if (cart[0]?.restaurant && !restaurantData) {
        try {
          debugLog("?? Searching restaurant by name:", cart[0].restaurant)
          const searchResponse = await restaurantAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []
          debugLog("?? Fetched", restaurants.length, "restaurants for name search")

          // Try exact match first
          let matchingRestaurant = restaurants.find(r =>
            r.name?.toLowerCase().trim() === cart[0].restaurant?.toLowerCase().trim()
          )

          // If no exact match, try partial match
          if (!matchingRestaurant) {
            debugLog("?? No exact match, trying partial match...")
            matchingRestaurant = restaurants.find(r =>
              r.name?.toLowerCase().includes(cart[0].restaurant?.toLowerCase().trim()) ||
              cart[0].restaurant?.toLowerCase().trim().includes(r.name?.toLowerCase())
            )
          }

          if (matchingRestaurant) {
            // CRITICAL: Validate that the found restaurant matches cart items
            const cartRestaurantName = cart[0]?.restaurant?.toLowerCase().trim();
            const foundRestaurantName = matchingRestaurant.name?.toLowerCase().trim();

            if (cartRestaurantName && foundRestaurantName && cartRestaurantName !== foundRestaurantName) {
              debugError("? CRITICAL: Restaurant name mismatch!", {
                cartRestaurantName: cart[0]?.restaurant,
                foundRestaurantName: matchingRestaurant.name,
                cartRestaurantId: cart[0]?.restaurantId,
                foundRestaurantId: matchingRestaurant.restaurantId || matchingRestaurant._id
              });
              // Don't set restaurantData if names don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            debugLog("? Found restaurant by name:", {
              name: matchingRestaurant.name,
              _id: matchingRestaurant._id,
              restaurantId: matchingRestaurant.restaurantId,
              slug: matchingRestaurant.slug,
              cartRestaurantName: cart[0]?.restaurant
            })
            setRestaurantData(matchingRestaurant)
            setLoadingRestaurant(false)
            return
          } else {
            debugWarn("?? Restaurant not found even by name search. Searched in", restaurants.length, "restaurants")
            if (restaurants.length > 0) {
              debugLog("?? Available restaurant names:", restaurants.map(r => r.name).slice(0, 10))
            }
          }
        } catch (searchError) {
          debugWarn("?? Error searching restaurants by name:", searchError)
        }
      }

      // If all strategies fail, set to null
      setRestaurantData(null)
      setLoadingRestaurant(false)
    }

    fetchRestaurantData()
  }, [cart.length, cart[0]?.restaurantId, cart[0]?.restaurant, showOrderSuccess, showPlacingOrder, showSavingsCongrats])

  // Fetch approved addons for the restaurant
  useEffect(() => {
    const fetchAddonsWithId = async (idToUse) => {

      debugLog("?? Addons fetch - Using ID:", {
        restaurantData: restaurantData ? {
          _id: restaurantData._id,
          restaurantId: restaurantData.restaurantId,
          name: restaurantData.name
        } : 'Not loaded',
        cartRestaurantId: restaurantId,
        idToUse: idToUse
      })

      // Convert to string for validation
      const idString = String(idToUse)
      debugLog("?? Restaurant ID string:", idString, "Type:", typeof idString, "Length:", idString.length)

      // Validate ID format (should be ObjectId or restaurantId format)
      const isValidIdFormat = /^[a-zA-Z0-9\-_]+$/.test(idString) && idString.length >= 3

      if (!isValidIdFormat) {
        debugWarn("?? Restaurant ID format invalid:", idString)
        setAddons([])
        return
      }

      try {
        setLoadingAddons(true)
        debugLog("?? Fetching addons for restaurant ID:", idString)
        const response = await restaurantAPI.getAddonsByRestaurantId(idString)
        debugLog("? Addons API response received:", response?.data)
        debugLog("?? Response structure:", {
          success: response?.data?.success,
          data: response?.data?.data,
          addons: response?.data?.data?.addons,
          directAddons: response?.data?.addons
        })

        const data = response?.data?.data?.addons || response?.data?.addons || []
        debugLog("?? Fetched addons count:", data.length)
        debugLog("?? Fetched addons data:", JSON.stringify(data, null, 2))

        if (data.length === 0) {
          debugWarn("?? No addons returned from API. Response:", response?.data)
        } else {
          debugLog("? Successfully fetched", data.length, "addons:", data.map(a => a.name))
        }

        setAddons(data)
      } catch (error) {
        // Log error for debugging
        debugError("? Addons fetch error:", {
          code: error.code,
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
          data: error.response?.data
        })
        // Silently handle network errors and 404 errors
        // Network errors (ERR_NETWORK) happen when backend is not running - this is OK for development
        // 404 errors mean restaurant might not have addons or restaurant not found - also OK
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error fetching addons:", error)
        }
        // Continue with cart even if addons fetch fails
        setAddons([])
      } finally {
        setLoadingAddons(false)
      }
    }

    const fetchAddons = async () => {
      if (cart.length === 0) {
        setAddons([])
        return
      }

      // Wait for restaurantData to be loaded (including fallback search)
      if (loadingRestaurant) {
        debugLog("? Waiting for restaurantData to load (including fallback search)...")
        return
      }

      // Must have restaurantData to fetch addons
      if (!restaurantData) {
        debugWarn("?? No restaurantData available for addons fetch")
        setAddons([])
        return
      }

      // Use restaurantData ID (most reliable)
      const idToUse = restaurantData._id || restaurantData.restaurantId
      if (!idToUse) {
        debugWarn("?? No valid restaurant ID in restaurantData")
        setAddons([])
        return
      }

      debugLog("? Using restaurantData ID for addons:", idToUse)
      fetchAddonsWithId(idToUse)
    }

    fetchAddons()
  }, [restaurantData, cart.length, loadingRestaurant])

  // Fetch restaurant-level coupons once (same source as restaurant details page)
  useEffect(() => {
    const fetchCouponsForCart = async () => {
      if (cart.length === 0) {
        setAvailableCoupons([])
        return
      }

      const resolvedRestaurantId =
        restaurantData?._id ||
        restaurantData?.restaurantId ||
        cart[0]?.restaurantId ||
        null

      setLoadingCoupons(true)

      try {
        const response = await restaurantAPI.getPublicOffers(
          restaurantData?.partnerType === "store" ? { partnerType: "store" } : {},
        )
        const list = response?.data?.data?.allOffers || response?.data?.allOffers || []
        const filteredOffers = filterPublicOffers(list, {
          restaurantId: resolvedRestaurantId,
          restaurantSlug: restaurantData?.slug || restaurantData?.restaurantNameNormalized,
          restaurant: restaurantData,
          orderType,
          requireShowInCart: true,
        })

        const coupons = filteredOffers.map((offer) => mapPublicOfferToCartCoupon(offer, RUPEE_SYMBOL))
        debugLog(`[CART-COUPONS] Loaded ${coupons.length} coupons for restaurant`, {
          resolvedRestaurantId,
          orderType,
        })
        setAvailableCoupons(coupons)
      } catch (error) {
        debugError("[CART-COUPONS] Error fetching coupons:", error)
        setAvailableCoupons([])
      } finally {
        setLoadingCoupons(false)
      }
    }

    fetchCouponsForCart()
  }, [cart, restaurantData, orderType])

  // Calculate pricing from backend whenever cart, address, or coupon changes
  useEffect(() => {
    const calculatePricing = async () => {
      const resolvedRestaurantId = restaurantData?.restaurantId || restaurantData?._id || cart[0]?.restaurantId || undefined
      
      // For takeaway, we don't need a delivery address to calculate pricing, but we MUST have a restaurantId
      const canCalculate = cart.length > 0 && resolvedRestaurantId && (orderType === "takeaway" || hasSavedAddress)
      
      if (!canCalculate) {
        setPricing(null)
        return
      }

      try {
        setLoadingPricing(true)
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price, // Price should already be in INR
          variantId: item.variantId || undefined,
          variantName: item.variantName || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const resolvedRestaurantId = restaurantData?.restaurantId || restaurantData?._id || cart[0]?.restaurantId || undefined
        const resolvedCouponCode = appliedCoupon?.code || couponCode || undefined

        const requestBody = {
          useCart: true,
          items: [],
          restaurantId: resolvedRestaurantId,
          deliveryAddress: orderType === "takeaway" ? undefined : (defaultAddress || undefined),
          couponCode: resolvedCouponCode,
          orderType: orderType,
          zoneId: zoneId || undefined,
        }
        
        debugLog("Recalculating pricing with body:", requestBody)

        const response = await orderAPI.calculateOrder(requestBody)

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)

          const backendApplied = response.data.data.pricing.appliedCoupon
          if (backendApplied) {
            if (!appliedCoupon || appliedCoupon.code !== backendApplied.code) {
              const coupon = availableCoupons.find(c => c.code === backendApplied.code)
              if (coupon) {
                setAppliedCoupon(coupon)
              } else {
                setAppliedCoupon({
                  code: backendApplied.code,
                  discount: backendApplied.discount || 0,
                  minOrder: 0,
                  customerGroup: "all",
                  couponType: "all",
                })
              }
            }
          } else {
            if (appliedCoupon) {
              setAppliedCoupon(null)
              setCouponCode("")
              setManualCouponCode("")
              toast.error("Applied coupon is not valid for this order type")
            }
          }
        }
      } catch (error) {
        // Network errors or 404 errors - silently handle, fallback to frontend calculation
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error calculating pricing:", error)
        }
        // Fallback to frontend calculation if backend fails
        setPricing(null)
      } finally {
        setLoadingPricing(false)
      }
    }

    calculatePricing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, defaultAddress, restaurantId, orderType, zoneId])

  // Fetch wallet balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setIsLoadingWallet(true)
        const response = await userAPI.getWallet()
        if (response?.data?.success && response?.data?.data?.wallet) {
          const balance = Number(response.data.data.wallet.balance) || 0
          setWalletBalance(balance)
          rememberLastKnown("food:walletBalance", balance)
        }
      } catch (error) {
        debugError("Error fetching wallet balance:", error)
        setWalletBalance(0)
      } finally {
        setWalletBalanceLoaded(true)
        setIsLoadingWallet(false)
      }
    }
    fetchWalletBalance()
  }, [])

  // Fetch user order count (used for first-time coupon eligibility)
  useEffect(() => {
    const fetchOrderCount = async () => {
      try {
        const response = await userAPI.getOrders({ page: 1, limit: 1 })
        if (response?.data?.success) {
          const totalOrders = response?.data?.data?.pagination?.total || 0
          setUserOrderCount(totalOrders)
        }
      } catch (error) {
        debugError("Error fetching user order count:", error)
        setUserOrderCount(0)
      }
    }

    fetchOrderCount()
  }, [])

  // Fetch fee settings on mount
  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings()
        if (response.data.success && response.data.data.feeSettings) {
          setFeeSettings({
            deliveryFee: response.data.data.feeSettings.deliveryFee ?? 25,
            deliveryFeeRanges: response.data.data.feeSettings.deliveryFeeRanges ?? [],
            freeDeliveryUpTo: response.data.data.feeSettings.freeDeliveryUpTo ?? 0,
            platformFee: response.data.data.feeSettings.platformFee ?? 5,
            packagingFee: response.data.data.feeSettings.packagingFee ?? 0,
            gstRate: response.data.data.feeSettings.gstRate ?? 5,
          })
        }
      } catch (error) {
        debugError('Error fetching fee settings:', error)
        // Keep default values on error
      }
    }

    const handleFocus = () => {
      fetchFeeSettings()
    }

    fetchFeeSettings()
    window.addEventListener("focus", handleFocus)
    const intervalId = setInterval(fetchFeeSettings, 30000)

    return () => {
      window.removeEventListener("focus", handleFocus)
      clearInterval(intervalId)
    }
  }, [])

  // Use backend pricing if available, otherwise fallback to database fee settings
  // subtotal is declared at the top of the component
  const fallbackDeliveryFee = (() => {
    if (appliedCoupon?.freeDelivery) {
      return 0
    }

    const freeUpTo = Number(feeSettings.freeDeliveryUpTo || 0)
    if (Number.isFinite(freeUpTo) && freeUpTo > 0 && subtotal >= freeUpTo) {
      return 0
    }

    const distanceKm = (() => {
      const rCoords = restaurantData?.location?.coordinates
      const dCoords = defaultAddress?.location?.coordinates
      if (!Array.isArray(rCoords) || !Array.isArray(dCoords)) return null
      if (rCoords.length !== 2 || dCoords.length !== 2) return null
      const [rLng, rLat] = rCoords
      const [dLng, dLat] = dCoords
      return calculateDistance(rLat, rLng, dLat, dLng)
    })()

    const ranges = Array.isArray(feeSettings.deliveryFeeRanges) ? [...feeSettings.deliveryFeeRanges] : []
    if (ranges.length > 0 && Number.isFinite(distanceKm)) {
      const sortedRanges = ranges.sort((a, b) => Number(a.min) - Number(b.min))
      for (let i = 0; i < sortedRanges.length; i += 1) {
        const range = sortedRanges[i]
        const min = Number(range.min)
        const max = Number(range.max)
        const fee = Number(range.fee)
        const isLastRange = i === sortedRanges.length - 1
        const inRange = isLastRange
          ? distanceKm >= min && distanceKm <= max
          : distanceKm >= min && distanceKm < max

        if (inRange) return fee
      }

      return Number(feeSettings.deliveryFee || 0)
    }

    return Number(feeSettings.deliveryFee || 0)
  })()
  const deliveryFee = pricing != null ? (pricing.deliveryFee ?? 0) : fallbackDeliveryFee
  const deliveryFeeBreakdown = pricing?.deliveryFeeBreakdown || null
  const hasDistanceDeliveryBreakdown =
    deliveryFeeBreakdown?.source === "distance" &&
    Number.isFinite(Number(deliveryFeeBreakdown?.distanceKm))
  const deliveryFeeBreakdownText = hasDistanceDeliveryBreakdown
    ? `Distance ${Number(deliveryFeeBreakdown.distanceKm).toFixed(1)} km`
    : null
  const platformFee = pricing != null ? (pricing.platformFee ?? 0) : (feeSettings.platformFee ?? 0)
  const packagingFee = pricing != null ? (pricing.packagingFee ?? 0) : (feeSettings.packagingFee ?? 0)
  const gstCharges = pricing != null ? (pricing.tax ?? 0) : Math.round(subtotal * ((feeSettings.gstRate ?? 0) / 100))
  const discount = pricing?.discount || (appliedCoupon ? Math.min(appliedCoupon.discount, subtotal * 0.5) : 0)
  const totalBeforeDiscount = subtotal + deliveryFee + platformFee + packagingFee + gstCharges
  const total = pricing?.total || (totalBeforeDiscount - discount)
  const savings = pricing?.savings ?? Math.max(0, totalBeforeDiscount - total)
  
  // Platform compare-at savings removed — admin markup is charged via price/markupAmount.
  const platformPricingSavings = useMemo(() => {
    return {
      hasPlatformPricing: false,
      totalPlatformPrice: 0,
      totalPlatformGst: 0,
      totalPlatformPriceWithGst: 0,
      totalFoodelloPrice: 0,
      totalSavings: 0,
      savingsPercentage: 0,
      comparison: [],
      items: [],
    }
  }, [])
  const selectedPaymentLabel =
    selectedPaymentMethod === "wallet"
      ? "Wallet"
      : selectedPaymentMethod === "razorpay"
        ? "Online Payment"
        : "Cash on Delivery"

  // Restaurant name from data or cart
  const restaurantName = restaurantData?.name || cart[0]?.restaurant || "Restaurant"

  const availability = useMemo(() => {
    if (!restaurantData) return { isOpen: true }
    return getRestaurantAvailabilityStatus(restaurantData)
  }, [restaurantData])

  const isRestaurantClosed = !availability.isOpen
  const isCartUnavailable = isRestaurantClosed || isCartZoneMismatch

  // Trigger auto-coupon popup only when cart is orderable for this location
  useEffect(() => {
    if (cart.length === 0) {
      hasShownPromoPopupRef.current = { delivery: false, takeaway: false, dining: false }
      return
    }

    if (isCartUnavailable) {
      setShowAutoCouponPopup(false)
      setShowCouponSheet(false)
      return
    }

    const currentOrderType = orderType || "delivery"

    if (
      cart.length > 0 &&
      filteredCoupons.length > 0 &&
      !appliedCoupon &&
      !couponCode &&
      !hasShownPromoPopupRef.current[currentOrderType] &&
      !loadingCoupons
    ) {
      const topCoupon = filteredCoupons[0]
      const discountAmount = topCoupon.discountType === "percentage"
        ? Math.min(subtotal * (Number(topCoupon.discountPercentage || 0) / 100), Number(topCoupon.maxDiscount) || Infinity)
        : Number(topCoupon.originalPrice || 0)
      const isApplicable = subtotal >= (Number(topCoupon.minOrder) || 0) && discountAmount > 0

      if (isApplicable) {
        setBestCoupon(topCoupon)
        setShowAutoCouponPopup(true)
        hasShownPromoPopupRef.current[currentOrderType] = true
      }
    }
  }, [filteredCoupons, appliedCoupon, loadingCoupons, subtotal, cart.length, orderType, isCartUnavailable, couponCode])

  const handleShare = async () => {
    const restaurantNameStr = restaurantName || companyName || "this restaurant"
    const shareUrl = window.location.href
    const shareText = `Check out what I'm ordering from ${restaurantNameStr}! ${shareUrl}`

    const payload = {
      title: `My Cart at ${restaurantNameStr}`,
      text: shareText,
      url: shareUrl,
    }

    if (isMobileDevice()) {
      openShareModal(payload)
      return
    }

    const shared = await tryNativeShare(payload)
    if (shared) return

    openShareModal(payload)
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return true
      return false
    }
  }

  const isMobileDevice = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(navigator.userAgent)
    const smallViewport = window.matchMedia?.("(max-width: 768px)")?.matches
    return Boolean(mobileUA || smallViewport)
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return

    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)

    let shareLink = ""

    if (target === "whatsapp") {
      shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "telegram") {
      shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    } else if (target === "email") {
      shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    }

    if (shareLink) {
      window.open(shareLink, "_blank", "noopener,noreferrer")
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch (error) {
      toast.error("Failed to copy link")
    }
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) {
      setShowShareModal(false)
    }
  }

  const handleBack = () => {
    goBack()
  }

  // Handler to select address by label (Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      // Find address with matching label
      const targetLabel = normalizeAddressLabel(label)
      const address = addresses.find(addr => normalizeAddressLabel(addr.label) === targetLabel)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      await handleSelectSavedAddress(address)
    } catch (error) {
      debugError(`Error selecting ${label} address:`, error)
      toast.error(`Failed to select ${label} address. Please try again.`)
    }
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const addressId = getAddressId(address)
      if (addressId) {
        setSelectedAddressId(addressId)
        setDefaultAddress(addressId)
      }

      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (!latitude || !longitude) {
        toast.error(`Invalid coordinates for ${address.label || "saved"} address`)
        return
      }

      // Update location in backend
      await userAPI.updateLocation({
        latitude,
        longitude,
        address: `${address.street}, ${address.city}`,
        city: address.city,
        state: address.state,
        area: address.additionalDetails || "",
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      })

      // Update the location in localStorage
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))
      try {
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
      } catch (evtErr) {
        debugWarn("Failed to dispatch custom event:", evtErr)
      }
      // User selected a saved address from Cart; prefer saved mode.
      try {
        localStorage.setItem("deliveryAddressMode", "saved")
        setDeliveryAddressMode("saved")
      } catch { }

      toast.success(`${address.label || "Saved"} address selected!`)
    } catch (error) {
      debugError("Error selecting saved address:", error)
      toast.error("Failed to select address. Please try again.")
    }
  }

  const handleApplyCoupon = async (coupon) => {
    if (isCartZoneMismatch) {
      toast.error("This restaurant does not deliver to your selected location")
      return
    }
    if (isRestaurantClosed) {
      toast.error("Restaurant is closed. Coupons cannot be applied right now.")
      return
    }

    const isFirstTimeOnly = coupon?.customerGroup === "new" || coupon?.customerGroup === "first-time"
    if (isFirstTimeOnly && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    if (subtotal < (Number(coupon.minOrder) || 0)) {
      toast.error(`Min order ${RUPEE_SYMBOL}${Number(coupon.minOrder || 0)}`)
      return
    }

    if (coupon?.couponType && coupon.couponType !== "all" && coupon.couponType !== orderType) {
      toast.error(`This coupon is only valid for ${coupon.couponType} orders`)
      return
    }

    // Save previous state for rollback
    const prevAppliedCoupon = appliedCoupon
    const prevCouponCode = couponCode
    const prevManualCouponCode = manualCouponCode

    // Optimistically update states & close sheet instantly
    setAppliedCoupon(coupon)
    setCouponCode(coupon.code)
    setManualCouponCode(coupon.code)
    setShowCouponSheet(false)

    // Validate with backend first; only set applied if backend accepts
    if (cart.length > 0 && (orderType === "takeaway" || hasSavedAddress)) {
      try {
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price,
          variantId: item.variantId || item.variant?._id || item.variant?.id || undefined,
          variantName: item.variantName || (typeof item.variant === 'string' ? item.variant : item.variant?.name) || (typeof item.selectedVariant === 'string' ? item.selectedVariant : item.selectedVariant?.name) || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          useCart: true,
          items: [],
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: orderType === "takeaway" ? undefined : defaultAddress,
          couponCode: coupon.code,
          orderType: orderType,
          zoneId: zoneId || undefined
        })

        const pricingData = response?.data?.data?.pricing
        if (!pricingData || !pricingData.appliedCoupon) {
          throw new Error("Coupon not applicable")
        }

        setPricing(pricingData)
        toast.success("Coupon applied")
      } catch (error) {
        debugError("Error recalculating pricing:", error)
        // Rollback states
        setAppliedCoupon(prevAppliedCoupon)
        setCouponCode(prevCouponCode)
        setManualCouponCode(prevManualCouponCode)
        toast.error(error?.response?.data?.error || error?.message || "Failed to apply coupon")
      }
    }
  }

  const handleApplyCouponCode = async () => {
    const inputCode = manualCouponCode.trim().toUpperCase()
    if (!inputCode) {
      toast.error("Enter coupon code")
      return
    }

    if (isCartZoneMismatch) {
      toast.error("This restaurant does not deliver to your selected location")
      return
    }
    if (isRestaurantClosed) {
      toast.error("Restaurant is closed. Coupons cannot be applied right now.")
      return
    }

    if (cart.length === 0 || (orderType !== "takeaway" && !hasSavedAddress)) {
      toast.error(orderType === "takeaway" ? "Add items first" : "Add items and delivery address first")
      return
    }

    const matchedCoupon = availableCoupons.find(
      (coupon) => String(coupon.code || "").toUpperCase() === inputCode,
    )

    // If we know this is first-time only and user already ordered, block early.
    const isFirstTimeOnly = matchedCoupon?.customerGroup === "new" || matchedCoupon?.customerGroup === "first-time"
    if (isFirstTimeOnly && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    if (matchedCoupon && matchedCoupon.couponType && matchedCoupon.couponType !== "all" && matchedCoupon.couponType !== orderType) {
      toast.error(`This coupon is only valid for ${matchedCoupon.couponType} orders`)
      return
    }

    // Save previous state for rollback
    const prevAppliedCoupon = appliedCoupon
    const prevCouponCode = couponCode
    const prevManualCouponCode = manualCouponCode

    // Optimistically update states & close sheet instantly
    setCouponCode(inputCode)
    setManualCouponCode(inputCode)
    setAppliedCoupon(
      matchedCoupon || {
        code: inputCode,
        discount: 0,
        minOrder: 0,
        customerGroup: "all",
        couponType: "all",
      },
    )
    setShowCouponSheet(false)

    try {
      const items = cart.map(item => ({
        itemId: item.itemId || item.id,
        name: item.name,
        price: item.price,
        variantId: item.variantId || undefined,
        variantName: item.variantName || undefined,
        variantPrice: item.variantPrice || item.price,
        quantity: item.quantity || 1,
        image: item.image,
        description: item.description,
        isVeg: item.isVeg !== false
      }))

      const response = await orderAPI.calculateOrder({
        useCart: true,
        items: [],
        restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
        deliveryAddress: orderType === "takeaway" ? undefined : defaultAddress,
        couponCode: inputCode,
        orderType: orderType,
        zoneId: zoneId || undefined
      })

      const pricingData = response?.data?.data?.pricing
      if (!pricingData) {
        throw new Error("Unable to validate coupon")
      }

      if (!pricingData.appliedCoupon) {
        throw new Error("Invalid or unavailable coupon code")
      }

      setPricing(pricingData)
      setAppliedCoupon(
        matchedCoupon || {
          code: inputCode,
          discount: pricingData.appliedCoupon.discount || 0,
          minOrder: 0,
          customerGroup: "all",
          couponType: "all",
        },
      )
      toast.success("Coupon applied")
    } catch (error) {
      debugError("Error applying coupon code:", error)
      // Rollback states
      setAppliedCoupon(prevAppliedCoupon)
      setCouponCode(prevCouponCode)
      setManualCouponCode(prevManualCouponCode)
      toast.error(error?.response?.data?.error || error?.message || "Failed to apply coupon")
    }
  }


  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null)
    setCouponCode("")
    setManualCouponCode("")

    // Recalculate pricing without coupon
    if (cart.length > 0 && hasSavedAddress) {
      try {
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price,
          variantId: item.variantId || undefined,
          variantName: item.variantName || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg === true || item.foodType === 'Veg'
        }))

        const response = await orderAPI.calculateOrder({
          useCart: true,
          items: [],
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: orderType === "takeaway" ? undefined : defaultAddress,
          couponCode: undefined,
          orderType: orderType,
          zoneId: zoneId || undefined
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)
        }
      } catch (error) {
        debugError("Error recalculating pricing:", error)
      }
    }
  }


  const handlePlaceOrder = async () => {
    if (!hasSavedAddress) {
      toast.error("Please choose a delivery location to continue")
      openLocationSelector()
      return
    }

    if (isCartZoneMismatch) {
      toast.error("This restaurant does not deliver to your selected location")
      return
    }

    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please select both date and time to schedule your order")
        return
      }
      const scheduleString = `${scheduledDate}T${scheduledTime}:00`
      const scheduleDateObj = new Date(scheduleString)
      if (scheduleDateObj < new Date()) {
        toast.error("Scheduled time must be in the future")
        return
      }
    }

    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    setIsPlacingOrder(true)

    // Use API_BASE_URL from config (supports both dev and production)

    try {
      debugLog("?? Starting order placement process...")
      debugLog("?? Cart items:", cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })))
      debugLog("?? Applied coupon:", appliedCoupon?.code || "None")
      debugLog("?? Delivery address:", defaultAddress?.label || defaultAddress?.city)

      // Ensure couponCode is included in pricing
      const orderPricing = pricing || {
        subtotal,
        deliveryFee,
        tax: gstCharges,
        platformFee,
        discount,
        total,
        couponCode: appliedCoupon?.code || null
      };

      // Add couponCode if not present but coupon is applied
      if (!orderPricing.couponCode && appliedCoupon?.code) {
        orderPricing.couponCode = appliedCoupon.code;
      }

      // Include all cart items (main items + addons)
      // Note: Addons are added as separate cart items when user clicks the + button
      const orderItems = cart.map(item => {
        const vName = item.variantName || (typeof item.variant === 'string' ? item.variant : item.variant?.name) || (typeof item.selectedVariant === 'string' ? item.selectedVariant : item.selectedVariant?.name) || item.variant_name || item.size || undefined;
        const vId = item.variantId || item.variant?._id || item.variant?.id || item.selectedVariant?._id || item.selectedVariant?.id || undefined;
        return {
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price,
          variantId: vId,
          variantName: vName,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image || "",
          description: item.description || "",
          isVeg: item.isVeg === true || item.foodType === 'Veg',
          preparationTime: item.preparationTime
        };
      })

      debugLog("?? Order items to send:", orderItems)
      debugLog("?? Order pricing:", orderPricing)

      // Check API base URL before making request (for debugging)
      const fullUrl = `${API_BASE_URL}${API_ENDPOINTS.ORDER.CREATE}`;
      debugLog("?? Making request to:", fullUrl)
      debugLog("?? Authentication token present:", !!localStorage.getItem('accessToken') || !!localStorage.getItem('user_accessToken'))

      // CRITICAL: Validate restaurant ID before placing order
      // Ensure we're using the correct restaurant from restaurantData (most reliable)
      const finalRestaurantId = restaurantData?.restaurantId || restaurantData?._id || null;
      const finalRestaurantName = restaurantData?.name || null;

      if (!finalRestaurantId) {
        debugError('? CRITICAL: Cannot place order - Restaurant ID is missing!');
        debugError('?? Debug info:', {
          restaurantData: restaurantData ? {
            _id: restaurantData._id,
            restaurantId: restaurantData.restaurantId,
            name: restaurantData.name
          } : 'Not loaded',
          cartRestaurantId: restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });
        alert('Error: Restaurant information is missing. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      // CRITICAL: Validate that ALL cart items belong to the SAME restaurant
      const cartRestaurantIds = cart
        .map(item => item.restaurantId)
        .filter(Boolean)
        .map(id => String(id).trim()); // Normalize to string and trim

      const cartRestaurantNames = cart
        .map(item => item.restaurant)
        .filter(Boolean)
        .map(name => name.trim().toLowerCase()); // Normalize names

      // Get unique values (after normalization)
      const uniqueRestaurantIds = [...new Set(cartRestaurantIds)];
      const uniqueRestaurantNames = [...new Set(cartRestaurantNames)];

      // Check if cart has items from multiple restaurants
      // Note: If restaurant names match, allow even if IDs differ (same restaurant, different ID format)
      if (uniqueRestaurantNames.length > 1) {
        // Different restaurant names = definitely different restaurants
        debugError('? CRITICAL ERROR: Cart contains items from multiple restaurants!', {
          restaurantIds: uniqueRestaurantIds,
          restaurantNames: uniqueRestaurantNames,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });

        // Automatically clean cart to keep items from the restaurant matching restaurantData
        if (finalRestaurantId && finalRestaurantName) {
          debugLog('?? Auto-cleaning cart to keep items from:', finalRestaurantName);
          cleanCartForRestaurant(finalRestaurantId, finalRestaurantName);
          toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
        } else {
          // If restaurantData is not available, keep items from first restaurant in cart
          const firstRestaurantId = cart[0]?.restaurantId;
          const firstRestaurantName = cart[0]?.restaurant;
          if (firstRestaurantId && firstRestaurantName) {
            debugLog('?? Auto-cleaning cart to keep items from first restaurant:', firstRestaurantName);
            cleanCartForRestaurant(firstRestaurantId, firstRestaurantName);
            toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
          } else {
            toast.error('Cart contains items from different restaurants. Please clear cart and try again.');
          }
        }

        setIsPlacingOrder(false);
        return;
      }

      // If restaurant names match but IDs differ, that's OK (same restaurant, different ID format)
      // But log a warning in development
      if (uniqueRestaurantIds.length > 1 && uniqueRestaurantNames.length === 1) {
        if (process.env.NODE_ENV === 'development') {
          debugWarn('?? Cart items have different restaurant IDs but same name. This is OK if IDs are in different formats.', {
            restaurantIds: uniqueRestaurantIds,
            restaurantName: uniqueRestaurantNames[0]
          });
        }
      }

      // Validate that cart items' restaurantId matches the restaurantData
      if (cartRestaurantIds.length > 0) {
        const cartRestaurantId = cartRestaurantIds[0];

        // Check if cart restaurantId matches restaurantData
        const restaurantIdMatches =
          cartRestaurantId === finalRestaurantId ||
          cartRestaurantId === restaurantData?._id?.toString() ||
          cartRestaurantId === restaurantData?.restaurantId;

        if (!restaurantIdMatches) {
          debugError('? CRITICAL ERROR: Cart restaurantId does not match restaurantData!', {
            cartRestaurantId: cartRestaurantId,
            finalRestaurantId: finalRestaurantId,
            restaurantDataId: restaurantData?._id?.toString(),
            restaurantDataRestaurantId: restaurantData?.restaurantId,
            restaurantDataName: restaurantData?.name,
            cartRestaurantName: cartRestaurantNames[0]
          });
          alert(`Error: Cart items belong to "${cartRestaurantNames[0] || 'Unknown Restaurant'}" but restaurant data doesn't match. Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Validate restaurant name matches
      if (cartRestaurantNames.length > 0 && finalRestaurantName) {
        const cartRestaurantName = cartRestaurantNames[0];
        if (cartRestaurantName.toLowerCase().trim() !== finalRestaurantName.toLowerCase().trim()) {
          debugError('? CRITICAL ERROR: Restaurant name mismatch!', {
            cartRestaurantName: cartRestaurantName,
            finalRestaurantName: finalRestaurantName
          });
          alert(`Error: Cart items belong to "${cartRestaurantName}" but restaurant data shows "${finalRestaurantName}". Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Log order details for debugging
      debugLog('? Order validation passed - Placing order with restaurant:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        restaurantDataId: restaurantData?._id,
        restaurantDataRestaurantId: restaurantData?.restaurantId,
        cartRestaurantId: cartRestaurantIds[0],
        cartRestaurantName: cartRestaurantNames[0],
        cartItemCount: cart.length
      });

      // FINAL VALIDATION: Double-check restaurantId before sending to backend
      const cartRestaurantId = cart[0]?.restaurantId;
      if (cartRestaurantId && cartRestaurantId !== finalRestaurantId &&
        cartRestaurantId !== restaurantData?._id?.toString() &&
        cartRestaurantId !== restaurantData?.restaurantId) {
        debugError('? CRITICAL: Final validation failed - restaurantId mismatch!', {
          cartRestaurantId: cartRestaurantId,
          finalRestaurantId: finalRestaurantId,
          restaurantDataId: restaurantData?._id?.toString(),
          restaurantDataRestaurantId: restaurantData?.restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          finalRestaurantName: finalRestaurantName
        });
        alert('Error: Restaurant information mismatch detected. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      const orderPayload = {
        useCart: true,
        // Server loads items from DB food cart; do not trust client cart lines/prices.
        items: [],
        address: {
          ...defaultAddress,
          phone: recipientPhone || defaultAddress?.phone || "",
          name: recipientName,
          fullName: recipientName,
        },
        customerName: recipientName,
        customerPhone: recipientPhone || defaultAddress?.phone || "",
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName || undefined,
        couponCode: appliedCoupon?.code || couponCode || undefined,
        note: "",
        restaurantNote: restaurantNote || "",
        sendCutlery: sendCutlery !== false,
        paymentMethod: selectedPaymentMethod,
        // `useZone()` can return `null`. Zod expects string/undefined, not null.
        zoneId: zoneId || undefined,
        scheduledAt: isScheduled ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() : undefined,
        orderType: orderType || "delivery",
      };
      // Log final order details (including paymentMethod for COD debugging)
      debugLog('?? FINAL: Sending order to backend with:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        itemCount: orderItems.length,
        totalAmount: orderPricing.total,
        paymentMethod: orderPayload.paymentMethod
      });

      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < total) {
        toast.error(`Insufficient wallet balance. Required: ${RUPEE_SYMBOL}${total.toFixed(0)}, Available: ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`)
        setIsPlacingOrder(false)
        return
      }

      // Cash flow: order placed without online payment
      if (selectedPaymentMethod === "cash") {
        const orderResponse = await orderAPI.createOrder(orderPayload)
        debugLog("? Cash order created successfully:", orderResponse.data)
        const { order } = orderResponse.data.data

        setPlacedOrderId(order?._id || order?.orderId || order?.id || null)
        setPlacedOrderObj(order)
        setShowOrderSuccess(true)
        window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
        clearCart()
        setRestaurantNote("")
        setShowRestaurantNoteInput(false)
        try {
          window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
        } catch {
          // ignore
        }
        setIsPlacingOrder(false)
        return
      }

      // Wallet flow: order placed with wallet payment
      if (selectedPaymentMethod === "wallet") {
        const orderResponse = await orderAPI.createOrder(orderPayload)
        debugLog("? Wallet order created successfully:", orderResponse.data)
        const { order } = orderResponse.data.data

        setPlacedOrderId(order?._id || order?.orderId || order?.id || null)
        setPlacedOrderObj(order)
        setShowOrderSuccess(true)
        window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
        clearCart()
        setRestaurantNote("")
        setShowRestaurantNoteInput(false)
        try {
          window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
        } catch {
          // ignore
        }
        setIsPlacingOrder(false)
        // Refresh wallet balance
        try {
          const walletResponse = await userAPI.getWallet()
          if (walletResponse?.data?.success && walletResponse?.data?.data?.wallet) {
            const balance = Number(walletResponse.data.data.wallet.balance) || 0
            setWalletBalance(balance)
            rememberLastKnown("food:walletBalance", balance)
          }
        } catch (error) {
          debugError("Error refreshing wallet balance:", error)
        }
        return
      }

      // Online payment (Razorpay) flow: Initiate payment order FIRST (no DB order created yet)
      const initiateResponse = await orderAPI.initiateOnlinePayment(orderPayload)
      debugLog("? Online payment initiated successfully:", initiateResponse.data)

      const razorpay = initiateResponse.data.data

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        debugError("? Razorpay initialization failed:", { razorpay })
        throw new Error("Failed to initialize payment gateway. Please contact support.")
      }

      debugLog("?? Razorpay gateway order created:", {
        orderId: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        keyPresent: !!razorpay.key
      })

      // Get user info for Razorpay prefill
      const userInfo = userProfile || {}
      const userPhone = recipientPhone || userInfo.phone || defaultAddress?.phone || ""
      const userEmail = userInfo.email || ""
      const userName = recipientName || userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

      // Get company name for Razorpay
      const companyName = await getCompanyNameAsync()

      // Flag to prevent duplicate execution (onError + onClose)
      let paymentHandled = false

      // Store payload in localStorage for redirect-based checkout (PhonePe intent fix)
      try {
        window.localStorage.setItem('pendingOrderPayload', JSON.stringify(orderPayload))
        window.localStorage.removeItem('pendingOrderSavings')
      } catch (err) {
        debugError("Failed to save pending order payload to localStorage", err)
      }

      // API_BASE_URL usually ends with /api/v1 or similar. We strip the /v1 part to form the webhook URL.
      const baseUrlStr = String(API_BASE_URL).replace(/\/v1\/?$/, '');
      const callbackUrl = `${baseUrlStr}/v1/payments/webhook/razorpay-redirect?frontendUrl=${encodeURIComponent(window.location.origin + window.location.pathname)}`

      // Initialize Razorpay payment modal
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount, // Already in paise from backend
        currency: razorpay.currency || 'INR',
        order_id: razorpay.orderId,
        name: companyName,
        description: `Order Payment - ${RUPEE_SYMBOL}${(razorpay.amount / 100).toFixed(2)}`,
        callback_url: callbackUrl,
        redirect: true,
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone
        },
        notes: {
          userId: userInfo.id || "",
          restaurantId: finalRestaurantId || "unknown"
        },
        handler: async (response) => {
          paymentHandled = true
          try {
            debugLog("? Payment successful, creating order in DB...", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id
            })

            // Now create the order in DB with payment signature verification
            const createOrderPayload = {
              ...orderPayload,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }

            const createResponse = await orderAPI.createOrder(createOrderPayload)
            debugLog("? Order created after payment:", createResponse.data)

            if (createResponse.data?.success) {
              const { order } = createResponse.data.data
              setPlacedOrderId(order._id || order.orderId)
              setPlacedOrderObj(order)
              setShowOrderSuccess(true)
              window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
              clearCart()
              setRestaurantNote("")
              setShowRestaurantNoteInput(false)
              try {
                window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
              } catch {
                // ignore
              }
              setIsPlacingOrder(false)
            } else {
              throw new Error(createResponse.data?.message || "Payment verified but order creation failed")
            }
          } catch (error) {
            debugError("? Order creation after payment error:", error)
            const errorMessage =
              error?.response?.data?.message ||
              error?.response?.data?.error?.message ||
              error?.response?.data?.errors?.[0]?.message ||
              error?.message ||
              "Payment verification failed. Please contact support."
            alert(errorMessage)
            setIsPlacingOrder(false)
          }
        },
        onError: async (error) => {
          if (paymentHandled) return
          paymentHandled = true
          debugError("? Razorpay payment error:", error)
          if (error?.code !== 'PAYMENT_CANCELLED' && error?.message !== 'PAYMENT_CANCELLED') {
            const errorMessage = error?.description || error?.message || "Payment failed. Please try again."
            alert(errorMessage)
          } else {
            toast.info("Payment was cancelled. No order has been placed.")
          }
          setIsPlacingOrder(false)
        },
        onClose: async () => {
          if (paymentHandled) return
          paymentHandled = true
          debugLog("?? Payment modal closed by user - no DB order was created")
          toast.info("Payment was not completed. No order has been placed.")
          setIsPlacingOrder(false)
        }
      })
    } catch (error) {
      debugError("? Order creation error:", error)

      let errorMessage = "Failed to create order. Please try again."

      // Handle network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        // customers get plain wording, not developer instructions about the backend
        errorMessage = networkErrorMessage()

        debugError("?? Network Error Details:", {
          code: error.code,
          message: error.message,
          config: {
            url: error.config?.url,
            baseURL: error.config?.baseURL,
            fullUrl: error.config?.baseURL + error.config?.url,
            method: error.config?.method
          },
          // eslint-disable-next-line no-undef -- undefined on the web too (kept: same behaviour, the call throws into its catch)
          backendUrl: backendUrl,
          apiBaseUrl: API_BASE_URL
        })

        // Backend disconnected - no health check (new backend in progress)
      }
      // Handle timeout errors
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again."
      }
      // Handle other axios errors
      else if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`
      }
      // Handle other errors
      else if (error.message) {
        errorMessage = error.message
      }

      alert(errorMessage)
      setIsPlacingOrder(false)
    }
  }

  const handleGoToOrders = () => {
    setShowSavingsCongrats(false)
    setCongratssSavingsAmount(0)
    setCongratssSavingsPercentage(0)
    setCongratssSavingsItems([])
    setOrderSuccessSavingsAmount(0)
    setShowOrderSuccess(false)
    setShowPlacingOrder(false)
    navigate(`/user/orders/${placedOrderId}?confirmed=true`, {
      replace: true,
      state: { order: placedOrderObj, fromOrderPlaced: true, from: 'cart' }
    })
  }

  const pageBg = t.dark ? '#0a0a0a' : colors.slate[50]
  const isVegItem = (item) => item.isVeg === true || item.foodType === 'Veg'
  const iconMuted = t.dark ? colors.gray[300] : colors.gray[700]

  // Empty cart state - but don't show if order success or placing order modal is active
  if (cart.length === 0 && !showOrderSuccess && !showPlacingOrder && !showSavingsCongrats) {
    return (
      <Screen edges={['bottom']} bg={t.dark ? '#0a0a0a' : colors.gray[50]}>
        <AnimatedPage style={{ flex: 1 }}>
          <View style={s.emptyHeader}>
            <StatusBarSpacer color={t.dark ? '#1a1a1a' : colors.white} />
            <View style={s.emptyHeaderRow}>
              <Button variant="ghost" size="icon" style={{ width: 32, height: 32 }} onPress={handleBack}>
                <ArrowLeft size={16} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              </Button>
              <Text style={s.emptyHeaderTitle}>Cart</Text>
            </View>
          </View>
          <View style={s.emptyBody}>
            <View style={s.emptyIcon}>
              <Utensils size={40} color={colors.gray[400]} />
            </View>
            <Text style={s.emptyTitle}>Your cart is empty</Text>
            <Text style={s.emptyText}>Add items from a restaurant to start a new order</Text>
            <Button onPress={() => navigate('/user')} style={{ backgroundColor: '#DC2626' }} textStyle={{ color: colors.white }}>
              Browse Restaurants
            </Button>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  const paymentOptions = [
    {
      id: 'razorpay',
      name: 'Online Payment',
      description: 'UPI, Cards, Netbanking',
      Icon: Zap,
      bg: t.dark ? alpha(colors.emerald[900], 0.4) : colors.emerald[50],
      fg: t.dark ? colors.emerald[400] : colors.emerald[600],
      badge: 'SECURE',
      disabled: !isPaymentMethodEnabled('razorpay'),
      disabledText: 'Online Pay Disabled',
    },
    {
      id: 'wallet',
      name: 'Quick Wallet',
      description: 'Pay from your wallet',
      Icon: Wallet,
      bg: t.dark ? alpha(colors.blue[900], 0.4) : colors.blue[50],
      fg: t.dark ? colors.blue[400] : colors.blue[600],
      subInfo: shownWalletBalance === null ? 'skeleton' : `Bal: ${RUPEE_SYMBOL}${shownWalletBalance.toFixed(0)}`,
      disabled: walletBalance < total || !isPaymentMethodEnabled('wallet'),
      disabledText: !isPaymentMethodEnabled('wallet') ? 'Wallet Disabled' : 'Low Balance',
    },
    {
      id: 'cash',
      name: 'Cash on Delivery',
      description: 'Pay when order arrives',
      Icon: Banknote,
      bg: t.dark ? alpha(colors.orange[900], 0.4) : colors.orange[50],
      fg: t.dark ? colors.orange[400] : colors.gray[900],
      disabled: !isPaymentMethodEnabled('cash'),
      disabledText: 'COD Disabled',
      hideWhenDisabled: true,
    },
  ].filter((option) => !option.hideWhenDisabled || !option.disabled)

  const placeDisabled =
    isPlacingOrder || loadingPricing || isCartZoneMismatch || (selectedPaymentMethod === 'wallet' && walletBalance < total) || isRestaurantClosed

  const openCouponsOrWarn = () => {
    if (isCartUnavailable) {
      toast.error(
        isCartZoneMismatch ? 'This restaurant does not deliver to your selected location' : 'Restaurant is closed. Coupons cannot be applied right now.',
      )
      return
    }
    setShowCouponSheet(true)
  }

  return (
    <Screen edges={[]} bg={pageBg}>
      {/* Header - Sticky at top */}
      <View style={s.header}>
        <StatusBarSpacer color={t.dark ? '#1a1a1a' : colors.white} />
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Pressable onPress={handleBack} style={({ pressed }) => [s.roundBtn, pressed && s.roundBtnPressed]}>
              <ArrowLeft size={18} strokeWidth={2.5} color={t.dark ? colors.gray[200] : colors.gray[800]} />
            </Pressable>
            <View style={s.headerTitleWrap}>
              <Text style={s.headerTitle} numberOfLines={1}>
                {restaurantName}
              </Text>
              {isRestaurantClosed && <Text style={s.closedText}>Restaurant is closed. Please order when they are online.</Text>}
            </View>
          </View>
          <Pressable onPress={handleShare} style={({ pressed }) => [s.roundBtn, pressed && s.roundBtnPressed]}>
            <Share size={18} strokeWidth={2.5} color={t.dark ? colors.gray[200] : colors.gray[800]} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable Content Area */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 176 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {/* Zone mismatch warning */}
        {isCartZoneMismatch && (
          <View style={{ paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(1) }}>
            <View style={s.zoneCard}>
              <LinearGradient
                colors={t.dark ? [alpha(colors.amber[950], 0.4), '#1a1a1a', '#1a1a1a'] : [colors.amber[50], alpha(colors.orange[50], 0.8), colors.white]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient colors={[colors.amber[400], colors.orange[500]]} style={s.zoneStripe} />
              <View style={s.zoneBody}>
                <View style={s.zoneIcon}>
                  <AlertTriangle size={20} color={t.dark ? colors.amber[400] : colors.amber[600]} />
                </View>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={s.zoneTitle}>Delivery not available here</Text>
                  <Text style={s.zoneText}>
                    {restaurantName} doesn’t deliver to your selected location. Switch address to continue, or clear this cart.
                  </Text>
                  <View style={s.zoneActions}>
                    <Pressable onPress={openLocationSelector} style={({ pressed }) => [s.zoneBtnPrimary, pressed && { backgroundColor: colors.amber[700], transform: [{ scale: 0.98 }] }]}>
                      <MapPin size={14} color={colors.white} />
                      <Text style={s.zoneBtnPrimaryText}>Change location</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        clearCart()
                        toast.success('Cart cleared')
                      }}
                      style={({ pressed }) => [s.zoneBtnSecondary, pressed && { transform: [{ scale: 0.98 }] }]}
                    >
                      <Text style={s.zoneBtnSecondaryText}>Clear cart</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Savings Banner */}
        {savings > 0 && (
          <View style={s.savingsBanner}>
            <Text style={{ fontSize: 14 }}>🎉</Text>
            <Text style={s.savingsText}>
              {appliedCoupon?.code
                ? `You saved ${RUPEE_SYMBOL}${savings} with '${appliedCoupon.code}' on this order!`
                : `You saved ${RUPEE_SYMBOL}${savings} on this order!`}
            </Text>
          </View>
        )}

        <View style={s.main}>
          {/* Cart Items */}
          <View style={[s.card, { paddingVertical: sp(4) }]}>
            <View style={{ gap: sp(6) }}>
              {cart.map((item, index) => (
                <View key={item.id} style={isCartUnavailable ? s.grayed : null}>
                  <View style={s.itemRow}>
                    {/* Veg/Non-veg indicator */}
                    <View style={[s.vegBox, { borderColor: isVegItem(item) ? colors.green[600] : colors.red[600] }]}>
                      <View style={[s.vegDot, { backgroundColor: isVegItem(item) ? colors.green[600] : colors.red[600] }]} />
                    </View>

                    <View style={s.itemMid}>
                      <View style={s.itemImgWrap}>
                        <AppImage src={item.image || dishFallbackImage} fallback={dishFallbackImage} style={{ width: '100%', height: '100%' }} />
                      </View>
                      <View style={{ minWidth: 0, flex: 1 }}>
                        <Text style={s.itemName}>{item.name}</Text>
                        {item.variantName ? (
                          <View style={s.variantChip}>
                            <Text style={s.variantText} numberOfLines={1}>
                              {item.variantName}
                            </Text>
                          </View>
                        ) : null}
                        {isRestaurantClosed && <Text style={s.itemClosed}>Remove this dish to order available dishes</Text>}
                        {isCartZoneMismatch && !isRestaurantClosed && <Text style={s.itemZone}>Not deliverable to your selected location</Text>}
                      </View>
                    </View>

                    <View style={s.itemRight}>
                      <View style={s.stepper}>
                        <Pressable onPress={() => updateQuantity(item.id, item.quantity - 1)} style={({ pressed }) => [s.stepBtn, pressed && s.stepPressed]}>
                          <Minus size={14} color="#DC2626" />
                        </Pressable>
                        <Text style={s.stepQty}>{item.quantity}</Text>
                        <Pressable onPress={() => updateQuantity(item.id, item.quantity + 1)} style={({ pressed }) => [s.stepBtn, pressed && s.stepPressed]}>
                          <Plus size={14} color="#DC2626" />
                        </Pressable>
                      </View>
                      <Text style={s.itemPrice}>
                        {RUPEE_SYMBOL}
                        {((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                      </Text>
                    </View>
                  </View>
                  {index < cart.length - 1 && <View style={s.itemDivider} />}
                </View>
              ))}
            </View>

            {/* Add more items */}
            <Pressable onPress={handleBack} style={s.addMore}>
              <Plus size={16} color="#DC2626" />
              <Text style={s.addMoreText}>Add more items</Text>
            </Pressable>
          </View>

          {/* Note for restaurant */}
          <View style={[s.card, { paddingVertical: sp(4) }]}>
            <Pressable onPress={() => setShowRestaurantNoteInput(!showRestaurantNoteInput)} style={({ pressed }) => [s.noteBtn, pressed && s.notePressed]}>
              <Utensils size={16} color={t.dark ? colors.gray[300] : colors.gray[600]} />
              <Text style={s.noteBtnText} numberOfLines={1}>
                {restaurantNote || 'Add note for restaurant'}
              </Text>
            </Pressable>
          </View>

          {/* Restaurant Note Input */}
          {showRestaurantNoteInput && (
            <View style={s.noteCard}>
              <Text style={s.noteLabel}>Restaurant instructions</Text>
              <TextInput
                value={restaurantNote}
                onChangeText={setRestaurantNote}
                placeholder="Eg. Don't add onions, make it extra spicy, etc."
                placeholderTextColor={colors.gray[400]}
                multiline
                textAlignVertical="top"
                maxLength={240}
                style={s.noteInput}
              />
              <View style={s.noteFoot}>
                <Text style={s.noteFootText}>Note for restaurant.</Text>
                <Text style={s.noteCount}>{restaurantNote.length}/240</Text>
              </View>
            </View>
          )}

          {/* Complete your meal section - Approved Addons */}
          {addons.length > 0 && (
            <View style={[s.card, { paddingVertical: sp(5) }]}>
              <View style={s.addonsHead}>
                <View style={s.addonsIcon}>
                  <Sparkles size={16} color="#DC2626" />
                </View>
                <Text style={s.addonsTitle}>Complete your meal with</Text>
              </View>
              {loadingAddons ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.addonsScroll, { flexGrow: 0 }]} contentContainerStyle={s.addonsRow}>
                  {[1, 2, 3].map((i) => (
                    <View key={i} style={{ width: 112 }}>
                      <AmountSkeleton width={112} height={112} />
                      <AmountSkeleton width={112} height={16} />
                      <AmountSkeleton width={75} height={12} />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <FlatList
                  horizontal
                  data={addons}
                  keyExtractor={(addon, i) => String(addon.id || addon._id || i)}
                  showsHorizontalScrollIndicator={false}
                  style={[s.addonsScroll, { flexGrow: 0 }]}
                  contentContainerStyle={s.addonsRow}
                  renderItem={({ item: addon }) => (
                    <View style={{ width: 112 }}>
                      <View style={s.addonImgWrap}>
                        <AppImage
                          src={addon.image || (addon.images && addon.images[0]) || ADDON_FALLBACK_IMAGE}
                          fallback={ADDON_FALLBACK_IMAGE}
                          style={{ width: '100%', height: 112, borderRadius: 8 }}
                        />
                        <View style={s.addonVeg}>
                          <View style={s.addonVegDot} />
                        </View>
                        <Pressable
                          onPress={() => {
                            const cartRestaurantId = cart[0]?.restaurantId || restaurantId
                            const cartRestaurantName = cart[0]?.restaurant || restaurantName

                            if (!cartRestaurantId || !cartRestaurantName) {
                              debugError('? Cannot add addon: Missing restaurant information', {
                                cartRestaurantId,
                                cartRestaurantName,
                                restaurantId,
                                restaurantName,
                                cartItem: cart[0],
                              })
                              toast.error('Restaurant information is missing. Please refresh the page.')
                              return
                            }

                            Promise.resolve(
                              addToCart({
                                id: addon.id || addon._id,
                                itemId: addon.id || addon._id,
                                itemType: 'addon',
                                name: addon.name,
                                price: addon.price,
                                image: addon.image || (addon.images && addon.images[0]) || '',
                                description: addon.description || '',
                                isVeg: true,
                                restaurant: cartRestaurantName,
                                restaurantId: cartRestaurantId,
                              }),
                            ).then((result) => {
                              if (result && result.ok === false) toast.error(result.error || 'Could not add this add-on')
                            })
                          }}
                          style={({ pressed }) => [s.addonAdd, pressed && { backgroundColor: alpha('#DC2626', t.dark ? 0.06 : 0.02) }]}
                        >
                          <Plus size={14} color="#DC2626" />
                        </Pressable>
                      </View>
                      <Text style={s.addonName} numberOfLines={2}>
                        {addon.name}
                      </Text>
                      {addon.description ? (
                        <Text style={s.addonDesc} numberOfLines={1}>
                          {addon.description}
                        </Text>
                      ) : null}
                      <Text style={s.addonPrice}>
                        {RUPEE_SYMBOL}
                        {addon.price}
                      </Text>
                    </View>
                  )}
                />
              )}
            </View>
          )}

          {/* Simplified Coupon Section */}
          <View style={[s.card, { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }]}>
            <View style={s.couponHead}>
              <Tag size={20} color={colors.gray[400]} />
              <Text style={s.couponHeadText}>Offers & Coupons</Text>
            </View>

            {/* Cart coupon preview */}
            {!appliedCoupon && !couponCode && (
              <View style={{ paddingHorizontal: sp(4), paddingBottom: sp(4), paddingTop: sp(1) }}>
                {filteredCoupons.length > 0 ? (
                  <View>
                    <View style={{ gap: 10 }}>{filteredCoupons.slice(0, 2).map((coupon) => renderCartCouponCard(coupon, { compact: true, blocked: isCartUnavailable }))}</View>
                    <Pressable onPress={openCouponsOrWarn} style={({ pressed }) => [s.moreOffers, { marginTop: 10 }, isCartUnavailable && s.grayed, pressed && s.morePressed]}>
                      <Text style={s.moreOffersText}>
                        {filteredCoupons.length > 2
                          ? `+ ${filteredCoupons.length - 2} more offer${filteredCoupons.length - 2 > 1 ? 's' : ''}`
                          : 'More offers available'}
                      </Text>
                      <View style={s.moreOffersRight}>
                        <Text style={s.moreOffersCta}>VIEW ALL</Text>
                        <ChevronRight size={14} color="#DC2626" />
                      </View>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={openCouponsOrWarn} style={({ pressed }) => [s.moreOffers, isCartUnavailable && s.grayed, pressed && s.morePressed]}>
                    <Text style={s.moreOffersText}>Have a coupon code?</Text>
                    <View style={s.moreOffersRight}>
                      <Text style={s.moreOffersCta}>APPLY</Text>
                      <ChevronRight size={14} color="#DC2626" />
                    </View>
                  </Pressable>
                )}
              </View>
            )}

            {couponCode && !appliedCoupon && (
              <View style={s.couponPending}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
                  <Skeleton width={32} height={32} rounded={16} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.slate[200] }} />
                  <View style={{ gap: 6 }}>
                    <Skeleton width={64} height={12} rounded={4} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.slate[200] }} />
                    <Skeleton width={112} height={16} rounded={4} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.slate[200] }} />
                  </View>
                </View>
                <Skeleton width={64} height={32} rounded={8} style={{ backgroundColor: t.dark ? colors.zinc[800] : colors.slate[200] }} />
              </View>
            )}

            {appliedCoupon && (
              <View style={s.couponApplied}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3), flex: 1, minWidth: 0 }}>
                  <View style={s.couponCheck}>
                    <Check size={16} strokeWidth={3} color={colors.white} />
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={s.appliedLabel}>APPLIED:</Text>
                      <View style={s.appliedChip}>
                        <Text style={s.appliedCode}>{String(appliedCoupon.code || '').toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={s.appliedSaved}>
                      You saved {RUPEE_SYMBOL}
                      {Math.round(discount)}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={handleRemoveCoupon} style={({ pressed }) => [s.removeBtn, pressed && { transform: [{ scale: 0.95 }], backgroundColor: t.dark ? alpha(colors.red[950], 0.4) : alpha(colors.red[100], 0.7) }]}>
                  <Text style={s.removeText}>REMOVE</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Delivery Time - Hidden in Takeaway */}
          {orderType !== 'takeaway' && (
            <View style={[s.card, { paddingVertical: sp(5) }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) }}>
                <View style={{ marginTop: 2 }}>
                  <Zap size={20} color={colors.green[600]} fill={alpha(colors.green[600], 0.2)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.deliveryIn}>
                    Delivery in <Text style={s.deliveryInStrong}>{restaurantData?.estimatedDeliveryTime || '15-20 mins'}</Text>
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Delivery Address or Pickup Info */}
          <View style={[s.card, { paddingVertical: sp(5) }]}>
            {orderType === 'takeaway' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(4) }}>
                <View style={s.pickupIcon}>
                  <ShoppingBag size={24} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pickupLabel}>PICKUP FROM</Text>
                  <Text style={s.pickupName}>{restaurantData?.name || cart[0]?.restaurant || 'Restaurant'}</Text>
                  <Text style={s.pickupAddr} numberOfLines={2}>
                    {restaurantData?.address || restaurantData?.location?.address || 'Restaurant Address'}
                  </Text>
                  <View style={{ marginTop: sp(4), flexDirection: 'row' }}>
                    <View style={s.readyChip}>
                      <CheckCircle2 size={16} color={t.dark ? colors.green[400] : colors.green[600]} />
                      <Text style={s.readyText}>READY FOR PICKUP IN {String(restaurantData?.preparationTime || '25-30').toUpperCase()} MINS</Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(4), flex: 1 }}>
                  <View style={s.addrIcon}>
                    <MapPin size={20} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.deliveryAt}>
                      Delivery at <Text style={{ fontWeight: '600' }}>{deliveryAddressMode === 'current' ? 'Current location' : 'Location'}</Text>
                    </Text>
                    {deliveryAddressMode === 'current' ? (
                      <View style={{ marginTop: sp(1) }}>
                        {currentLocationLoading || !currentLocationAddress ? (
                          <PulseText style={s.addrLine}>Finding your current address...</PulseText>
                        ) : (
                          <Text style={s.addrLine} numberOfLines={2}>
                            {formatFullAddress(currentLocationAddress) ||
                              currentLocationAddress?.formattedAddress ||
                              currentLocationAddress?.address ||
                              'Add delivery address'}
                          </Text>
                        )}
                        <View style={{ marginTop: sp(1), flexDirection: 'row' }}>
                          <View style={s.gpsChip}>
                            <Text style={s.gpsChipText}>GPS enabled</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Text style={[s.addrLineSm, { paddingRight: sp(4) }]} numberOfLines={2}>
                        {defaultAddress
                          ? formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || 'Add delivery address'
                          : 'Add delivery address'}
                      </Text>
                    )}
                    {!hasSavedAddress && <Text style={s.selectLocation}>Select a delivery location to continue</Text>}
                    {/* Address Selection Buttons */}
                    <View style={s.labelChips}>
                      {['Home', 'Work', 'Other'].map((label) => {
                        const normalizedLabel = normalizeAddressLabel(label)
                        const addressExists = addresses.some((addr) => normalizeAddressLabel(addr.label) === normalizedLabel)
                        return (
                          <Pressable
                            key={label}
                            onPress={() => {
                              if (addressExists) {
                                handleSelectAddressByLabel(label)
                              } else {
                                navigate('/food/user/address-selector', {
                                  state: { from: getAppRoutePath(), addLabel: label },
                                })
                              }
                            }}
                            style={({ pressed }) => [s.labelChip, addressExists ? s.labelChipOn : s.labelChipOff, pressed && addressExists && !t.dark && { backgroundColor: colors.slate[200] }]}
                          >
                            <Text style={[s.labelChipText, { color: addressExists ? (t.dark ? colors.gray[300] : colors.slate[700]) : t.dark ? colors.gray[400] : colors.slate[500] }]}>
                              {addressExists ? label : `+ ${label}`}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                    {addresses.length > 0 && (
                      <View style={{ marginTop: sp(4), gap: sp(3) }}>
                        {addresses.map((address) => {
                          const addressId = getAddressId(address)
                          const isSelected = addressId && addressId === selectedAddressId
                          return (
                            <Pressable
                              key={addressId || `${address.label}-${address.street}-${address.city}`}
                              onPress={() => {
                                handleSelectSavedAddress(address)
                              }}
                              style={[s.savedAddr, isSelected ? s.savedAddrOn : null]}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) }}>
                                <View style={{ minWidth: 0, flex: 1 }}>
                                  <Text style={s.savedAddrLabel}>{getDisplayAddressLabel(address.label)}</Text>
                                  <Text style={s.savedAddrLine} numberOfLines={2}>
                                    {formatFullAddress(address) || address.address || 'Address details'}
                                  </Text>
                                </View>
                                {isSelected && (
                                  <View style={s.selectedTag}>
                                    <Text style={s.selectedTagText}>SELECTED</Text>
                                  </View>
                                )}
                              </View>
                            </Pressable>
                          )
                        })}
                      </View>
                    )}
                  </View>
                </View>
                <Pressable onPress={openLocationSelector} accessibilityLabel="Open location selector" style={({ pressed }) => [s.chevBtn, pressed && { backgroundColor: alpha('#DC2626', t.dark ? 0.125 : 0.06) }]}>
                  <ChevronRight size={20} color="#DC2626" />
                </Pressable>
              </View>
            )}
          </View>

          {/* Contact */}
          <View style={[s.card, { paddingVertical: sp(4) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), flex: 1, minWidth: 0 }}>
                <Phone size={16} color={t.dark ? colors.gray[400] : colors.gray[500]} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.contactText}>
                    {recipientName}, <Text style={{ fontWeight: '600' }}>{recipientPhone || '+91-XXXXXXXXXX'}</Text>
                  </Text>
                  <Text style={s.contactSub}>Order recipient details</Text>
                </View>
              </View>
              <Pressable onPress={() => setIsEditingRecipient((prev) => !prev)} hitSlop={6}>
                <Text style={s.changeText}>{isEditingRecipient ? 'Done' : 'Change'}</Text>
              </Pressable>
            </View>

            {isEditingRecipient && (
              <View style={s.recipientForm}>
                <View>
                  <Text style={s.fieldLabel}>Name</Text>
                  <TextInput
                    value={recipientDetails.name}
                    onChangeText={(v) => setRecipientDetails((prev) => ({ ...prev, name: v }))}
                    placeholder="Enter recipient name"
                    placeholderTextColor={colors.gray[400]}
                    style={s.fieldInput}
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>Phone Number</Text>
                  <TextInput
                    value={recipientDetails.phone}
                    onChangeText={(v) => setRecipientDetails((prev) => ({ ...prev, phone: sanitizeRecipientPhone(v) }))}
                    placeholder="Enter recipient phone"
                    placeholderTextColor={colors.gray[400]}
                    keyboardType="phone-pad"
                    style={s.fieldInput}
                  />
                </View>
                <Text style={s.recipientHint}>Ordering for someone else? Save their name and phone number here.</Text>
              </View>
            )}
          </View>

          {/* Bill Details */}
          <View style={[s.card, { paddingVertical: sp(5) }]}>
            <Pressable onPress={() => setShowBillDetails(!showBillDetails)} style={s.billHead}>
              {({ pressed }) => (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
                    <FileText size={20} color={pressed ? '#DC2626' : iconMuted} />
                    <Text style={[s.billTitle, pressed && { color: '#DC2626' }]}>Bill Details</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
                    {loadingPricing ? <AmountSkeleton width={64} height={20} /> : <Text style={s.billTotal}>{`${RUPEE_SYMBOL}${total.toFixed(2)}`}</Text>}
                    <View style={[s.billChevron, pressed && { backgroundColor: alpha('#DC2626', 0.05), borderColor: alpha('#DC2626', 0.2) }]}>
                      <ChevronRight size={16} color={pressed ? '#DC2626' : colors.gray[500]} style={{ transform: [{ rotate: showBillDetails ? '90deg' : '0deg' }] }} />
                    </View>
                  </View>
                </>
              )}
            </Pressable>

            {showBillDetails && (
              <View style={s.billBody}>
                <View style={s.billRow}>
                  <Text style={s.billKey}>Item Total</Text>
                  {loadingPricing ? <AmountSkeleton /> : <Text style={s.billVal}>{`${RUPEE_SYMBOL}${subtotal.toFixed(2)}`}</Text>}
                </View>

                {orderType !== 'takeaway' && (
                  <>
                    <View style={s.billRow}>
                      <Text style={s.billKey}>Delivery Fee</Text>
                      {loadingPricing ? (
                        <AmountSkeleton />
                      ) : (
                        <Text style={[s.billVal, deliveryFee === 0 && { color: '#DC2626' }]}>{deliveryFee === 0 ? 'FREE' : `${RUPEE_SYMBOL}${deliveryFee.toFixed(2)}`}</Text>
                      )}
                    </View>
                    {deliveryFeeBreakdownText && (
                      <View style={s.breakdown}>
                        <Text style={s.breakdownText}>{deliveryFeeBreakdownText}</Text>
                      </View>
                    )}
                    {Number((pricing?.freeDeliveryUpTo ?? feeSettings.freeDeliveryUpTo) || 0) > 0 && (
                      <View style={{ marginTop: -6, flexDirection: 'row' }}>
                        <LinearGradient
                          colors={[alpha('#DC2626', 0.1), alpha('#DC2626', 0.2), alpha('#DC2626', 0.1)]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={s.freeChip}
                        >
                          <Sparkles size={12} color="#DC2626" />
                          <Text style={s.freeChipText}>Free delivery at</Text>
                          <Text style={[s.freeChipText, { color: '#991B1B' }]}>
                            {RUPEE_SYMBOL}
                            {Number((pricing?.freeDeliveryUpTo ?? feeSettings.freeDeliveryUpTo) || 0).toFixed(0)}+
                          </Text>
                        </LinearGradient>
                      </View>
                    )}
                  </>
                )}

                {platformFee > 0 && (
                  <View style={s.billRow}>
                    <Text style={[s.billKey, { fontWeight: '500' }]}>Platform Fee</Text>
                    {loadingPricing ? <AmountSkeleton /> : <Text style={[s.billVal, { fontWeight: '700' }]}>{`${RUPEE_SYMBOL}${platformFee.toFixed(2)}`}</Text>}
                  </View>
                )}
                {(packagingFee > 0 || gstCharges > 0) && (
                  <View style={s.billRow}>
                    <Text style={[s.billKey, { fontWeight: '500' }]}>GST and Restaurant Charges</Text>
                    {loadingPricing ? (
                      <AmountSkeleton />
                    ) : (
                      <Text style={[s.billVal, { fontWeight: '700' }]}>{`${RUPEE_SYMBOL}${(packagingFee + gstCharges).toFixed(2)}`}</Text>
                    )}
                  </View>
                )}
                {discount > 0 && (
                  <View style={s.billRow}>
                    <Text style={[s.billKey, { color: '#DC2626', fontWeight: '500' }]}>Coupon Discount</Text>
                    {loadingPricing ? (
                      <AmountSkeleton tint={alpha('#DC2626', 0.2)} />
                    ) : (
                      <Text style={[s.billVal, { color: '#DC2626' }]}>{`-${RUPEE_SYMBOL}${discount.toFixed(2)}`}</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky - Place Order */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom }]}>
        <View style={s.bottomInner}>
          {/* Pay Using */}
          <Pressable onPress={() => setShowPaymentSheet(true)} style={({ pressed }) => [s.payRow, pressed && s.payRowPressed]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
              <View style={s.payIcon}>
                {selectedPaymentMethod === 'wallet' ? (
                  <Wallet size={20} color="#DC2626" />
                ) : selectedPaymentMethod === 'razorpay' ? (
                  <Zap size={20} color="#DC2626" />
                ) : (
                  <Banknote size={20} color="#DC2626" />
                )}
              </View>
              <View>
                <Text style={s.payingWith}>PAYING WITH</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.payLabel}>{selectedPaymentLabel}</Text>
                  {selectedPaymentMethod === 'wallet' && (
                    <View style={s.walletChip}>
                      {shownWalletBalance === null ? (
                        <NumberSkeleton fontSize={10} color={t.dark ? colors.green[400] : colors.green[600]} />
                      ) : (
                        <Text style={s.walletChipText}>{`${RUPEE_SYMBOL}${shownWalletBalance.toFixed(0)}`}</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
            <View style={s.changeChip}>
              <Text style={s.changeChipText}>CHANGE</Text>
              <ChevronRight size={14} color="#DC2626" />
            </View>
          </Pressable>

          {/* Place Order Button */}
          <Pressable onPress={handlePlaceOrder} disabled={placeDisabled} style={({ pressed }) => [s.placeShadow, placeDisabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}>
            {({ pressed }) => (
              <LinearGradient colors={pressed ? ['#991B1B', '#7F1D1D'] : ['#DC2626', '#991B1B']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.placeBtn}>
                {(selectedPaymentMethod === 'razorpay' || selectedPaymentMethod === 'wallet' || selectedPaymentMethod === 'cash') && (
                  <View style={s.placeTotal}>
                    <Text style={s.placeTotalAmt}>
                      {RUPEE_SYMBOL}
                      {total.toFixed(2)}
                    </Text>
                    <Text style={s.placeTotalLabel}>TOTAL</Text>
                  </View>
                )}
                <View style={s.placeCta}>
                  <Text style={s.placeCtaText}>
                    {isRestaurantClosed
                      ? 'Restaurant Closed'
                      : isCartZoneMismatch
                        ? 'Not Deliverable Here'
                        : isPlacingOrder
                          ? 'Processing...'
                          : loadingPricing
                            ? 'Calculating...'
                            : orderType !== 'takeaway' && !hasSavedAddress
                              ? 'Select Address'
                              : 'Place Order'}
                  </Text>
                  <ChevronRight size={16} color={colors.white} />
                </View>
              </LinearGradient>
            )}
          </Pressable>
        </View>
      </View>

      {/* Placing Order Modal */}
      {showPlacingOrder && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 60, elevation: 60 }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', 0.5) }]} />
          <View style={[s.placingSheet, { paddingBottom: insets.bottom }]}>
            <View style={{ paddingHorizontal: sp(6), paddingVertical: sp(8) }}>
              <Text style={s.placingTitle}>{orderType === 'takeaway' ? 'Placing takeaway order' : 'Placing your order'}</Text>
              <View style={[s.placingRow, { marginBottom: sp(5) }]}>
                <View style={s.placingIcon}>
                  <CreditCard size={24} color={colors.gray[600]} />
                </View>
                <Text style={s.placingMain}>
                  {selectedPaymentMethod === 'razorpay'
                    ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} online (Razorpay)`
                    : selectedPaymentMethod === 'wallet'
                      ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} from Wallet`
                      : 'Pay on delivery (COD)'}
                </Text>
              </View>
              <View style={[s.placingRow, { marginBottom: sp(8) }]}>
                <View style={[s.placingIcon, { backgroundColor: colors.gray[50] }]}>
                  <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.gray[600]} strokeWidth={1.5}>
                    <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <Path d="M9 22V12h6v10" />
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.placingMain}>{orderType === 'takeaway' ? 'Picking up from Restaurant' : 'Delivering to Location'}</Text>
                  <Text style={s.placingSub}>
                    {orderType === 'takeaway'
                      ? restaurantData?.name || cart[0]?.restaurant || 'Restaurant'
                      : defaultAddress
                        ? formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || 'Address'
                        : 'Add address'}
                  </Text>
                  <Text style={s.placingSub2}>
                    {orderType === 'takeaway'
                      ? restaurantData?.address || restaurantData?.location?.address || 'Restaurant Address'
                      : defaultAddress
                        ? formatFullAddress(defaultAddress) || 'Address'
                        : 'Address'}
                  </Text>
                </View>
              </View>
              <ProgressBar progress={orderProgress} />
              <Pressable
                onPress={() => {
                  setShowPlacingOrder(false)
                  setIsPlacingOrder(false)
                }}
                style={{ alignItems: 'flex-end' }}
              >
                <Text style={s.placingCancel}>CANCEL</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Order Success Celebration Page */}
      {showOrderSuccess && <OrderSuccessView t={t} s={s} orderType={orderType} restaurantData={restaurantData} defaultAddress={defaultAddress} onTrack={handleGoToOrders} />}

      {/* Payment Selection Bottom Sheet */}
      <Sheet open={showPaymentSheet} onClose={() => setShowPaymentSheet(false)} backdropOpacity={0.6} style={s.paySheet}>
        <View style={{ padding: sp(5), flexShrink: 1 }}>
          <View style={s.dragHandle} />
          <View style={s.paySheetHead}>
            <View>
              <Text style={s.paySheetTitle}>Payment Method</Text>
              <Text style={s.paySheetSub}>SELECT HOW YOU WANT TO PAY</Text>
            </View>
            <Pressable onPress={() => setShowPaymentSheet(false)} style={s.closeCircle}>
              <X size={16} color={colors.gray[500]} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: sp(3), paddingBottom: sp(4) }}>
            {paymentOptions.map((option) => {
              const selected = selectedPaymentMethod === option.id
              const OptionIcon = option.Icon
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    if (!option.disabled) {
                      setSelectedPaymentMethod(option.id)
                      setShowPaymentSheet(false)
                    }
                  }}
                  style={({ pressed }) => [s.payOption, selected ? s.payOptionOn : s.payOptionOff, option.disabled && { opacity: 0.4 }, pressed && !option.disabled && { transform: [{ scale: 0.98 }] }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(4), flex: 1 }}>
                    <View style={[s.payOptIcon, { backgroundColor: selected ? alpha('#ffffff', 0.2) : option.bg }]}>
                      <OptionIcon size={20} color={selected ? colors.white : option.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                        <Text style={[s.payOptName, { color: selected ? colors.white : t.dark ? colors.gray[100] : colors.gray[900] }]}>{option.name}</Text>
                        {option.badge && (
                          <View style={[s.payBadge, { backgroundColor: selected ? alpha('#ffffff', 0.2) : t.dark ? alpha(colors.emerald[900], 0.3) : colors.emerald[100] }]}>
                            <Text style={[s.payBadgeText, { color: selected ? colors.white : t.dark ? colors.emerald[400] : colors.emerald[700] }]}>{option.badge}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={[s.payOptDesc, { color: selected ? alpha('#ffffff', 0.8) : colors.gray[400] }]}>{option.description}</Text>
                        {option.subInfo && !option.disabled && (
                          <>
                            <View style={[s.payDot, { backgroundColor: selected ? alpha('#ffffff', 0.4) : t.dark ? colors.orange[700] : colors.orange[300] }]} />
                            {option.subInfo === 'skeleton' ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Text style={[s.paySub, { color: selected ? colors.white : t.dark ? colors.green[500] : colors.green[600] }]}>BAL:</Text>
                                <NumberSkeleton fontSize={10} color={selected ? colors.white : colors.green[600]} />
                              </View>
                            ) : (
                              <Text style={[s.paySub, { color: selected ? colors.white : t.dark ? colors.green[500] : colors.green[600] }]}>{String(option.subInfo).toUpperCase()}</Text>
                            )}
                          </>
                        )}
                      </View>
                      {option.disabled && <Text style={s.payDisabled}>{String(option.disabledText).toUpperCase()}</Text>}
                    </View>
                  </View>
                  <View style={[s.radio, selected ? { backgroundColor: colors.white, borderColor: colors.white } : { borderColor: t.dark ? colors.gray[700] : colors.gray[200] }]}>
                    {selected && <Check size={14} color="#DC2626" strokeWidth={4} />}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={s.payFoot}>
            <View>
              <Text style={s.totalPayLabel}>TOTAL PAY</Text>
              <Text style={s.totalPay}>
                {RUPEE_SYMBOL}
                {total.toFixed(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Button onPress={() => setShowPaymentSheet(false)} style={s.confirmBtn} textStyle={s.confirmText}>
                Confirm Order
              </Button>
            </View>
          </View>
        </View>
      </Sheet>

      {/* All Coupons Bottom Sheet */}
      <Sheet open={showCouponSheet && !appliedCoupon && !isCartUnavailable} onClose={() => setShowCouponSheet(false)} backdropOpacity={0.6} style={s.couponSheet}>
        <View style={s.couponSheetHead}>
          <View>
            <Text style={s.couponSheetTitle}>All Offers & Coupons</Text>
            <Text style={s.couponSheetSub}>
              {filteredCoupons.length} offer{filteredCoupons.length === 1 ? '' : 's'} available
            </Text>
          </View>
          <Pressable onPress={() => setShowCouponSheet(false)} accessibilityLabel="Close coupons" style={s.closeCircle}>
            <X size={16} color={colors.gray[500]} />
          </Pressable>
        </View>

        <View style={s.codeRowWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
            <View style={s.codeInputBox}>
              <TextInput
                value={manualCouponCode}
                onChangeText={(v) => setManualCouponCode(v.toUpperCase())}
                placeholder="Enter coupon code"
                placeholderTextColor={alpha(colors.gray[400], 0.85)}
                autoCapitalize="characters"
                style={s.codeInput}
              />
            </View>
            <Pressable onPress={handleApplyCouponCode} disabled={isCartUnavailable} style={({ pressed }) => [s.codeApply, isCartUnavailable && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Text style={s.codeApplyText}>APPLY</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: sp(5), paddingVertical: sp(4), gap: sp(3) }}>
          {loadingCoupons ? (
            <Text style={s.sheetEmpty}>Loading offers...</Text>
          ) : filteredCoupons.length > 0 ? (
            filteredCoupons.map((coupon) => renderCartCouponCard(coupon, { blocked: isCartUnavailable }))
          ) : (
            <Text style={s.sheetEmpty}>No offers available right now. You can still enter a coupon code above.</Text>
          )}
        </ScrollView>
      </Sheet>

      {/* Share Modal */}
      <Dialog open={Boolean(showShareModal && sharePayload)} onClose={() => setShowShareModal(false)} style={s.shareDialog}>
        <View style={s.shareHead}>
          <Text style={s.shareTitle} numberOfLines={1}>
            Share
          </Text>
          <Pressable onPress={() => setShowShareModal(false)} accessibilityLabel="Close share modal" style={{ padding: 4, borderRadius: 6 }}>
            <X size={16} color={t.dark ? colors.gray[300] : colors.gray[600]} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: sp(5), paddingVertical: sp(4), gap: sp(2) }}>
          {[
            typeof navigator !== 'undefined' && navigator.share ? { key: 'system', Icon: Share2, label: 'Share via system apps', onPress: handleSystemShareFromModal } : null,
            { key: 'whatsapp', Icon: MessageCircle, label: 'WhatsApp', onPress: () => openShareTarget('whatsapp') },
            { key: 'telegram', Icon: Send, label: 'Telegram', onPress: () => openShareTarget('telegram') },
            { key: 'email', Icon: Mail, label: 'Email', onPress: () => openShareTarget('email') },
            { key: 'copy', Icon: Copy, label: 'Copy link', onPress: copyShareLink },
          ]
            .filter(Boolean)
            .map(({ key, Icon, label, onPress }) => (
              <Pressable key={key} onPress={onPress} style={({ pressed }) => [s.shareRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}>
                <Icon size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
                <Text style={s.shareRowText}>{label}</Text>
              </Pressable>
            ))}
        </View>
      </Dialog>

      {/* Auto Apply Coupon Popup Sheet */}
      <Sheet
        open={Boolean(showAutoCouponPopup && bestCoupon && !isCartUnavailable)}
        onClose={() => setShowAutoCouponPopup(false)}
        backdropOpacity={0.6}
        style={s.autoSheet}
      >
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={() => setShowAutoCouponPopup(false)} style={s.autoClose}>
            <X size={20} color={colors.white} />
          </Pressable>
        </View>
        {bestCoupon ? (
          <View style={[s.autoCard, { paddingBottom: sp(8) + insets.bottom }]}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, alignItems: 'center' }]}>
              <CouponSunburst />
            </View>

            <View style={s.autoIconWrap}>
              <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={80} height={80} viewBox="0 0 100 100" fill={t.dark ? colors.blue[500] : '#3B82F6'}>
                  <Path d="M 86.29 42.78 Q 95.00 50.00 86.29 57.22 Q 91.57 67.22 80.76 70.56 Q 81.82 81.82 70.56 80.76 Q 67.22 91.57 57.22 86.29 Q 50.00 95.00 42.78 86.29 Q 32.78 91.57 29.44 80.76 Q 18.18 81.82 19.24 70.56 Q 8.43 67.22 13.71 57.22 Q 5.00 50.00 13.71 42.78 Q 8.43 32.78 19.24 29.44 Q 18.18 18.18 29.44 19.24 Q 32.78 8.43 42.78 13.71 Q 50.00 5.00 57.22 13.71 Q 67.22 8.43 70.56 19.24 Q 81.82 18.18 80.76 29.44 Q 91.57 32.78 86.29 42.78 Z" />
                </Svg>
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Percent size={36} color={colors.white} />
                </View>
              </View>
            </View>

            <Text style={s.autoTag}>✦ EXCLUSIVELY FOR YOU ✦</Text>
            <Text style={s.autoTitle}>
              Save <Text style={{ color: t.dark ? colors.blue[400] : '#3B82F6', fontWeight: '800' }}>{RUPEE_SYMBOL}{bestCouponDiscount}</Text> on this order
            </Text>
            <Text style={s.autoCode}>
              with coupon '<Text style={{ color: t.dark ? colors.gray[200] : colors.gray[900], fontWeight: '800' }}>{String(bestCoupon.code || '').toUpperCase()}</Text>'
            </Text>
            <Text style={s.autoTip}>Tap on 'APPLY' to avail this</Text>
            <Pressable onPress={handleApplyAutoCoupon} style={({ pressed }) => [s.autoApply, pressed && { backgroundColor: '#B91C1C', transform: [{ scale: 0.95 }] }]}>
              <Text style={s.autoApplyText}>APPLY</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      {/* Placing Order Loading Overlay */}
      {isPlacingOrder && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100000, elevation: 100 }]}>
          <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.placingOverlay]}>
            <View style={{ alignItems: 'center', gap: sp(4), paddingHorizontal: sp(6) }}>
              <SpinRing size={64} width={4} color={t.dark ? colors.red[500] : '#DC2626'} trackColor={t.dark ? colors.gray[800] : colors.gray[200]} />
              <Text style={s.overlayTitle}>Placing Your Order...</Text>
              <Text style={s.overlayText}>
                {selectedPaymentMethod === 'razorpay'
                  ? 'Please wait while we verify your payment. Do not close or refresh the page.'
                  : 'We are creating your order. Please wait.'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Screen>
  )
}

const useStyles = makeStyles((t) => {
  const d = t.dark
  const cardBg = d ? '#1a1a1a' : colors.white
  const cardBorder = d ? colors.gray[800] : colors.slate[100]
  return {
    errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900], marginBottom: sp(4) },
    errorText: { color: d ? colors.gray[400] : colors.gray[600], textAlign: 'center' },
    errorBtn: { marginTop: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(2), backgroundColor: colors.red[600], borderRadius: 8 },

    emptyHeader: { backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: d ? colors.gray[800] : '#e6e0d1' },
    emptyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3) },
    emptyHeaderTitle: { fontWeight: '600', color: d ? colors.white : colors.gray[800] },
    emptyBody: { alignItems: 'center', justifyContent: 'center', paddingVertical: sp(20), paddingHorizontal: sp(4) },
    emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center', marginBottom: sp(4) },
    emptyTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: d ? colors.white : colors.gray[800], marginBottom: sp(1) },
    emptyText: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[500], marginBottom: sp(4), textAlign: 'center' },

    header: { backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: d ? alpha(colors.gray[800], 0.8) : alpha(colors.gray[100], 0.8), zIndex: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingVertical: 10 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flex: 1, minWidth: 0 },
    roundBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: d ? alpha(colors.gray[800], 0.9) : alpha('#ffffff', 0.9),
      borderWidth: 1,
      borderColor: d ? alpha(colors.gray[700], 0.5) : alpha(colors.gray[100], 0.5),
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.sm,
    },
    roundBtnPressed: { backgroundColor: d ? colors.gray[700] : colors.gray[50], transform: [{ scale: 0.95 }] },
    headerTitleWrap: { minWidth: 0, flex: 1, marginLeft: sp(2) },
    headerTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: d ? colors.white : '#1C2534', letterSpacing: -0.4 },
    closedText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: d ? colors.red[400] : colors.red[600], marginTop: 2 },

    zoneCard: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: d ? alpha(colors.amber[800], 0.5) : alpha(colors.amber[200], 0.8),
      elevation: 3,
      shadowColor: 'rgb(245,158,11)',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    zoneStripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
    zoneBody: { padding: sp(4), paddingLeft: sp(5), flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    zoneIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: d ? alpha(colors.amber[900], 0.4) : colors.amber[100],
      borderWidth: 1,
      borderColor: d ? alpha(colors.amber[800], 0.6) : alpha(colors.amber[200], 0.7),
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.sm,
    },
    zoneTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: d ? colors.amber[100] : colors.amber[950], letterSpacing: -0.3 },
    zoneText: { fontSize: 12, lineHeight: 19, color: d ? alpha(colors.amber[200], 0.7) : alpha(colors.amber[800], 0.8), marginTop: sp(1) },
    zoneActions: { marginTop: sp(3), flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp(2) },
    zoneBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 10, backgroundColor: colors.amber[600], ...shadow.sm },
    zoneBtnPrimaryText: { color: colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    zoneBtnSecondary: {
      paddingHorizontal: sp(3),
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: d ? colors.gray[900] : colors.white,
      borderWidth: 1,
      borderColor: d ? alpha(colors.amber[800], 0.7) : colors.amber[200],
    },
    zoneBtnSecondaryText: { color: d ? colors.amber[200] : colors.amber[800], fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

    savingsBanner: {
      backgroundColor: d ? alpha(colors.green[950], 0.2) : colors.green[50],
      paddingHorizontal: sp(4),
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp(2),
      borderBottomWidth: 1,
      borderBottomColor: d ? alpha(colors.green[900], 0.1) : alpha(colors.green[100], 0.3),
    },
    savingsText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: d ? colors.green[400] : colors.green[700] },

    main: { paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(2) },
    card: { backgroundColor: cardBg, paddingHorizontal: sp(4), borderRadius: 16, borderWidth: 1, borderColor: cardBorder, ...shadow.sm },
    grayed: { opacity: 0.6 },

    itemRow: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
    vegBox: { width: 16, height: 16, borderWidth: 2, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    vegDot: { width: 8, height: 8, borderRadius: 4 },
    itemMid: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: sp(4) },
    itemImgWrap: { width: 64, height: 64, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: d ? colors.gray[800] : colors.gray[100], ...shadow.sm },
    itemName: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900] },
    variantChip: {
      alignSelf: 'flex-start',
      marginTop: sp(1),
      backgroundColor: d ? alpha(colors.red[950], 0.2) : colors.red[50],
      borderWidth: 1,
      borderColor: d ? alpha(colors.red[900], 0.3) : alpha(colors.red[100], 0.5),
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
    },
    variantText: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: d ? colors.red[300] : colors.red[600] },
    itemClosed: { fontSize: 11, lineHeight: 15, color: d ? colors.red[400] : colors.red[500], fontWeight: '600', marginTop: sp(1) },
    itemZone: { fontSize: 11, lineHeight: 15, color: d ? colors.amber[400] : colors.amber[600], fontWeight: '600', marginTop: sp(1) },
    itemRight: { alignItems: 'flex-end', gap: 10 },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: alpha('#DC2626', d ? 0.4 : 0.3),
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: d ? colors.gray[900] : colors.white,
      ...shadow.sm,
    },
    stepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    stepPressed: { backgroundColor: alpha('#DC2626', 0.05) },
    stepQty: { paddingHorizontal: sp(2), fontSize: 14, lineHeight: 20, fontWeight: '900', color: '#DC2626', minWidth: 28, textAlign: 'center' },
    itemPrice: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: d ? colors.gray[100] : colors.gray[900] },
    itemDivider: { marginTop: sp(6), borderBottomWidth: 1, borderStyle: 'dashed', borderColor: d ? alpha(colors.gray[800], 0.4) : colors.gray[100] },
    addMore: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginTop: sp(4), alignSelf: 'flex-start' },
    addMoreText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#DC2626' },

    noteBtn: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp(2),
      paddingHorizontal: sp(3),
      paddingVertical: sp(2),
      borderWidth: 1,
      borderColor: d ? colors.gray[700] : colors.gray[200],
      borderRadius: 8,
    },
    notePressed: { backgroundColor: d ? colors.gray[800] : colors.gray[50] },
    noteBtnText: { flex: 1, fontSize: 14, lineHeight: 20, color: d ? colors.gray[300] : colors.gray[600] },
    noteCard: { backgroundColor: cardBg, paddingHorizontal: sp(4), paddingVertical: sp(3), borderRadius: 8, borderWidth: 1, borderColor: cardBorder },
    noteLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: d ? colors.gray[400] : colors.gray[500], marginBottom: sp(2) },
    noteInput: {
      width: '100%',
      height: 80,
      borderWidth: 1,
      borderColor: d ? colors.gray[700] : colors.gray[200],
      borderRadius: 8,
      padding: sp(3),
      fontSize: 14,
      backgroundColor: d ? '#0a0a0a' : colors.white,
      color: d ? colors.gray[100] : colors.gray[900],
    },
    noteFoot: { marginTop: sp(2), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(3) },
    noteFootText: { fontSize: 11, lineHeight: 15, color: d ? colors.gray[400] : colors.gray[500] },
    noteCount: { fontSize: 11, lineHeight: 15, color: d ? colors.gray[500] : colors.gray[400] },

    addonsHead: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(3) },
    addonsIcon: { width: 24, height: 24, borderRadius: 4, backgroundColor: d ? colors.gray[800] : colors.gray[100], alignItems: 'center', justifyContent: 'center' },
    addonsTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: d ? colors.gray[200] : colors.gray[800] },
    addonsScroll: { marginHorizontal: -sp(4) },
    addonsRow: { gap: sp(3), paddingHorizontal: sp(4), paddingBottom: sp(2) },
    addonImgWrap: { position: 'relative', backgroundColor: d ? colors.gray[800] : colors.gray[100], borderRadius: 8, overflow: 'hidden' },
    addonVeg: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 14,
      height: 14,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.green[600],
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addonVegDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green[600] },
    addonAdd: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 24,
      height: 24,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: '#DC2626',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.sm,
    },
    addonName: { fontSize: 12, lineHeight: 15, fontWeight: '500', color: d ? colors.gray[200] : colors.gray[800], marginTop: 6 },
    addonDesc: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500], marginTop: 2 },
    addonPrice: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: d ? colors.gray[200] : colors.gray[800], marginTop: 2 },

    couponHead: { width: '100%', paddingHorizontal: sp(4), paddingVertical: sp(4), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    couponHeadText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: d ? colors.gray[200] : colors.gray[800] },
    couponCard: {
      backgroundColor: alpha('#DC2626', d ? 0.1 : 0.05),
      borderWidth: 1,
      borderColor: alpha('#DC2626', d ? 0.2 : 0.1),
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: sp(3),
    },
    couponCardCompact: { padding: sp(3) },
    couponCardFull: { padding: 14 },
    couponLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
    couponIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: d ? alpha('#DC2626', 0.2) : colors.red[100], alignItems: 'center', justifyContent: 'center' },
    couponTitleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexWrap: 'wrap' },
    couponCodeChip: {
      backgroundColor: d ? colors.gray[900] : colors.white,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: alpha('#DC2626', 0.3),
      paddingHorizontal: sp(2),
      paddingVertical: 2,
      borderRadius: 4,
      ...shadow.sm,
    },
    couponCodeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: '#DC2626', letterSpacing: 0.5 },
    couponSave: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: d ? colors.gray[100] : colors.gray[900] },
    couponDesc: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    couponHint: { fontSize: 9, lineHeight: 13, fontWeight: '600', color: d ? colors.gray[500] : colors.gray[400], marginTop: 2 },
    couponApply: { paddingHorizontal: sp(4), paddingVertical: 6, borderRadius: 8, borderWidth: 1, ...shadow.sm },
    couponApplyOn: { backgroundColor: d ? colors.gray[900] : colors.white, borderColor: alpha('#DC2626', 0.2) },
    couponApplyOff: { backgroundColor: d ? alpha(colors.gray[900], 0.5) : colors.gray[50], borderColor: d ? colors.gray[800] : colors.gray[200] },
    couponApplyText: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.6 },
    moreOffers: {
      width: '100%',
      paddingVertical: 10,
      paddingHorizontal: sp(4),
      backgroundColor: d ? alpha(colors.gray[900], 0.3) : alpha(colors.gray[50], 0.5),
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: d ? colors.gray[800] : colors.gray[200],
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    morePressed: { backgroundColor: d ? alpha(colors.gray[900], 0.5) : colors.gray[50], transform: [{ scale: 0.98 }] },
    moreOffersText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#DC2626' },
    moreOffersRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    moreOffersCta: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.5, color: '#DC2626' },
    couponPending: {
      paddingHorizontal: sp(4),
      paddingVertical: sp(4),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: d ? alpha(colors.zinc[900], 0.3) : alpha(colors.slate[50], 0.5),
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderTopColor: d ? alpha(colors.zinc[800], 0.6) : colors.slate[100],
    },
    couponApplied: {
      paddingHorizontal: sp(4),
      paddingVertical: 14,
      backgroundColor: d ? alpha(colors.emerald[950], 0.1) : alpha(colors.emerald[50], 0.5),
      borderTopWidth: 1,
      borderTopColor: d ? alpha(colors.emerald[900], 0.3) : alpha(colors.emerald[100], 0.6),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    couponCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.emerald[500], alignItems: 'center', justifyContent: 'center', ...shadow.sm },
    appliedLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: d ? colors.gray[400] : colors.gray[500], letterSpacing: 0.5 },
    appliedChip: {
      backgroundColor: d ? alpha(colors.emerald[900], 0.4) : alpha(colors.emerald[100], 0.6),
      paddingHorizontal: sp(2),
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: alpha(colors.emerald[500], 0.3),
    },
    appliedCode: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: d ? colors.emerald[300] : colors.emerald[700], letterSpacing: 0.5 },
    appliedSaved: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: d ? colors.emerald[400] : colors.emerald[600], marginTop: 2 },
    removeBtn: {
      paddingHorizontal: sp(3),
      paddingVertical: 6,
      backgroundColor: d ? alpha(colors.red[950], 0.2) : colors.red[50],
      borderWidth: 1,
      borderColor: d ? alpha(colors.red[900], 0.3) : colors.red[100],
      borderRadius: 8,
    },
    removeText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: d ? colors.red[400] : colors.red[600] },

    deliveryIn: { fontSize: 16, lineHeight: 24, color: d ? colors.gray[200] : colors.gray[800] },
    deliveryInStrong: { color: colors.green[600], fontWeight: '700' },

    pickupIcon: { backgroundColor: alpha('#DC2626', d ? 0.06 : 0.02), padding: 14, borderRadius: 16, borderWidth: 1, borderColor: alpha('#DC2626', d ? 0.19 : 0.08) },
    pickupLabel: { fontSize: 12, lineHeight: 12, fontWeight: '900', color: colors.gray[400], letterSpacing: 1.2 },
    pickupName: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: d ? colors.white : colors.gray[900], marginTop: 6 },
    pickupAddr: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1), fontWeight: '500' },
    readyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp(2),
      backgroundColor: d ? alpha(colors.green[900], 0.1) : colors.green[50],
      paddingHorizontal: sp(3),
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: d ? alpha(colors.green[900], 0.2) : colors.green[100],
    },
    readyText: { fontSize: 11, lineHeight: 15, fontWeight: '900', color: d ? colors.green[400] : colors.green[600], letterSpacing: -0.2, flexShrink: 1 },

    addrIcon: { backgroundColor: alpha('#DC2626', d ? 0.06 : 0.02), padding: sp(2), borderRadius: 12, marginTop: 2 },
    deliveryAt: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[200] : colors.gray[800] },
    addrLine: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500] },
    addrLineSm: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    gpsChip: {
      borderRadius: 999,
      paddingHorizontal: sp(2),
      paddingVertical: 2,
      backgroundColor: alpha('#DC2626', d ? 0.06 : 0.02),
      borderWidth: 1,
      borderColor: alpha('#DC2626', 0.3),
    },
    gpsChipText: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: '#DC2626' },
    selectLocation: { fontSize: 14, lineHeight: 20, color: '#DC2626', marginTop: sp(2), fontWeight: '500' },
    labelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(3) },
    labelChip: { paddingHorizontal: sp(4), paddingVertical: 6, borderRadius: 999 },
    labelChipOn: { backgroundColor: d ? colors.gray[800] : colors.slate[100] },
    labelChipOff: { backgroundColor: d ? colors.gray[900] : colors.white, borderWidth: 1, borderStyle: 'dashed', borderColor: d ? colors.gray[700] : colors.slate[300] },
    labelChipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
    savedAddr: { width: '100%', borderRadius: 14, borderWidth: 2, borderColor: d ? colors.gray[800] : colors.slate[100], padding: sp(3) },
    savedAddrOn: { borderColor: '#DC2626', backgroundColor: alpha('#DC2626', d ? 0.05 : 0.02) },
    savedAddrLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900] },
    savedAddrLine: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    selectedTag: { backgroundColor: '#DC2626', paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 4 },
    selectedTagText: { fontSize: 10, lineHeight: 14, color: colors.white, fontWeight: '700', letterSpacing: 0.5 },
    chevBtn: { padding: sp(2), borderRadius: 999, backgroundColor: alpha('#DC2626', d ? 0.08 : 0.02) },

    contactText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: d ? colors.gray[200] : colors.gray[800] },
    contactSub: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    changeText: { color: '#DC2626', fontSize: 12, lineHeight: 16, fontWeight: '600' },
    recipientForm: { marginTop: sp(4), paddingTop: sp(4), borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: d ? colors.gray[800] : colors.gray[200], gap: sp(3) },
    fieldLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: d ? colors.gray[400] : colors.gray[500], marginBottom: 6 },
    fieldInput: {
      width: '100%',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: d ? colors.gray[700] : colors.gray[200],
      backgroundColor: d ? '#111111' : colors.white,
      paddingHorizontal: sp(3),
      paddingVertical: 10,
      fontSize: 14,
      color: d ? colors.gray[100] : colors.gray[900],
    },
    recipientHint: { fontSize: 11, lineHeight: 15, color: d ? colors.gray[400] : colors.gray[500] },

    billHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    billTitle: { fontSize: 16, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4, color: d ? colors.gray[100] : colors.gray[900] },
    billTotal: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: d ? colors.white : colors.gray[900] },
    billChevron: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: d ? colors.gray[800] : colors.slate[50],
      borderWidth: 1,
      borderColor: d ? colors.gray[700] : colors.slate[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    billBody: { marginTop: sp(4), paddingTop: sp(4), borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: d ? colors.gray[800] : colors.gray[200], gap: sp(3) },
    billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    billKey: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[600] },
    billVal: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: d ? colors.gray[200] : colors.gray[800] },
    breakdown: { marginTop: -6, marginLeft: 4, borderLeftWidth: 2, borderLeftColor: colors.gray[100], paddingLeft: sp(2) },
    breakdownText: { fontSize: 11, lineHeight: 15, color: d ? colors.gray[400] : colors.gray[500] },
    freeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: alpha('#DC2626', 0.25),
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    freeChipText: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: '#DC2626' },

    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: cardBg,
      borderTopWidth: 1,
      borderTopColor: d ? colors.gray[800] : '#e6e0d1',
      zIndex: 30,
      ...shadow.lg,
    },
    bottomInner: { paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(3) },
    payRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: sp(2),
      backgroundColor: d ? '#222222' : colors.gray[50],
      borderRadius: 14,
      borderWidth: 1,
      borderColor: d ? colors.gray[800] : colors.gray[100],
      ...shadow.sm,
    },
    payRowPressed: { backgroundColor: d ? '#282828' : colors.gray[100], transform: [{ scale: 0.98 }] },
    payIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: alpha('#DC2626', d ? 0.125 : 0.06), alignItems: 'center', justifyContent: 'center' },
    payingWith: { fontSize: 10, lineHeight: 13, letterSpacing: 0.5, color: d ? colors.gray[400] : colors.gray[500], fontWeight: '700', opacity: 0.8 },
    payLabel: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[800] },
    walletChip: { backgroundColor: d ? alpha(colors.green[900], 0.2) : colors.green[50], paddingHorizontal: 4, borderRadius: 4 },
    walletChipText: { fontSize: 10, lineHeight: 14, color: d ? colors.green[400] : colors.green[600], fontWeight: '700' },
    changeChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: alpha('#DC2626', d ? 0.06 : 0.02), paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    changeChipText: { color: '#DC2626', fontWeight: '700', fontSize: 11, letterSpacing: 1.1 },
    placeShadow: { borderRadius: 16, elevation: 8, shadowColor: '#DC2626', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
    placeBtn: {
      height: 48,
      borderRadius: 16,
      paddingHorizontal: sp(6),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 4,
      borderBottomColor: alpha(colors.red[900], 0.3),
    },
    placeTotal: { justifyContent: 'center', borderRightWidth: 1.5, borderRightColor: alpha('#ffffff', 0.2), paddingRight: sp(4) },
    placeTotalAmt: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: alpha('#ffffff', 0.9) },
    placeTotalLabel: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5, color: alpha('#ffffff', 0.8), marginTop: -2 },
    placeCta: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' },
    placeCtaText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.white, letterSpacing: 0.4 },

    placingSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...shadow['2xl'] },
    placingTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.gray[900], marginBottom: sp(6) },
    placingRow: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
    placingIcon: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.gray[200], alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, ...shadow.sm },
    placingMain: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[900], flexShrink: 1 },
    placingSub: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginTop: sp(1) },
    placingSub2: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
    placingCancel: { color: '#DC2626', fontWeight: '600', fontSize: 16 },

    successPage: { zIndex: 70, elevation: 70, backgroundColor: d ? '#0a0a0a' : colors.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    successContent: { zIndex: 10, alignItems: 'center', paddingHorizontal: sp(6) },
    successRing: { position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 4, borderColor: d ? colors.green[400] : colors.green[500] },
    successCircle: {
      width: 128,
      height: 128,
      borderRadius: 64,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 16,
      shadowColor: d ? colors.green[900] : colors.green[200],
      shadowOpacity: 0.6,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 20 },
    },
    successLocRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2), marginBottom: sp(2) },
    successCity: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: d ? colors.white : colors.gray[900] },
    successAddr: { color: d ? colors.gray[400] : colors.gray[500], fontSize: 16, lineHeight: 24, maxWidth: 384, textAlign: 'center' },
    successTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: d ? '#a65d8a' : '#DC2626', marginBottom: sp(2) },
    successSub: { color: d ? colors.gray[300] : colors.gray[600], textAlign: 'center' },
    trackBtn: {
      marginTop: sp(10),
      backgroundColor: '#DC2626',
      paddingVertical: sp(4),
      paddingHorizontal: sp(12),
      borderRadius: 14,
      elevation: 8,
      shadowColor: '#DC2626',
      shadowOpacity: d ? 0.4 : 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    trackBtnText: { color: colors.white, fontWeight: '600', fontSize: 16 },

    paySheet: { maxHeight: '82%', borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: cardBg },
    dragHandle: { width: 40, height: 4, backgroundColor: d ? colors.gray[800] : colors.gray[200], borderRadius: 999, alignSelf: 'center', marginBottom: sp(5) },
    paySheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(5) },
    paySheetTitle: { fontSize: 20, lineHeight: 22, fontWeight: '800', color: d ? colors.white : colors.gray[900] },
    paySheetSub: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.gray[400], letterSpacing: -0.3, marginTop: sp(1) },
    closeCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: d ? colors.gray[800] : colors.gray[100], alignItems: 'center', justifyContent: 'center' },
    payOption: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: sp(4), borderRadius: 16, borderWidth: 2 },
    payOptionOn: { borderColor: '#DC2626', backgroundColor: '#DC2626', elevation: 8, shadowColor: '#DC2626', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
    payOptionOff: { borderColor: d ? alpha(colors.gray[800], 0.8) : colors.gray[100], backgroundColor: d ? '#222222' : colors.white, ...shadow.sm },
    payOptIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    payOptName: { fontSize: 14, lineHeight: 16, fontWeight: '900', letterSpacing: -0.3 },
    payBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
    payBadgeText: { fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.4 },
    payOptDesc: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
    payDot: { width: 4, height: 4, borderRadius: 2 },
    paySub: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: -0.3 },
    payDisabled: { fontSize: 9, lineHeight: 13, fontWeight: '900', color: colors.red[500], marginTop: sp(1), letterSpacing: 0.3 },
    radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    payFoot: { paddingTop: sp(4), borderTopWidth: 1, borderTopColor: d ? colors.gray[800] : colors.gray[100], flexDirection: 'row', alignItems: 'center', gap: sp(4), backgroundColor: cardBg },
    totalPayLabel: { fontSize: 10, lineHeight: 10, fontWeight: '700', color: colors.gray[400], letterSpacing: 1, marginBottom: sp(1) },
    totalPay: { fontSize: 20, lineHeight: 28, fontWeight: '900', color: '#DC2626', fontVariant: ['tabular-nums'] },
    confirmBtn: { backgroundColor: '#DC2626', height: 44, borderRadius: 14 },
    confirmText: { color: colors.white, fontSize: 14, fontWeight: '700' },

    couponSheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: cardBg, borderWidth: 1, borderColor: d ? colors.gray[800] : colors.gray[100] },
    couponSheetHead: {
      paddingHorizontal: sp(5),
      paddingTop: sp(5),
      paddingBottom: sp(4),
      borderBottomWidth: 1,
      borderBottomColor: d ? colors.gray[800] : colors.gray[100],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: sp(3),
    },
    couponSheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: d ? colors.gray[100] : colors.gray[900] },
    couponSheetSub: { fontSize: 12, lineHeight: 16, color: d ? colors.gray[400] : colors.gray[500], marginTop: 2 },
    codeRowWrap: {
      paddingHorizontal: sp(5),
      paddingVertical: sp(4),
      borderBottomWidth: 1,
      borderBottomColor: d ? colors.gray[800] : colors.gray[100],
      backgroundColor: d ? alpha(colors.gray[900], 0.3) : alpha(colors.gray[50], 0.6),
    },
    codeInputBox: {
      flex: 1,
      backgroundColor: d ? colors.gray[950] : colors.white,
      borderRadius: 14,
      paddingHorizontal: sp(4),
      height: 44,
      borderWidth: 1,
      borderColor: d ? colors.gray[800] : colors.gray[200],
      justifyContent: 'center',
    },
    codeInput: { width: '100%', fontSize: 14, fontWeight: '600', color: d ? colors.gray[100] : colors.gray[800] },
    codeApply: { height: 44, paddingHorizontal: sp(5), borderWidth: 1, borderColor: '#DC2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    codeApplyText: { color: '#DC2626', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
    sheetEmpty: { paddingVertical: sp(10), textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.gray[500] },

    shareDialog: { width: '92%', maxWidth: 448, borderRadius: 16, backgroundColor: cardBg, ...shadow['2xl'] },
    shareHead: {
      paddingHorizontal: sp(5),
      paddingTop: sp(5),
      paddingBottom: sp(3),
      borderBottomWidth: 1,
      borderBottomColor: d ? colors.gray[800] : colors.gray[200],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: sp(3),
    },
    shareTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: d ? colors.white : colors.gray[900], flexShrink: 1 },
    shareRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp(3),
      paddingHorizontal: sp(3),
      paddingVertical: sp(3),
      borderRadius: 8,
      borderWidth: 1,
      borderColor: d ? colors.gray[700] : colors.gray[200],
    },
    shareRowText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: d ? colors.white : colors.gray[900] },

    autoSheet: { backgroundColor: 'transparent', paddingBottom: 0, overflow: 'visible' },
    autoClose: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: alpha(colors.neutral[800], 0.8),
      borderWidth: 1,
      borderColor: alpha('#ffffff', 0.15),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: sp(4),
      ...shadow.lg,
    },
    autoCard: {
      width: '100%',
      backgroundColor: cardBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: sp(6),
      alignItems: 'center',
      ...shadow['2xl'],
    },
    autoIconWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: sp(6), paddingBottom: sp(2), zIndex: 10 },
    autoTag: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: d ? colors.gray[200] : colors.gray[800], letterSpacing: 2.2, marginTop: sp(4), textAlign: 'center' },
    autoTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', color: d ? colors.gray[100] : colors.gray[900], marginTop: sp(3), textAlign: 'center' },
    autoCode: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: d ? colors.gray[400] : colors.gray[500], marginTop: 6, textAlign: 'center' },
    autoTip: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: d ? colors.gray[500] : colors.gray[400], marginTop: sp(5), textAlign: 'center' },
    autoApply: {
      width: '100%',
      marginTop: sp(6),
      height: 48,
      backgroundColor: '#DC2626',
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#DC2626',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    autoApplyText: { color: colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 1.4 },

    placingOverlay: { backgroundColor: d ? alpha('#000000', 0.9) : alpha('#ffffff', 0.9), alignItems: 'center', justifyContent: 'center' },
    overlayTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: d ? colors.white : colors.gray[900], marginTop: sp(4) },
    overlayText: { fontSize: 14, lineHeight: 20, color: d ? colors.gray[400] : colors.gray[500], maxWidth: 320, textAlign: 'center' },
  }
})
