// Web: pages/OrdersV2.jsx — the Orders tab: "New Orders" (offers with mute / expand / Slide to Accept / Pass) and
// "Accepted" (the rider's active orders; tap = focus on the Feed), the slot counter, and the 10 s ring when the tab
// opens with an unmuted offer or a new offer arrives. Same API calls (getCurrentDelivery + getOrders on open,
// acceptOrder, rejectOrder) and texts.
// Native: a kept-alive screen (DeliveryTabKeepAlive) instead of a route element; the bottom bar is drawn by the layout.
// What the web did on mount (hydrate, the opening ring) runs each time the tab becomes active (useDeliveryTabActive),
// and the "new offer arrived" ring + tab switch only while it is on screen (the web screen was unmounted elsewhere).
// The header sits under the status bar (edge-to-edge): its top padding adds the status bar height.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabScrollTop } from '@/native/ui/tabShown';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, deliveryTheme, fonts } from '@/theme';
import { deliveryAPI } from '@food/api';
import { useDeliveryStore, resolveOrderKey, dedupeOrdersByIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { mapOrderLocations } from '@/modules/DeliveryV2/utils/orderMapping';
import { useDeliveryNotificationsContext } from '@/modules/DeliveryV2/components/DeliveryRealtimeShell';
import NewOrderCard from '@/modules/DeliveryV2/components/orders/NewOrderCard';
import AcceptedOrderCard from '@/modules/DeliveryV2/components/orders/AcceptedOrderCard';
import { useDeliveryTabActive } from '../deliveryTabPages';

export default function OrdersV2() {
  const navigate = useNavigate();
  const tabActive = useDeliveryTabActive();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const newOrders = useDeliveryStore((state) => state.newOrders);
  const visibleNewOrders = useMemo(() => dedupeOrdersByIdentity(newOrders), [newOrders]);
  const acceptedOrders = useDeliveryStore((state) => state.acceptedOrders);
  const focusedOrderId = useDeliveryStore((state) => state.focusedOrderId);
  const capacity = useDeliveryStore((state) => state.capacity);
  const addNewOrder = useDeliveryStore((state) => state.addNewOrder);
  const setAcceptedOrders = useDeliveryStore((state) => state.setAcceptedOrders);
  const setCapacity = useDeliveryStore((state) => state.setCapacity);
  const setFocusedOrder = useDeliveryStore((state) => state.setFocusedOrder);

  const { acceptOrder } = useOrderManager();
  const { isOrderAlertMuted, toggleOrderAlertMuted, clearNewOrder, stopSound, muteUiTick, triggerOrderAlertFor10Sec } = useDeliveryNotificationsContext();
  void muteUiTick; // re-render when a mute changes (web: same)
  const [activeTab, setActiveTab] = useState('new');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const prevNewCountRef = useRef(visibleNewOrders.length);
  const scrollRef = useRef(null);
  useTabScrollTop(scrollRef);
  const scrollYRef = useRef(0);

  const hydrateOrders = useCallback(async () => {
    try {
      const [currentRes, availableRes] = await Promise.all([
        deliveryAPI.getCurrentDelivery(),
        deliveryAPI.getOrders({ limit: 20, page: 1 }),
      ]);

      const currentPayload = currentRes?.data?.data || {};
      const activeOrders = Array.isArray(currentPayload.activeOrders)
        ? currentPayload.activeOrders
        : currentPayload.activeOrder
          ? [currentPayload.activeOrder]
          : [];

      if (currentPayload.capacity) {
        setCapacity(currentPayload.capacity);
      }

      if (activeOrders.length) {
        setAcceptedOrders(activeOrders.map(mapOrderLocations).filter(Boolean));
      }

      const availablePayload = availableRes?.data?.data || availableRes?.data || {};
      if (availablePayload.capacity) {
        setCapacity(availablePayload.capacity);
      }

      const offers = Array.isArray(availablePayload.newOffers)
        ? availablePayload.newOffers
        : [];

      offers.forEach((order) => addNewOrder(order));
    } catch (error) {
      console.warn('[OrdersV2] hydrate failed:', error?.message || error);
    }
  }, [addNewOrder, setAcceptedOrders, setCapacity]);

  // native: pull to refresh reloads the same lists (the cards stay on screen while it reloads)
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await hydrateOrders();
    } finally {
      setRefreshing(false);
    }
  }, [hydrateOrders]);

  // web: on mount — here every time the tab is opened (the old lists stay on screen while it reloads)
  useEffect(() => {
    if (!tabActive) return;
    void hydrateOrders();
  }, [tabActive, hydrateOrders]);

  // When opening Orders tab, if unaccepted new orders exist and are unmuted, ring for 10s
  useEffect(() => {
    if (!tabActive) return;
    const current = dedupeOrdersByIdentity(useDeliveryStore.getState().newOrders);
    if (current.length > 0) {
      const firstOrder = current[0];
      if (!isOrderAlertMuted(firstOrder)) {
        triggerOrderAlertFor10Sec?.(firstOrder);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive]);

  // Auto-switch to New Orders tab when a live offer arrives
  useEffect(() => {
    if (tabActive && visibleNewOrders.length > prevNewCountRef.current) {
      setActiveTab('new');
      const latestOrder = visibleNewOrders[visibleNewOrders.length - 1];
      if (latestOrder && !isOrderAlertMuted(latestOrder)) {
        triggerOrderAlertFor10Sec?.(latestOrder);
      }
    }
    prevNewCountRef.current = visibleNewOrders.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNewOrders, isOrderAlertMuted, triggerOrderAlertFor10Sec]);

  // Drop expanded card if the order was claimed/removed
  useEffect(() => {
    if (!expandedOrderId) return;
    const stillExists = visibleNewOrders.some((order) => resolveOrderKey(order) === expandedOrderId);
    if (!stillExists) {
      setExpandedOrderId(null);
    }
  }, [visibleNewOrders, expandedOrderId]);

  const handleAccept = async (order) => {
    const orderId = resolveOrderKey(order);
    const isFirstAcceptedOrder = acceptedOrders.length === 0;

    // Stop alert instantly on tap — don't wait for API
    stopSound?.();

    try {
      await acceptOrder(order);
      clearNewOrder(order);
      setExpandedOrderId(null);

      if (isFirstAcceptedOrder) {
        setFocusedOrder(orderId);
        toast.success('Order accepted');
        navigate('/food/delivery/feed');
        return;
      }

      toast.success('Order accepted — added to your queue');
      setActiveTab('accepted');
    } catch {
      // useOrderManager already toasts
    }
  };

  const handleReject = async (order) => {
    const orderId = resolveOrderKey(order);
    if (!orderId) return;
    stopSound?.();
    try {
      await deliveryAPI.rejectOrder(orderId);
    } catch (error) {
      console.warn('[OrdersV2] reject failed:', error?.message || error);
    } finally {
      clearNewOrder(order);
      if (expandedOrderId === orderId) {
        setExpandedOrderId(null);
      }
    }
  };

  const handleSelectAccepted = (order) => {
    const orderId = resolveOrderKey(order);
    if (!orderId) return;
    setFocusedOrder(orderId);
    navigate('/food/delivery/feed');
  };

  const toggleExpanded = (orderId) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
  };

  // web: window.scrollBy({ top: overlap, behavior: 'smooth' }) from the opened card
  const scrollBy = useCallback((overlap) => {
    scrollRef.current?.scrollTo({ y: scrollYRef.current + overlap, animated: true });
  }, []);

  const acceptDisabled = capacity.remaining <= 0;

  const renderBadge = (count, isActive) => (
    <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeIdle]}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
    </View>
  );

  return (
    <View style={styles.page}>
      {tabActive ? <StatusBar style="light" /> : null}
      <LinearGradient
        colors={[deliveryTheme.headerFrom, deliveryTheme.headerTo]}
        start={{ x: 0.33, y: 0 }}
        end={{ x: 0.67, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 24 }]}
      >
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.slots}>{`${capacity.active}/${capacity.max} active slots used`}</Text>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setActiveTab('new')}
            style={[styles.tabBtn, activeTab === 'new' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'new' ? colors.gray[950] : alpha(colors.white, 0.7) }]}>New Orders</Text>
            {visibleNewOrders.length > 0 ? renderBadge(visibleNewOrders.length, activeTab === 'new') : null}
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('accepted')}
            style={[styles.tabBtn, activeTab === 'accepted' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'accepted' ? colors.gray[950] : alpha(colors.white, 0.7) }]}>Accepted</Text>
            {acceptedOrders.length > 0 ? renderBadge(acceptedOrders.length, activeTab === 'accepted') : null}
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[deliveryTheme.primary]} tintColor={deliveryTheme.primary} />}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'new' ? (
          visibleNewOrders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No new order requests right now.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleNewOrders.map((order) => {
                const orderId = resolveOrderKey(order);
                return (
                  <NewOrderCard
                    key={orderId}
                    order={order}
                    expanded={expandedOrderId === orderId}
                    onToggle={() => toggleExpanded(orderId)}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    acceptDisabled={acceptDisabled}
                    isMuted={isOrderAlertMuted(order)}
                    onToggleMute={() => toggleOrderAlertMuted(order)}
                    disabledMessage={`All ${capacity.max} slots in use — complete an active order to accept more`}
                    onRequestScroll={scrollBy}
                  />
                );
              })}
            </View>
          )
        ) : acceptedOrders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Accepted orders will appear here.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {acceptedOrders.map((order) => (
              <AcceptedOrderCard
                key={resolveOrderKey(order)}
                order={order}
                focused={resolveOrderKey(order) === focusedOrderId}
                onSelect={handleSelectAccepted}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.slate[50] },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  title: { color: colors.white, fontSize: 20, lineHeight: 28, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -0.3 },
  slots: { fontSize: 12, lineHeight: 16, color: colors.gray[400], marginTop: 4, fontWeight: '600' },
  tabs: {
    marginTop: 16,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: alpha(colors.white, 0.1),
    padding: 4,
    borderWidth: 1,
    borderColor: deliveryTheme.border,
  },
  tabBtn: { flex: 1, borderRadius: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { backgroundColor: colors.white, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  tabText: { fontSize: 11, lineHeight: 16, fontFamily: fonts.sora, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  badge: { marginLeft: 6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeActive: { backgroundColor: '#15498b' },
  // !bg-orange-500 (important, outside the theme's recolour) + ring-white/25
  badgeIdle: { backgroundColor: colors.orange[500], borderWidth: 1, borderColor: alpha(colors.white, 0.25), elevation: 1 },
  badgeText: { color: colors.white, fontSize: 10, lineHeight: 12, fontFamily: fonts.sora, fontWeight: '900' },
  content: { padding: 16 },
  list: { gap: 12 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: deliveryTheme.border,
    backgroundColor: colors.white,
    padding: 17.6,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#112743',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.gray[500] },
});
