import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, MapPin, CreditCard, ArrowLeft, MessageSquare, ShoppingBag } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Screen, Text } from '@/native/ui';
import { alpha, brand, colors, fontSize, makeStyles, radius, sp, useTheme } from '@/theme';
import AnimatedPage from '@food/components/user/AnimatedPage';
import ScrollReveal from '@food/components/user/ScrollReveal';
import { Card, CardHeader, CardTitle, CardContent } from '@food/components/ui/card';
import { Button } from '@food/components/ui/button';
import { Badge } from '@food/components/ui/badge';
import { Textarea } from '@food/components/ui/textarea';
import { useCart } from '@food/context/CartContext';
import { useProfile } from '@food/context/ProfileContext';
import { useOrders } from '@food/context/OrdersContext';
import { adminAPI, userAPI } from '@food/api';

const alert = (msg) => Alert.alert('', msg);

export default function Checkout() {
  const navigate = useNavigate();
  const t = useTheme();
  const s = useStyles();
  const { cart, clearCart } = useCart();
  const { getDefaultAddress, getDefaultPaymentMethod, setDefaultAddress, addresses, paymentMethods, orderType, userProfile } = useProfile();
  const { createOrder } = useOrders();
  const getAddressId = (address) => address?.id || address?._id || '';
  const [selectedAddressId, setSelectedAddressId] = useState(getAddressId(getDefaultAddress()));
  const [selectedPayment, setSelectedPayment] = useState(getDefaultPaymentMethod()?.id || '');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isTakeawayCodEnabled, setIsTakeawayCodEnabled] = useState(true);
  const [isCodBlockingFeatureEnabled, setIsCodBlockingFeatureEnabled] = useState(true);

  useEffect(() => {
    userAPI
      .getCustomizationSettings()
      .then((res) => {
        if (res?.data?.data) {
          setIsCodBlockingFeatureEnabled(res.data.data.cod_blocking_feature_enabled !== false);
        }
      })
      .catch(() => {});
    if (orderType === 'takeaway') {
      adminAPI
        .getTakeawayCodStatus()
        .then((res) => {
          setIsTakeawayCodEnabled(res?.data?.enabled !== false);
        })
        .catch(() => setIsTakeawayCodEnabled(true));
    }
  }, [orderType]);

  useEffect(() => {
    const isTakeawayCodDisabled = orderType === 'takeaway' && !isTakeawayCodEnabled;
    const isUserBlocked = userProfile?.isCodBlocked && isCodBlockingFeatureEnabled;
    if ((isTakeawayCodDisabled || isUserBlocked) && selectedPayment === 'cod') {
      setSelectedPayment('razorpay');
    }
  }, [orderType, isTakeawayCodEnabled, selectedPayment, userProfile, isCodBlockingFeatureEnabled]);

  const selectedAddress = addresses.find((addr) => getAddressId(addr) === selectedAddressId) || getDefaultAddress();
  const defaultPayment = paymentMethods.find((pm) => pm.id === selectedPayment) || getDefaultPaymentMethod();

  useEffect(() => {
    const defaultId = getAddressId(getDefaultAddress());
    const selectedStillExists = addresses.some((addr) => getAddressId(addr) === selectedAddressId);
    if (!selectedAddressId || !selectedStillExists) {
      setSelectedAddressId(defaultId || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, selectedAddressId, getDefaultAddress]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity * 83, 0);
  const deliveryFee = orderType === 'takeaway' ? 0 : 2.99 * 83;
  const tax = subtotal * 0.08;
  const total = subtotal + deliveryFee + tax;

  const [restaurantNote, setRestaurantNote] = useState('');

  const handlePlaceOrder = async () => {
    if (orderType !== 'takeaway' && !selectedAddress) {
      alert('Please select a delivery address');
      return;
    }
    if (!selectedPayment) {
      alert('Please select a payment method');
      return;
    }
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setIsPlacingOrder(true);

    setTimeout(() => {
      // On the web this callback reads an undeclared `pricing` and throws after clearCart() (so it never navigates);
      // an uncaught error would close the app here, so the same failure is caught and logged instead.
      try {
        const orderId = createOrder({
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
          })),
          address: orderType === 'takeaway' ? null : selectedAddress,
          paymentMethod: selectedPayment === 'cod' ? { id: 'cod', name: 'Cash on Delivery' } : defaultPayment,
          orderType,
          subtotal,
          deliveryFee,
          tax,
          total,
          restaurant: cart[0]?.restaurant || cart[0]?.name || 'Multiple Restaurants',
          restaurantId: cart[0]?.restaurantId,
          note: restaurantNote,
        });

        clearCart();
        // eslint-disable-next-line no-undef
        const pricingTotal = pricing?.total;
        navigate(`/user/orders/${orderId}?confirmed=true`, {
          replace: true,
          state: {
            order: {
              _id: orderId,
              orderId,
              items: cart.map((item) => ({
                name: item.name,
                variantName: item.variantName || item.variant?.name || '',
                quantity: item.quantity || 1,
                price: item.price || 0,
              })),
              pricing: { total: pricingTotal || total },
              total: pricingTotal || total,
              restaurant: cart[0]?.restaurant || cart[0]?.name || 'Selected Restaurant',
              status: 'confirmed',
            },
            fromOrderPlaced: true,
            from: 'checkout',
          },
        });
      } catch (err) {
        console.error(err);
      }
    }, 1500);
  };

  const bgColors = t.dark ? ['#0a0a0a', '#1a1a1a', '#0a0a0a'] : [alpha(colors.orange[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)];

  if (cart.length === 0) {
    return (
      <Screen bg={colors.white}>
        <AnimatedPage style={s.fill}>
          <LinearGradient pointerEvents="none" colors={[alpha(colors.orange[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]} style={StyleSheet.absoluteFill} />
          <View style={s.content}>
            <Card>
              <CardHeader>
                <CardTitle>Checkout</CardTitle>
              </CardHeader>
              <CardContent>
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>Your cart is empty</Text>
                  <Button onPress={() => navigate('/food/user/cart')}>Go to Cart</Button>
                </View>
              </CardContent>
            </Card>
          </View>
        </AnimatedPage>
      </Screen>
    );
  }

  const codBlocked = Boolean(userProfile?.isCodBlocked && isCodBlockingFeatureEnabled);

  return (
    <Screen bg={t.dark ? '#0a0a0a' : colors.white} keyboard>
      <AnimatedPage style={s.fill}>
        <LinearGradient pointerEvents="none" colors={bgColors} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <ScrollReveal>
            <View style={s.header}>
              <Pressable onPress={() => navigate('/food/user/cart')} style={({ pressed }) => [s.back, pressed && s.backPressed]} hitSlop={4}>
                <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[900]} />
              </Pressable>
              <Text style={s.title}>Checkout</Text>
            </View>
          </ScrollReveal>

          <View style={s.cols}>
            {/* Delivery/Pickup Information */}
            <ScrollReveal delay={0.1}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <View style={s.titleRow}>
                      {orderType === 'takeaway' ? <ShoppingBag size={20} color="#DC2626" /> : <MapPin size={20} color="#DC2626" />}
                      <Text style={s.cardTitle}>{orderType === 'takeaway' ? 'Pickup Information' : 'Delivery Address'}</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent style={s.space4}>
                  {orderType === 'takeaway' ? (
                    <View style={s.pickupBox}>
                      <View style={s.pickupHead}>
                        <ShoppingBag size={16} color="#DC2626" />
                        <Text style={s.pickupTitle}>Self-Pickup</Text>
                      </View>
                      <Text style={s.pickupText}>You've selected self-pickup. Please collect your order from the restaurant.</Text>
                      <View style={s.pickupFoot}>
                        <Text style={s.pickupLabel}>RESTAURANT ADDRESS</Text>
                        <Text style={s.pickupName}>{cart[0]?.restaurant || 'Selected Restaurant'}</Text>
                        <Text style={s.pickupNote}>Collect your order once it's marked as ready.</Text>
                      </View>
                    </View>
                  ) : addresses.length > 0 ? (
                    <View style={s.space3}>
                      {addresses.map((address) => {
                        const addressId = getAddressId(address);
                        const isSelected = selectedAddressId === addressId;
                        const addressString = [address.street, address.additionalDetails, `${address.city}, ${address.state} ${address.zipCode}`]
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <Pressable
                            key={addressId || `${address.label}-${address.street}-${address.city}`}
                            style={[s.option, isSelected ? s.optionSelected : null]}
                            onPress={() => {
                              setSelectedAddressId(addressId);
                              if (addressId) setDefaultAddress(addressId);
                            }}
                          >
                            <View style={s.optionRow}>
                              <View style={s.flex1}>
                                {address.isDefault && (
                                  <Badge style={s.defaultBadge} textStyle={s.defaultBadgeText}>
                                    Default
                                  </Badge>
                                )}
                                <Text style={s.optionText}>{addressString}</Text>
                              </View>
                              {isSelected && <CheckCircle size={20} color="#DC2626" />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={s.noAddr}>
                      <Text style={s.muted}>No addresses saved</Text>
                      <Button onPress={() => navigate('/food/user/cart/select-address', { state: { from: '/user/cart/checkout' } })}>Add Address</Button>
                    </View>
                  )}
                </CardContent>
              </Card>
            </ScrollReveal>

            {/* Payment Method */}
            <ScrollReveal delay={0.2}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <View style={s.titleRow}>
                      <CreditCard size={20} color="#DC2626" />
                      <Text style={s.cardTitle}>Payment Method</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent style={s.space4}>
                  <View style={s.space3}>
                    {(orderType !== 'takeaway' || isTakeawayCodEnabled) && (
                      <Pressable
                        style={[s.option, codBlocked ? s.optionBlocked : selectedPayment === 'cod' ? s.optionSelected : null]}
                        onPress={() => {
                          if (codBlocked) return;
                          setSelectedPayment('cod');
                        }}
                      >
                        <View style={[s.optionRow, { alignItems: 'center' }]}>
                          <View style={s.codLeft}>
                            <CreditCard size={20} color={codBlocked ? colors.gray[400] : colors.gray[500]} />
                            <View style={s.flexShrink}>
                              <Text style={s.semibold}>Cash on Delivery</Text>
                              {codBlocked ? (
                                <Text style={s.codBlocked}>Not available due to multiple cancellations</Text>
                              ) : (
                                <Text style={s.mutedXs}>Pay when you {orderType === 'takeaway' ? 'pickup' : 'receive'} your order</Text>
                              )}
                            </View>
                          </View>
                          {selectedPayment === 'cod' && <CheckCircle size={20} color="#DC2626" />}
                        </View>
                      </Pressable>
                    )}

                    {paymentMethods.length > 0 &&
                      paymentMethods.map((payment) => {
                        const isSelected = selectedPayment === payment.id;
                        const cardNumber = `**** **** **** ${payment.cardNumber}`;
                        return (
                          <Pressable key={payment.id} style={[s.option, isSelected ? s.optionSelected : null]} onPress={() => setSelectedPayment(payment.id)}>
                            <View style={s.optionRow}>
                              <View style={s.flex1}>
                                <View style={s.badgeRow}>
                                  {payment.isDefault && (
                                    <Badge style={s.defaultBadge} textStyle={s.defaultBadgeText}>
                                      Default
                                    </Badge>
                                  )}
                                  <Badge variant="outline" textStyle={{ textTransform: 'capitalize' }}>
                                    {payment.type}
                                  </Badge>
                                </View>
                                <Text style={s.semibold}>{cardNumber}</Text>
                                <Text style={s.mutedSm}>
                                  {payment.cardHolder} Expires {payment.expiryMonth}/{String(payment.expiryYear || '').slice(-2)}
                                </Text>
                              </View>
                              {isSelected && <CheckCircle size={20} color="#DC2626" />}
                            </View>
                          </Pressable>
                        );
                      })}

                    <Button variant="outline" style={{ width: '100%' }} onPress={() => navigate('/food/user/profile/payments')}>
                      Manage Payment Methods
                    </Button>
                  </View>
                </CardContent>
              </Card>
            </ScrollReveal>

            {/* Note for Restaurant */}
            <ScrollReveal delay={0.25}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <View style={s.titleRow}>
                      <MessageSquare size={20} color="#DC2626" />
                      <Text style={s.cardTitle}>Add note for restaurant</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="E.g. Please make it extra spicy, or no onions..."
                    value={restaurantNote}
                    onChangeText={setRestaurantNote}
                    style={{ minHeight: 100 }}
                  />
                  <Text style={[s.mutedXs, { marginTop: sp(2) }]}>Your request will be shared with the restaurant.</Text>
                </CardContent>
              </Card>
            </ScrollReveal>

            {/* Order Summary */}
            <ScrollReveal delay={0.3}>
              <Card style={t.dark ? { backgroundColor: '#1a1a1a', borderColor: colors.gray[800] } : undefined}>
                <CardHeader>
                  <CardTitle>
                    <Text style={[s.cardTitle, t.dark && { color: colors.white }]}>Order Summary</Text>
                  </CardTitle>
                </CardHeader>
                <CardContent style={s.space4}>
                  <ScrollView style={s.itemsList} nestedScrollEnabled>
                    <View style={s.space3}>
                      {cart.map((item) => (
                        <View key={item.id} style={s.itemRow}>
                          <AppImage src={item.image} style={s.itemImg} />
                          <View style={s.flex1}>
                            <Text style={s.itemName}>{item.name}</Text>
                            {item.variantName ? <Text style={s.mutedXs}>{item.variantName}</Text> : null}
                            <Text style={s.mutedXs}>
                              ₹{(item.price * 83).toFixed(0)} × {item.quantity}
                            </Text>
                          </View>
                          <Text style={s.itemTotal}>₹{(item.price * 83 * item.quantity).toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  <View style={s.totals}>
                    <View style={s.totalRow}>
                      <Text style={s.mutedSm}>Subtotal</Text>
                      <Text style={s.value}>₹{subtotal.toFixed(0)}</Text>
                    </View>
                    {orderType !== 'takeaway' && (
                      <View style={s.totalRow}>
                        <Text style={s.mutedSm}>Delivery Fee</Text>
                        <Text style={s.value}>₹{deliveryFee.toFixed(0)}</Text>
                      </View>
                    )}
                    <View style={s.totalRow}>
                      <Text style={s.mutedSm}>Tax</Text>
                      <Text style={s.value}>₹{tax.toFixed(0)}</Text>
                    </View>
                    <View style={[s.totalRow, s.grandRow]}>
                      <Text style={s.grandLabel}>Total</Text>
                      <Text style={s.grandValue}>₹{total.toFixed(0)}</Text>
                    </View>
                  </View>

                  <Button
                    style={s.placeBtn}
                    textStyle={s.placeText}
                    onPress={handlePlaceOrder}
                    disabled={isPlacingOrder || (orderType !== 'takeaway' && !selectedAddress) || !selectedPayment}
                  >
                    {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
                  </Button>
                </CardContent>
              </Card>
            </ScrollReveal>
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  content: { padding: sp(4), gap: sp(6), paddingBottom: sp(10) },
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(4), marginBottom: sp(6) },
  back: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: brand.accent },
  title: { ...fontSize.lg, fontWeight: '700', color: t.dark ? colors.white : colors.gray[900] },
  cols: { gap: sp(6) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  cardTitle: { fontWeight: '600', ...fontSize.base, lineHeight: 18, color: t.text },
  space3: { gap: sp(3) },
  space4: { gap: sp(4) },
  pickupBox: { borderWidth: 2, borderColor: '#DC2626', backgroundColor: colors.orange[50], borderRadius: radius.lg, padding: sp(4) },
  pickupHead: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(2) },
  pickupTitle: { fontWeight: '600', color: colors.orange[900] },
  pickupText: { ...fontSize.sm, color: colors.orange[800] },
  pickupFoot: { marginTop: sp(3), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.orange[100] },
  pickupLabel: { ...fontSize.xs, fontWeight: '500', color: colors.orange[900], letterSpacing: 0.6 },
  pickupName: { ...fontSize.sm, color: colors.gray[700], marginTop: sp(1), fontWeight: '500' },
  pickupNote: { ...fontSize.xs, color: colors.gray[500], marginTop: sp(1) },
  option: { borderWidth: 2, borderRadius: radius.lg, padding: sp(4), borderColor: colors.gray[200] },
  optionSelected: { borderColor: '#DC2626', backgroundColor: colors.orange[50] },
  optionBlocked: { borderColor: colors.gray[200], backgroundColor: colors.gray[50], opacity: 0.6 },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(2) },
  optionText: { ...fontSize.sm, fontWeight: '500', color: t.text },
  defaultBadge: { marginBottom: sp(2), backgroundColor: '#DC2626', alignSelf: 'flex-start' },
  defaultBadgeText: { color: colors.white },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginBottom: sp(2) },
  noAddr: { alignItems: 'center', paddingVertical: sp(8), gap: sp(4) },
  muted: { color: brand.mutedForeground },
  mutedXs: { ...fontSize.xs, color: brand.mutedForeground },
  mutedSm: { ...fontSize.sm, color: brand.mutedForeground },
  semibold: { fontWeight: '600', color: t.text },
  codLeft: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flex: 1 },
  codBlocked: { ...fontSize.xs, color: '#DC2626', marginTop: sp(1), fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingVertical: sp(12) },
  emptyText: { color: brand.mutedForeground, ...fontSize.lg, marginBottom: sp(4) },
  itemsList: { maxHeight: 256 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    paddingBottom: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[700] : brand.border,
  },
  itemImg: { width: 64, height: 64, borderRadius: radius.lg },
  itemName: { fontWeight: '500', ...fontSize.sm, color: t.dark ? colors.gray[200] : t.text },
  itemTotal: { fontWeight: '600', ...fontSize.sm, color: t.dark ? colors.gray[200] : t.text },
  totals: { gap: sp(2), paddingTop: sp(4), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[700] : brand.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { ...fontSize.sm, color: t.dark ? colors.gray[200] : t.text },
  grandRow: { paddingTop: sp(2), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[700] : brand.border },
  grandLabel: { fontWeight: '700', ...fontSize.lg, color: t.dark ? colors.white : t.text },
  grandValue: { fontWeight: '700', ...fontSize.lg, color: t.dark ? colors.orange[400] : '#DC2626' },
  placeBtn: { width: '100%', backgroundColor: '#DC2626', marginTop: sp(4), height: 44, borderWidth: 0 },
  placeText: { color: colors.white, ...fontSize.sm },
}));
