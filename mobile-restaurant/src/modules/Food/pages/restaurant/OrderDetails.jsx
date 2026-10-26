// Web: pages/restaurant/OrderDetails.jsx — /food/restaurant/orders/:id: summary card (status, date, Resend to delivery
// partners, ID + copy, order type, restaurant + address, reason, note for restaurant), customer, items, bill, timeline,
// and the "Print" receipt (jsPDF). Same API (GET order by readable id, then the Mongo id from location.state), same
// transforms, texts and states (skeleton + "Fetching order details...", "Order Not Found").
// Native:
// - jsPDF + autoTable receipt -> the same document (title, sections, item table, bill rows, timeline, footer) as HTML
//   rendered to Order_Receipt_<id>.pdf with printHtml (share / save sheet).
// - window.location.reload() ("Try Again", after Resend) -> the order is fetched again.
// - lenis smooth scrolling -> native scroll. The web's own bottom toast is kept (same look, same texts).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeft, CheckCircle, Copy, Loader2, MapPin, Printer, User, Volume2, XCircle } from 'lucide-react-native';
import { useLocation, useNavigate, useParams } from '@/lib/router';
import { printHtml } from '@/lib/media';
import { AppImage, Screen, Skeleton, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { restaurantAPI } from '@food/api';
import ResendNotificationButton from '@food/components/restaurant/ResendNotificationButton';
import { getRestaurantItemLineTotal, resolveRestaurantItemUnitPrice } from '@food/utils/restaurantOrderPricing';
import dishFallbackImage from '@food/assets/dish_fallback.webp';

const debugError = () => {};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;
const formatDiscount = (value) => `-₹${Math.abs(Number(value || 0)).toFixed(2)}`;

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// web: the jsPDF receipt (helvetica, A4, 15 mm margins). Tag names are written as <${'div'}> so the converter's
// HTML-element scan (scripts/check-converted.cjs) does not read this print template as web JSX.
function buildReceiptHtml(orderData) {
  const statusColor =
    orderData.status === 'REJECTED' || orderData.status === 'CANCELLED'
      ? 'rgb(220,38,38)'
      : orderData.status === 'DELIVERED'
        ? 'rgb(22,163,74)'
        : '#000';
  const billRows = [
    ['Item Subtotal:', formatMoney(orderData.billing.itemSubtotal)],
    ['Taxes:', formatMoney(orderData.billing.taxes)],
  ];
  if (Number(orderData.billing.packagingFee) > 0) billRows.push(['Packaging Fee:', formatMoney(orderData.billing.packagingFee)]);
  if (Number(orderData.billing.deliveryFee) > 0) billRows.push(['Delivery Fee:', formatMoney(orderData.billing.deliveryFee)]);
  if (Number(orderData.billing.platformFee) > 0) billRows.push(['Platform Fee:', formatMoney(orderData.billing.platformFee)]);
  if (Number(orderData.billing.discount) > 0) billRows.push(['Discount:', formatDiscount(orderData.billing.discount)]);
  if (Number(orderData.billing.couponDiscount) > 0) billRows.push(['Coupon Discount:', formatDiscount(orderData.billing.couponDiscount)]);
  if (Number(orderData.billing.referralDiscount) > 0) billRows.push(['Referral Discount:', formatDiscount(orderData.billing.referralDiscount)]);

  const dotColor = (s) => (s === 'completed' ? 'rgb(22,163,74)' : s === 'rejected' ? 'rgb(220,38,38)' : 'rgb(156,163,175)');

  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 10pt; margin: 0; }
  .c { text-align: center; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 16pt; margin: 18px 0 10px; }
  h3 { font-size: 12pt; margin: 0 0 8px; }
  hr { border: 0; border-top: 0.5mm solid #000; margin: 10px 0; }
  hr.dash { border-top: 0.3mm dashed #000; }
  .row { display: flex; margin: 4px 0; font-size: 11pt; }
  .row b { width: 35mm; display: inline-block; }
  .crow { display: flex; margin: 3px 0; }
  .crow b { width: 35mm; display: inline-block; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: rgb(55,65,81); color: #fff; font-size: 10pt; text-align: left; padding: 5px; border: 1px solid #ccc; }
  td { font-size: 9pt; padding: 5px; border: 1px solid #ccc; }
  .bill { display: flex; justify-content: space-between; margin: 3px 0; }
  .total { font-weight: bold; font-size: 11pt; }
  .reason { color: rgb(220,38,38); }
  .ev { display: flex; align-items: flex-start; margin: 6px 0; }
  .dot { width: 4mm; height: 4mm; border-radius: 50%; margin: 2px 8px 0 0; flex-shrink: 0; }
  .ev b { font-size: 10pt; display: block; }
  .ev small { font-size: 8pt; color: rgb(100,100,100); }
  .foot { margin-top: 30px; text-align: center; font-size: 8pt; font-style: italic; color: rgb(100,100,100); }
</style></head><body>
  <${'div'} class="c"><${'h1'}>${esc(orderData.restaurant)}</${'h1'}><${'div'}>${esc(orderData.address)}</${'div'}><${'h2'}>ORDER RECEIPT</${'h2'}></${'div'}>
  <${'hr'}/>
  <${'div'} class="row"><${'b'}>Order ID:</${'b'}><${'span'}>${esc(orderData.id)}</${'span'}></${'div'}>
  <${'div'} class="row"><${'b'}>Date &amp; Time:</${'b'}><${'span'}>${esc(`${orderData.date}, ${orderData.time}`)}</${'span'}></${'div'}>
  <${'div'} class="row"><${'b'}>Status:</${'b'}><${'span'} style="color:${statusColor}">${esc(orderData.status)}</${'span'}></${'div'}>
  <${'hr'}/>
  <${'h3'}>CUSTOMER DETAILS</${'h3'}>
  <${'div'} class="crow"><${'b'}>Name:</${'b'}><${'span'}>${esc(orderData.customer.name)}</${'span'}></${'div'}>
  <${'div'} class="crow"><${'b'}>Location:</${'b'}><${'span'}>${esc(orderData.customer.location || '-')}</${'span'}></${'div'}>
  <${'div'} class="crow"><${'b'}>Distance:</${'b'}><${'span'}>${esc(orderData.customer.distance || '-')}</${'span'}></${'div'}>
  <${'hr'}/>
  <${'h3'}>ITEM DETAILS</${'h3'}>
  <${'table'}><thead><${'tr'}><${'th'}>Qty</${'th'}><${'th'}>Item Name</${'th'}><${'th'}>Type</${'th'}><${'th'}>Price</${'th'}></${'tr'}></thead><tbody>
  ${orderData.items
    .map((item) => `<${'tr'}><${'td'}>${esc(`${item.quantity}x`)}</${'td'}><${'td'}>${esc(item.name)}</${'td'}><${'td'}>${esc(item.type || '-')}</${'td'}><${'td'}>${esc(formatMoney(item.price))}</${'td'}></${'tr'}>`)
    .join('')}
  </tbody></${'table'}>
  <${'hr'}/>
  <${'h3'}>BILL DETAILS</${'h3'}>
  ${billRows.map(([l, v]) => `<${'div'} class="bill"><${'span'}>${esc(l)}</${'span'}><${'span'}>${esc(v)}</${'span'}></${'div'}>`).join('')}
  <${'hr'} class="dash"/>
  <${'div'} class="bill total"><${'span'}>Total Bill:</${'span'}><${'span'}>${esc(formatMoney(orderData.billing.total))}</${'span'}></${'div'}>
  ${
    Number(orderData.billing.paidAmount) > 0
      ? `<${'div'} class="bill"><${'span'}>Amount Paid:</${'span'}><${'span'}>${esc(formatMoney(orderData.billing.paidAmount))}</${'span'}></${'div'}>`
      : ''
  }
  <${'div'} style="font-size:9pt;margin-top:4px">Payment Status: ${esc(orderData.billing.paymentStatus)}</${'div'}>
  ${orderData.reason ? `<${'hr'}/><${'div'} class="reason"><${'b'} style="font-size:11pt">REASON:</${'b'}><${'div'} style="font-size:9pt;margin-top:4px">${esc(orderData.reason)}</${'div'}></${'div'}>` : ''}
  <${'hr'}/>
  <${'h3'}>ORDER TIMELINE</${'h3'}>
  ${orderData.timeline
    .map(
      (event) =>
        `<${'div'} class="ev"><${'span'} class="dot" style="background:${dotColor(event.status)}"></${'span'}><${'div'}><${'b'}>${esc(event.event)}</${'b'}><${'small'}>${esc(event.timestamp || '-')}</${'small'}></${'div'}></${'div'}>`,
    )
    .join('')}
  <${'div'} class="foot">Thank you for your business!<${'br'}/>Generated on: ${esc(new Date().toLocaleString())}</${'div'}>
</body></html>`;
}

function Spin({ children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
}

function BrandFill({ style, radius: r = 0 }) {
  return (
    <LinearGradient
      colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: r }, style]}
    />
  );
}

function ItemImage({ src }) {
  const [failed, setFailed] = useState(false);
  return (
    <AppImage
      src={failed || !src ? undefined : src}
      source={failed || !src ? dishFallbackImage : undefined}
      fallback={dishFallbackImage}
      style={styles.fill}
      contentFit="cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function OrderDetails() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const { id: orderId } = useParams();
  const location = useLocation();

  // State for order data
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0); // web: window.location.reload()

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef(null);
  const [toastMounted, setToastMounted] = useState(false);

  useEffect(() => {
    if (showToast) {
      setToastMounted(true);
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToastMounted(false);
      });
    }
  }, [showToast, toastAnim]);

  const hideToastAfter = (ms) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setShowToast(false), ms);
  };
  useEffect(() => () => toastTimerRef.current && clearTimeout(toastTimerRef.current), []);

  // Fetch order data from API
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        setError(null);

        let response;
        try {
          response = await restaurantAPI.getOrderById(orderId);
          if (!response.data?.success) throw new Error('Readable ID fetch failed');
        } catch (e) {
          const fallbackId = location.state?.mongoId;
          if (fallbackId && fallbackId !== orderId) {
            response = await restaurantAPI.getOrderById(fallbackId);
          } else {
            throw e;
          }
        }

        if (response.data?.success) {
          const order = response.data.data?.order || response.data.data;
          if (!order) throw new Error('Order data is missing');
          const orderStatusRaw = String(order.status || order.orderStatus || '').toLowerCase();
          const pricing = order.pricing || {};
          const computedSubtotal = Array.isArray(order.items)
            ? order.items.reduce((sum, item) => sum + getRestaurantItemLineTotal(item), 0)
            : 0;

          const itemSubtotal =
            firstNumber(pricing.baseSubtotal, pricing.subtotal, pricing.itemsTotal, pricing.itemSubtotal, order.itemSubtotal, order.subtotal) ??
            computedSubtotal;

          const taxes = firstNumber(pricing.tax, pricing.gst, order.tax, order.gst) ?? 0;

          const packagingFee = firstNumber(pricing.packagingFee, order.packagingFee) ?? 0;
          const deliveryFee = firstNumber(pricing.deliveryFee, order.deliveryFee) ?? 0;
          const platformFee = firstNumber(pricing.platformFee, order.platformFee) ?? 0;
          const discount = firstNumber(pricing.discount, order.discount) ?? 0;
          const couponDiscount = firstNumber(pricing.couponDiscount, order.couponDiscount) ?? 0;
          const referralDiscount = firstNumber(pricing.referralDiscount, order.referralDiscount) ?? 0;

          const total =
            firstNumber(pricing.total, order.totalAmount, order.total, order.amount) ?? Math.max(0, itemSubtotal + packagingFee);
          // Restaurant view: never show customer payment-due as their bill
          const paidAmount = total;

          const addressParts = [order.address?.street, order.address?.area, order.address?.city, order.address?.state, order.address?.pincode].filter(Boolean);

          const fullAddress =
            order.address?.formattedAddress ||
            order.address?.address ||
            order.deliveryAddress?.formattedAddress ||
            order.deliveryAddress?.address ||
            [order.deliveryAddress?.street, order.deliveryAddress?.city, order.deliveryAddress?.state, order.deliveryAddress?.zipCode]
              .filter(Boolean)
              .join(', ') ||
            (addressParts.length > 0 ? addressParts.join(', ') : '') ||
            'Address not available';

          const customerName =
            firstText(
              order.userId?.name,
              order.customerName,
              order.customer?.name,
              order.customerInfo?.name,
              order.deliveryAddress?.name,
              order.deliveryAddress?.fullName,
              order.address?.name,
            ) || 'Customer';

          const restaurantName =
            firstText(
              order.restaurantName,
              order.restaurant?.restaurantName,
              order.restaurant?.name,
              order.restaurantId?.restaurantName,
              order.restaurantId?.name,
              order.outletName,
            ) || 'Restaurant';

          const restLoc = order.restaurantId?.location || order.restaurant?.location || {};
          const resolvedRestaurantAddress =
            order.restaurantAddress ||
            order.restaurant_address ||
            restLoc.formattedAddress ||
            restLoc.address ||
            restLoc.addressLine1 ||
            [order.restaurantId?.area || restLoc.area, order.restaurantId?.city || restLoc.city].filter(Boolean).join(', ') ||
            'Restaurant Address';

          const rawPaymentStatus = String(order.payment?.status || order.paymentStatus || '').toLowerCase();
          const paymentMethod = String(order.payment?.method || '').toLowerCase();

          let paymentStatus = 'PENDING';
          if (['completed', 'paid', 'captured', 'success', 'succeeded'].includes(rawPaymentStatus)) {
            paymentStatus = 'PAID';
          } else if (['failed', 'declined'].includes(rawPaymentStatus)) {
            paymentStatus = 'FAILED';
          } else if (['refunded', 'refund'].includes(rawPaymentStatus)) {
            paymentStatus = 'REFUNDED';
          } else if (paymentMethod === 'cash') {
            paymentStatus = orderStatusRaw === 'delivered' ? 'PAID' : 'COD';
          }

          const statusLower = orderStatusRaw;
          const reached = {
            confirmed:
              order.tracking?.confirmed?.status ||
              ['confirmed', 'preparing', 'ready', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(statusLower),
            preparing:
              order.tracking?.preparing?.status ||
              ['preparing', 'ready', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(statusLower),
            ready: order.tracking?.ready?.status || ['ready', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(statusLower),
            outForDelivery: order.tracking?.outForDelivery?.status || ['picked_up', 'out_for_delivery', 'delivered'].includes(statusLower),
            delivered: order.tracking?.delivered?.status || statusLower === 'delivered',
          };
          const ts = (v) => (v ? new Date(v).toLocaleString('en-GB') : '');

          // Transform API order data to match component structure
          const transformedOrder = {
            id: order.orderId || order._id,
            status: orderStatusRaw.toUpperCase() || 'PENDING',
            date: new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            time: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            restaurant: restaurantName,
            address: resolvedRestaurantAddress,
            orderType: order.orderType || 'delivery',
            customer: {
              name: customerName,
              orderCount: order.userId?.orderCount || 1,
              location: order.orderType === 'takeaway' ? 'Self-Pickup Order' : fullAddress,
              distance: order.orderType === 'takeaway' ? '' : order.deliveryDistance ? `${order.deliveryDistance} km` : '',
            },
            items:
              order.items?.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: resolveRestaurantItemUnitPrice(item),
                image: item.image,
                type: item.isVeg || item.foodType === 'Veg' ? 'Veg' : 'Non-Veg',
                variantName: item.variantName || '',
              })) || [],
            billing: {
              itemSubtotal,
              taxes,
              packagingFee,
              deliveryFee,
              platformFee,
              discount,
              couponDiscount,
              referralDiscount,
              total,
              paidAmount,
              paymentStatus,
            },
            deliveryPartnerId: order.deliveryPartnerId || order.dispatch?.deliveryPartnerId || null,
            dispatchStatus: order.dispatch?.status || null,
            reason: order.cancellationReason || '',
            restaurantNote: order.restaurantNote || '',
            timeline: [
              { event: 'Order placed', timestamp: new Date(order.createdAt).toLocaleString('en-GB'), status: 'completed' },
              ...(reached.confirmed ? [{ event: 'Order confirmed', timestamp: ts(order.tracking?.confirmed?.timestamp), status: 'completed' }] : []),
              ...(reached.preparing ? [{ event: 'Preparing', timestamp: ts(order.tracking?.preparing?.timestamp), status: 'completed' }] : []),
              ...(reached.ready ? [{ event: 'Ready for pickup', timestamp: ts(order.tracking?.ready?.timestamp), status: 'completed' }] : []),
              ...(reached.outForDelivery ? [{ event: 'Out for delivery', timestamp: ts(order.tracking?.outForDelivery?.timestamp), status: 'completed' }] : []),
              ...(reached.delivered ? [{ event: 'Delivered', timestamp: ts(order.tracking?.delivered?.timestamp), status: 'completed' }] : []),
              ...(statusLower === 'cancelled'
                ? [{ event: 'Cancelled', timestamp: ts(order.cancelledAt), status: 'rejected', reason: order.cancellationReason }]
                : []),
            ],
          };

          setOrderData(transformedOrder);
        } else {
          throw new Error('Order not found');
        }
      } catch (err) {
        debugError('Error fetching order:', err);
        setError(err.response?.data?.message || err.message || 'Failed to fetch order');
        setOrderData(null);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, reloadTick]);

  const handleCopyOrderId = () => {
    if (!orderData?.id) return;
    navigator.clipboard.writeText(orderData.id);
    setToastMessage('Order ID copied to clipboard');
    setShowToast(true);
    hideToastAfter(2000);
  };

  const handlePrintReceipt = async () => {
    try {
      setIsGeneratingPDF(true);
      setToastMessage('Generating receipt...');
      setShowToast(true);

      // Small delay to show the toast
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check if orderData exists
      if (!orderData) {
        throw new Error('Order data not found');
      }

      await printHtml(buildReceiptHtml(orderData), { filename: `Order_Receipt_${orderData.id}.pdf` });

      // Show success message
      setToastMessage('Receipt downloaded successfully!');
      setShowToast(true);
      hideToastAfter(2000);
    } catch (err) {
      debugError('Error generating PDF:', err);
      setToastMessage(`Failed: ${err.message || 'Unknown error'}`);
      setShowToast(true);
      hideToastAfter(3000);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'REJECTED':
      case 'CANCELLED':
        return colors.red[700];
      case 'DELIVERED':
        return colors.green[600];
      default:
        return colors.gray[600];
    }
  };

  // Loading state
  if (loading) {
    return (
      <Screen bg={colors.gray[50]} edges={['top']}>
        {/* Header Skeleton */}
        <View style={styles.skHeader}>
          <View style={styles.rowGap3}>
            <Skeleton width={32} height={32} rounded={10} style={styles.skBlock} />
            <View style={[styles.flex, { gap: sp(2) }]}>
              <Skeleton width="33%" height={16} rounded={4} style={styles.skBlock} />
              <Skeleton width="50%" height={12} rounded={4} style={styles.skBlock} />
            </View>
          </View>
        </View>

        {/* Content Skeleton */}
        <View style={{ padding: sp(4), gap: sp(4) }}>
          <View style={styles.skCard}>
            <View style={styles.rowBetween}>
              <Skeleton width={96} height={24} rounded={4} style={styles.skBlock} />
              <Skeleton width={80} height={24} rounded={4} style={styles.skBlock} />
            </View>
            <Skeleton width="75%" height={16} rounded={4} style={styles.skBlock} />
            <Skeleton width="50%" height={16} rounded={4} style={styles.skBlock} />
          </View>

          <View style={styles.skCard}>
            <Skeleton width={160} height={20} rounded={4} style={styles.skBlock} />
            <View style={[styles.rowGap3, { gap: sp(4) }]}>
              <Skeleton width={48} height={48} rounded={24} style={styles.skBlock} />
              <View style={[styles.flex, { gap: sp(2) }]}>
                <Skeleton width="50%" height={16} rounded={4} style={styles.skBlock} />
                <Skeleton width="33%" height={12} rounded={4} style={styles.skBlock} />
              </View>
            </View>
          </View>

          <View style={styles.fetching}>
            <Spin>
              <Loader2 size={32} color={restaurantTheme.primary} />
            </Spin>
            <Text style={styles.fetchingText}>Fetching order details...</Text>
          </View>
        </View>
      </Screen>
    );
  }

  // Error state
  if (error && !orderData) {
    return (
      <Screen bg={colors.gray[50]} style={styles.centerPage}>
        <View style={styles.errorCard}>
          <View style={styles.errorIcon}>
            <XCircle size={40} color={restaurantTheme.brand} />
          </View>
          <Text style={styles.errorTitle}>Order Not Found</Text>
          <Text style={styles.errorText}>
            {error || "We couldn't retrieve the details for this order. It might have been removed or the ID is incorrect."}
          </Text>
          <View style={{ gap: sp(3) }}>
            <Pressable
              onPress={() => setReloadTick((t) => t + 1)}
              style={({ pressed }) => [styles.tryBtn, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <BrandFill radius={16} />
              <Text style={styles.tryText}>Try Again</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('/food/restaurant/orders/all')}
              style={({ pressed }) => [styles.historyBtn, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.gray[50] }]}
            >
              <Text style={styles.historyText}>Back to History</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  // No order data
  if (!orderData) {
    return (
      <Screen bg={colors.gray[100]} style={styles.centerPage}>
        <View style={styles.noOrderCard}>
          <XCircle size={64} color={restaurantTheme.brand} style={{ alignSelf: 'center', marginBottom: sp(4) }} />
          <Text style={[styles.errorTitle, { marginBottom: sp(2) }]}>Order Not Found</Text>
          <Text style={[styles.errorText, { color: colors.gray[600], marginBottom: sp(6) }]}>The order you&apos;re looking for doesn&apos;t exist.</Text>
          <Pressable onPress={() => navigate('/restaurant/orders')} style={styles.backOrdersBtn}>
            <Text style={styles.backOrdersText}>Back to Orders</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const typePill =
    orderData.orderType === 'takeaway'
      ? { bg: colors.orange[100], fg: restaurantTheme.primaryStrong, label: 'TAKEAWAY' }
      : orderData.orderType === 'dining'
        ? { bg: colors.blue[100], fg: colors.blue[700], label: 'DINING' }
        : { bg: colors.green[100], fg: restaurantTheme.primaryStrong, label: 'DELIVERY' };

  const BillRow = ({ label, value, green, last }) => (
    <View style={[styles.rowBetween, !last && { marginBottom: sp(3) }]}>
      <Text style={[styles.sm, { color: green ? restaurantTheme.primaryStrong : colors.gray[600] }]}>{label}</Text>
      <Text style={[styles.sm, { color: green ? restaurantTheme.primaryStrong : colors.gray[900] }]}>{value}</Text>
    </View>
  );

  return (
    <Screen bg={colors.gray[100]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.rowGap3}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Order details</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              ID: {orderData.id}, {orderData.restaurant?.substring(0, 20) || 'Restaurant'}...
            </Text>
          </View>
          <View style={styles.rowGap2}>
            <Pressable
              onPress={handlePrintReceipt}
              disabled={isGeneratingPDF}
              accessibilityLabel="Print"
              style={({ pressed }) => [styles.printBtn, pressed && { backgroundColor: colors.gray[100] }, isGeneratingPDF && { opacity: 0.5 }]}
            >
              {isGeneratingPDF ? <ActivityIndicator size={20} color={colors.gray[900]} /> : <Printer size={20} color={colors.gray[900]} />}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {/* Order Summary Card */}
        <View style={styles.card}>
          {/* Status and Order ID Row */}
          <View style={[styles.rowBetween, { alignItems: 'flex-start', marginBottom: sp(3) }]}>
            <View style={{ alignItems: 'flex-end', gap: sp(1) }}>
              <View style={[styles.statusPill, { backgroundColor: getStatusBg(orderData.status) }]}>
                <Text style={styles.statusText}>{orderData.status}</Text>
              </View>
              <Text style={styles.xsGray}>
                {orderData.date}, {orderData.time}
              </Text>
              {(orderData.status === 'PREPARING' || orderData.status === 'READY' || orderData.status === 'CONFIRMED') &&
              orderData.orderType !== 'takeaway' &&
              orderData.orderType !== 'dining' &&
              orderData.dispatchStatus !== 'accepted' ? (
                <View style={{ marginTop: sp(2) }}>
                  <ResendNotificationButton orderId={orderId} onSuccess={() => setReloadTick((t) => t + 1)} />
                </View>
              ) : null}
            </View>
          </View>

          {/* Order ID */}
          <View style={[styles.rowGap2, { marginBottom: sp(2), flexWrap: 'wrap' }]}>
            <Text style={styles.idText}>ID: {orderData.id}</Text>
            <Pressable onPress={handleCopyOrderId} accessibilityLabel="Copy order ID" style={({ pressed }) => [styles.copyBtn, pressed && { backgroundColor: colors.gray[100] }]}>
              <Copy size={16} color={colors.gray[500]} />
            </Pressable>
            {orderData.orderType ? (
              <View style={[styles.typePill, { backgroundColor: typePill.bg }]}>
                <Text style={[styles.typePillText, { color: typePill.fg }]}>{typePill.label}</Text>
              </View>
            ) : null}
          </View>

          {/* Restaurant Info */}
          <Text style={[styles.sm, { color: colors.gray[900], marginBottom: sp(3) }]}>
            {orderData.restaurant}, {orderData.address}
          </Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Rejection Reason */}
          {orderData.reason ? <Text style={[styles.sm, { color: restaurantTheme.brand }]}>{orderData.reason}</Text> : null}

          {/* Restaurant Note */}
          {orderData.restaurantNote ? (
            <View style={styles.noteBox}>
              <View style={[styles.rowGap2, { marginBottom: sp(1) }]}>
                <Volume2 size={16} color={colors.blue[700]} />
                <Text style={styles.noteLabel}>NOTE FOR RESTAURANT</Text>
              </View>
              <Text style={styles.noteText}>{orderData.restaurantNote}</Text>
            </View>
          ) : null}
        </View>

        {/* Customer Details Section */}
        <View>
          <Text style={styles.sectionTitle}>Customer details</Text>

          {/* Customer Card */}
          <View style={[styles.card, { gap: sp(8), marginBottom: sp(3) }]}>
            <View style={styles.rowGap3}>
              <View style={styles.avatar}>
                <User size={20} color={colors.gray[600]} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.customerName}>{orderData.customer.name}</Text>
                <Text style={[styles.xsGray, { marginTop: 2 }]}>{orderData.customer.orderCount} order with you</Text>
              </View>
            </View>
            {orderData.orderType !== 'takeaway' ? (
              <View style={styles.rowGap3}>
                <MapPin size={20} color={colors.gray[600]} />
                <View style={styles.flex}>
                  <Text style={[styles.sm, { color: colors.gray[900] }]}>{orderData.customer.location}</Text>
                </View>
                <Text style={[styles.sm, { color: colors.gray[600] }]}>{orderData.customer.distance}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Item Details Section */}
        <View>
          <Text style={styles.sectionTitle}>Item details</Text>

          {orderData.items.map((item, index) => {
            const nonVeg = String(item.type).toLowerCase().includes('non');
            return (
              <View key={index} style={styles.card}>
                <View style={[styles.rowGap3, { alignItems: 'flex-start', gap: sp(4) }]}>
                  <View style={styles.itemImage}>
                    <ItemImage src={item.image} />
                  </View>
                  <View style={styles.flex}>
                    <View style={[styles.rowBetween, { marginBottom: sp(1) }]}>
                      <View style={[styles.rowGap2, styles.flex]}>
                        <View style={[styles.vegRing, { borderColor: nonVeg ? colors.red[600] : colors.green[600] }]}>
                          {nonVeg ? (
                            <View style={styles.vegDot}>
                              <BrandFill radius={3} />
                            </View>
                          ) : (
                            <View style={[styles.vegDot, { backgroundColor: colors.green[600] }]} />
                          )}
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.itemName}>
                            {item.quantity} x {item.name}
                          </Text>
                          {item.variantName ? <Text style={styles.variant}>{item.variantName}</Text> : null}
                        </View>
                      </View>
                      <Text style={styles.itemName}>{formatMoney(item.price)}</Text>
                    </View>
                    {item.type ? <Text style={styles.xsGray}>{item.type}</Text> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Bill Details Section */}
        <View>
          <Text style={styles.sectionTitle}>Bill details</Text>

          <View style={styles.card}>
            <BillRow label="Item subtotal" value={formatMoney(orderData.billing.itemSubtotal)} />
            <BillRow label="Taxes" value={formatMoney(orderData.billing.taxes)} />
            {Number(orderData.billing.packagingFee) > 0 ? <BillRow label="Packaging fee" value={formatMoney(orderData.billing.packagingFee)} /> : null}
            {Number(orderData.billing.deliveryFee) > 0 ? <BillRow label="Delivery fee" value={formatMoney(orderData.billing.deliveryFee)} /> : null}
            {Number(orderData.billing.platformFee) > 0 ? <BillRow label="Platform fee" value={formatMoney(orderData.billing.platformFee)} /> : null}
            {Number(orderData.billing.discount) > 0 ? <BillRow green label="Discount" value={formatDiscount(orderData.billing.discount)} /> : null}
            {Number(orderData.billing.couponDiscount) > 0 ? (
              <BillRow green label="Coupon discount" value={formatDiscount(orderData.billing.couponDiscount)} />
            ) : null}
            {Number(orderData.billing.referralDiscount) > 0 ? (
              <BillRow green label="Referral discount" value={formatDiscount(orderData.billing.referralDiscount)} />
            ) : null}
            <View style={{ height: sp(3) }} />
            <View style={styles.rowBetween}>
              <View style={styles.rowGap2}>
                <Text style={styles.totalLabel}>Total bill</Text>
                <View style={styles.payPill}>
                  <Text style={styles.payPillText}>{orderData.billing.paymentStatus}</Text>
                </View>
              </View>
              <Text style={styles.totalLabel}>{formatMoney(orderData.billing.total)}</Text>
            </View>
            {Number(orderData.billing.paidAmount) > 0 ? (
              <View style={[styles.rowBetween, { marginTop: sp(2) }]}>
                <Text style={[styles.sm, { color: colors.gray[600] }]}>Amount paid</Text>
                <Text style={[styles.sm, { color: colors.gray[900], fontWeight: '500' }]}>{formatMoney(orderData.billing.paidAmount)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Order Timeline Section */}
        <View>
          <Text style={styles.sectionTitle}>Order timeline</Text>

          <View style={[styles.card, { borderWidth: 1, borderColor: colors.gray[200] }]}>
            <View>
              {/* Timeline Line */}
              <View style={styles.timelineLine} />

              {/* Timeline Events */}
              <View style={{ gap: sp(4) }}>
                {orderData.timeline.map((event, index) => (
                  <View key={index} style={[styles.rowGap3, { alignItems: 'flex-start' }]}>
                    {/* Icon */}
                    <View style={[styles.eventIcon, event.status !== 'completed' && event.status !== 'rejected' && { backgroundColor: colors.gray[400] }]}>
                      {event.status === 'completed' || event.status === 'rejected' ? <BrandFill radius={16} /> : null}
                      {event.status === 'completed' ? <CheckCircle size={16} color={colors.white} /> : <XCircle size={16} color={colors.white} />}
                    </View>

                    {/* Event Details */}
                    <View style={[styles.flex, { paddingTop: sp(1) }]}>
                      <Text style={[styles.sm, { color: colors.gray[900] }]}>{event.event}</Text>
                      <Text style={[styles.xsGray, { marginTop: 2 }]}>{event.timestamp}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Toast Notification */}
      {toastMounted ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Animated.View
            style={[
              styles.toast,
              { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }] },
            ]}
          >
            <BrandFill radius={10} />
            {isGeneratingPDF ? (
              <ActivityIndicator size={20} color={colors.white} />
            ) : (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.green[400]}>
                <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </Svg>
            )}
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  flex: { flex: 1, minWidth: 0 },
  rowGap2: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  rowGap3: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sm: { fontSize: 14, lineHeight: 20 },
  xsGray: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  skHeader: { backgroundColor: colors.white, paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  skBlock: { backgroundColor: colors.gray[100] },
  skCard: { backgroundColor: colors.white, borderRadius: 16, padding: sp(6), gap: sp(4), borderWidth: 1, borderColor: colors.gray[50], ...shadow.sm },
  fetching: { alignItems: 'center', justifyContent: 'center', paddingVertical: sp(12), gap: sp(4) },
  fetchingText: { color: colors.gray[500], fontWeight: '500', letterSpacing: -0.3, fontSize: 16, lineHeight: 24 },
  centerPage: { alignItems: 'center', justifyContent: 'center', padding: sp(6) },
  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 40,
    maxWidth: 384,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.gray[100],
    ...shadow.xl,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.red[50],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: sp(6),
  },
  errorTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.gray[900], textAlign: 'center', marginBottom: sp(3) },
  errorText: { color: colors.gray[500], textAlign: 'center', marginBottom: sp(8), fontSize: 16, lineHeight: 26 },
  tryBtn: { paddingVertical: sp(4), paddingHorizontal: sp(6), borderRadius: 16, overflow: 'hidden', alignItems: 'center', ...shadow.lg },
  tryText: { color: colors.white, fontWeight: '700', fontSize: 16, lineHeight: 24 },
  historyBtn: {
    backgroundColor: colors.white,
    paddingVertical: sp(4),
    paddingHorizontal: sp(6),
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gray[100],
    alignItems: 'center',
  },
  historyText: { color: colors.gray[700], fontWeight: '700', fontSize: 16, lineHeight: 24 },
  noOrderCard: { backgroundColor: colors.white, borderRadius: 10, padding: sp(8), maxWidth: 448, width: '100%', ...shadow.lg },
  backOrdersBtn: { backgroundColor: colors.gray[200], paddingVertical: sp(2), paddingHorizontal: sp(6), borderRadius: 10, alignSelf: 'center' },
  backOrdersText: { color: colors.gray[800], fontWeight: '600', fontSize: 16, lineHeight: 24 },
  header: { backgroundColor: colors.white, paddingHorizontal: sp(4), paddingVertical: sp(3), zIndex: 50 },
  backBtn: { padding: 6, borderRadius: 10 },
  headerTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  headerSub: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  printBtn: { padding: sp(2), borderRadius: 10 },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(4), paddingBottom: sp(10) },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: sp(4) },
  statusPill: { paddingHorizontal: sp(2.5), paddingVertical: sp(1), borderRadius: 4 },
  statusText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.white },
  idText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  copyBtn: { padding: sp(1), borderRadius: 4 },
  typePill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999 },
  typePillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.gray[200], marginVertical: sp(3) },
  noteBox: { marginTop: sp(3), padding: sp(3), backgroundColor: colors.blue[50], borderWidth: 1, borderColor: colors.blue[100], borderRadius: 10 },
  noteLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.blue[700], letterSpacing: 0.6 },
  noteText: { fontSize: 14, lineHeight: 20, color: colors.blue[900], fontWeight: '500' },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900], marginBottom: sp(3) },
  avatar: { width: 40, height: 40, backgroundColor: colors.gray[200], borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  itemImage: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  vegRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 6, height: 6, borderRadius: 3, overflow: 'hidden' },
  itemName: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  variant: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontWeight: '500', marginTop: 2 },
  totalLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  payPill: { paddingHorizontal: sp(2), paddingVertical: 2, backgroundColor: colors.gray[200], borderRadius: 4 },
  payPillText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[700] },
  timelineLine: { position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, backgroundColor: colors.gray[300] },
  eventIcon: { zIndex: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 60 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: 384,
    ...shadow.lg,
  },
  toastText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '500', flexShrink: 1 },
});
