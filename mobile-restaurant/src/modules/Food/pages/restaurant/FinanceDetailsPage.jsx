// Web: pages/restaurant/FinanceDetailsPage.jsx (/finance-details, opened from HubFinance with location.state
// { financeData, restaurantData }) — restaurant header, Summary / Orders / Expenses pill tabs, the "Active Earnings"
// card and the "Settlement summary" (Net order value (A), Additions (B), Order level deductions (C), Tax deductions (D),
// Investments in growth (E), Est. payout) with collapsible rows, and the Download / Email info sheets (closed after
// 2 s). Same values, texts and rules (no API call: everything comes from the state HubFinance passed).
// Native:
// - The web file uses useMemo without importing it (the page throws on the web as soon as it renders); here useMemo is
//   imported so the page renders its intended content.
// - The sticky pill tab bar is a horizontal ScrollView fixed under the header (scrolls the chosen pill to the centre
//   like the web's scrollToTopTab); tab change: fade + slide like the web's AnimatePresence (opacity, x 20 -> 0).
// - Collapsible rows: LayoutAnimation (height / opacity 0.2 s). Dashed separators: borderStyle 'dashed'.
// - The Download / Email popups (fixed bottom sheet + black/50 backdrop, spring) are Sheets.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, ChevronUp, Download, Info, Mail, X } from 'lucide-react-native';
import { useLocation } from '@/lib/router';
import { Screen, Sheet, StatusBarSpacer, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

const BRAND_GRADIENT = [restaurantTheme.brand, restaurantTheme.brandDark];

const money = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

function TabPill({ tab, active, onPress, onLayout }) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: active ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [active, anim]);
  return (
    <Pressable onPress={onPress} onLayout={onLayout}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.pill,
            !active && { backgroundColor: colors.white },
            {
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
              transform: [{ scale: pressed ? 0.95 : anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
            },
          ]}
        >
          {active ? <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
          <Text style={[styles.pillText, { color: active ? colors.white : colors.black }]}>{tab.label}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

function DetailRow({ label, value, first }) {
  return (
    <View style={[styles.detailRow, !first && styles.dashedTop]}>
      <View style={styles.detailLabelWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Info size={14} color={colors.gray[400]} />
      </View>
      <Text style={styles.detailValue}>{money(value)}</Text>
    </View>
  );
}

function Section({ title, total, expanded, onToggle, rows }) {
  return (
    <View style={styles.sectionWrap}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.sectionHead, pressed && { backgroundColor: colors.gray[50] }]}>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionRight}>
          <Text style={styles.sectionTitle}>{money(total)}</Text>
          {expanded ? <ChevronUp size={16} color={colors.gray[500]} /> : <ChevronDown size={16} color={colors.gray[500]} />}
        </View>
      </Pressable>
      {expanded && rows ? (
        <View style={styles.sectionBody}>
          {rows.map((row, i) => (
            <DetailRow key={row.label} label={row.label} value={row.value} first={i === 0} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InfoSheet({ open, onClose, title, text }) {
  return (
    <Sheet open={open} onClose={onClose} style={styles.sheet}>
      <View style={styles.sheetBody}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.sheetClose, pressed && { backgroundColor: colors.gray[100] }]}>
            <X size={20} color={colors.gray[600]} />
          </Pressable>
        </View>
        <Text style={styles.sheetText}>{text}</Text>
        <Pressable onPress={onClose} style={styles.sheetBtn}>
          <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.sheetBtnText}>Close</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

export default function FinanceDetailsPage() {
  const goBack = useRestaurantBackNavigation();
  const location = useLocation();
  const financeData = location.state?.financeData || null;
  const restaurantData = location.state?.restaurantData || null;

  const [activeTab, setActiveTab] = useState('summary');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    netOrderValue: true,
    additions: true,
    orderLevelDeductions: true,
    taxDeductions: true,
    investmentsInGrowth: true,
  });
  const topTabBarRef = useRef(null);
  const tabLayouts = useRef({});
  const barWidth = useRef(0);
  const timers = useRef([]);
  const contentAnim = useRef(new Animated.Value(1)).current;

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'orders', label: 'Orders' },
    { id: 'expenses', label: 'Expenses' },
  ];

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const scrollToTopTab = (id) => {
    const box = tabLayouts.current[id];
    if (!box || !topTabBarRef.current) return;
    const scrollLeft = box.x - barWidth.current / 2 + box.width / 2;
    topTabBarRef.current.scrollTo({ x: Math.max(0, scrollLeft), animated: true });
  };

  useEffect(() => {
    requestAnimationFrame(() => scrollToTopTab(activeTab));
    contentAnim.setValue(0);
    Animated.timing(contentAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [activeTab, contentAnim]);

  const handleDownload = () => {
    setShowDownloadPopup(true);
    // In a real app, this would trigger PDF download
    later(() => {
      setShowDownloadPopup(false);
    }, 2000);
  };

  const handleEmail = () => {
    setShowEmailPopup(true);
    // In a real app, this would send email
    later(() => {
      setShowEmailPopup(false);
    }, 2000);
  };

  // Settlement data with real values from financeData
  const settlementData = useMemo(() => {
    const cycle = financeData?.currentCycle || {};
    const summary = financeData?.invoiceSummary || {};

    return {
      totalOrders: cycle.totalOrders || 0,
      netOrderValue: {
        itemSubtotal: summary.subtotal || 0,
        totalGSTCollected: summary.taxes || 0,
        restaurantDiscountPromos: 0,
        restaurantDiscountOthers: 0,
        total: summary.subtotal || 0,
      },
      additions: {
        tds194H: 0,
        tds194C: 0,
        total: 0,
      },
      orderLevelDeductions: {
        total: 0,
      },
      taxDeductions: {
        gstOnServiceFees: 0,
        tds194O: 0,
        gstPaidByHelloParth: 0,
        total: summary.taxes || 0,
      },
      investmentsInGrowth: {
        onlineOrderingAds: 0,
        total: 0,
      },
      estimatedPayout: cycle.estimatedPayout || 0,
      start: cycle.start?.day || '15',
      end: cycle.end?.day || '21',
      month: cycle.start?.month || 'Dec',
      year: cycle.start?.year || '25',
    };
  }, [financeData]);

  const estimatedPayout = settlementData.estimatedPayout;

  const toggleSection = (section) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const period = `${settlementData.start} - ${settlementData.end} ${settlementData.month}'${settlementData.year}`;

  return (
    <Screen bg={colors.gray[100]} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {restaurantData?.name || 'Your Restaurant'}
            </Text>
            <Text style={styles.headerSub}>
              ID: {restaurantData?.restaurantId || 'N/A'} • {restaurantData?.address || 'Location'}
            </Text>
          </View>
        </View>
      </View>

      {/* Top Navigation Tabs */}
      <View style={styles.tabsWrap}>
        <ScrollView
          ref={topTabBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.tabsRow}
          onLayout={(e) => {
            barWidth.current = e.nativeEvent.layout.width;
          }}
        >
          {tabs.map((tab) => (
            <TabPill
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onLayout={(e) => {
                tabLayouts.current[tab.id] = e.nativeEvent.layout;
              }}
              onPress={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true);
                  setActiveTab(tab.id);
                  later(() => setIsTransitioning(false), 300);
                }
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Animated.View
          style={{ opacity: contentAnim, transform: [{ translateX: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}
        >
          {activeTab === 'summary' ? (
            <View style={styles.summary}>
              {/* Estimated Payout Card */}
              <View style={styles.payoutCard}>
                <View style={styles.payoutGrid}>
                  <View style={styles.flex}>
                    <Text style={styles.smallLabel}>Active Earnings</Text>
                    <Text style={styles.payoutValue}>{money(estimatedPayout)}</Text>
                    <Text style={styles.smallText}>from {period}</Text>
                    <Text style={[styles.smallText, { marginTop: sp(1) }]}>Payout date: -</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.smallLabel}>Payout for</Text>
                    <Text style={styles.payoutFor}>{period}</Text>
                  </View>
                </View>
              </View>

              {/* Settlement Summary */}
              <View>
                <View style={styles.summaryHead}>
                  <Text style={styles.summaryTitle}>Settlement summary</Text>
                  <View style={styles.summaryActions}>
                    <Pressable onPress={handleDownload} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.gray[300] }]}>
                      <Download size={16} color={colors.gray[700]} />
                    </Pressable>
                    <Pressable onPress={handleEmail} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.gray[300] }]}>
                      <Mail size={16} color={colors.gray[700]} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.summaryCard}>
                  {/* Total Orders */}
                  <View style={[styles.totalOrders, styles.rowBorder]}>
                    <Text style={styles.totalOrdersLabel}>Total orders</Text>
                    <Text style={styles.totalOrdersValue}>{settlementData.totalOrders}</Text>
                  </View>

                  <Section
                    title="Net order value (A)"
                    total={settlementData.netOrderValue?.total}
                    expanded={expandedSections.netOrderValue}
                    onToggle={() => toggleSection('netOrderValue')}
                    rows={[
                      { label: 'Item subtotal', value: settlementData.netOrderValue.itemSubtotal },
                      { label: 'Total GST collected from customers', value: settlementData.netOrderValue?.totalGSTCollected },
                      { label: 'Restaurant discount (Promos)', value: settlementData.netOrderValue.restaurantDiscountPromos },
                      {
                        label: 'Restaurant discount (Flat offs, Freebies, Gold, relisted orders and others)',
                        value: settlementData.netOrderValue?.restaurantDiscountOthers,
                      },
                    ]}
                  />
                  <Section
                    title="Additions (B)"
                    total={settlementData.additions.total}
                    expanded={expandedSections.additions}
                    onToggle={() => toggleSection('additions')}
                    rows={[
                      { label: 'TDS 194H', value: settlementData.additions?.tds194H },
                      { label: 'TDS 194C', value: settlementData.additions.tds194C },
                    ]}
                  />
                  <Section
                    title="Order level deductions (C)"
                    total={settlementData.orderLevelDeductions?.total}
                    expanded={expandedSections.orderLevelDeductions}
                    onToggle={() => toggleSection('orderLevelDeductions')}
                    rows={null}
                  />
                  <Section
                    title="Tax deductions (D)"
                    total={settlementData.taxDeductions.total}
                    expanded={expandedSections.taxDeductions}
                    onToggle={() => toggleSection('taxDeductions')}
                    rows={[
                      { label: 'GST on service and payment mechanism fees @18%', value: settlementData.taxDeductions?.gstOnServiceFees },
                      { label: 'TDS 194O', value: settlementData.taxDeductions.tds194O },
                      { label: 'GST paid by Hello Parth on behalf of the restaurant u/s 9(5) of GST', value: settlementData.taxDeductions?.gstPaidByHelloParth },
                    ]}
                  />
                  <Section
                    title="Investments in growth (E)"
                    total={settlementData.investmentsInGrowth.total}
                    expanded={expandedSections.investmentsInGrowth}
                    onToggle={() => toggleSection('investmentsInGrowth')}
                    rows={[{ label: 'Online ordering ads', value: settlementData.investmentsInGrowth?.onlineOrderingAds }]}
                  />

                  {/* Est. payout */}
                  <View style={styles.estRow}>
                    <Text style={styles.estText}>Est. payout (A + B - C - D - E)</Text>
                    <Text style={styles.estText}>{money(estimatedPayout)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {activeTab === 'orders' ? (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>Orders data will be displayed here</Text>
            </View>
          ) : null}

          {activeTab === 'expenses' ? (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>Expenses data will be displayed here</Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Download Popup */}
      <InfoSheet
        open={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        title="Download Report"
        text="Your settlement report is being downloaded as PDF..."
      />

      {/* Email Popup */}
      <InfoSheet
        open={showEmailPopup}
        onClose={() => setShowEmailPopup(false)}
        title="Email Report"
        text="Your settlement report has been sent to your registered email address."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 40 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: sp(1), borderRadius: 9999 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  headerSub: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginTop: 2 },
  tabsWrap: { backgroundColor: colors.gray[100], paddingBottom: sp(2), zIndex: 30 },
  tabsRow: { gap: sp(2), paddingHorizontal: sp(3), paddingVertical: sp(2), marginTop: sp(2) },
  pill: { paddingHorizontal: sp(6), paddingVertical: sp(3.5), borderRadius: 9999, overflow: 'hidden' },
  pillText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(4) },
  summary: { gap: sp(6) },
  payoutCard: { backgroundColor: colors.white, borderRadius: 10, padding: sp(4) },
  payoutGrid: { flexDirection: 'row', gap: sp(4) },
  smallLabel: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginBottom: sp(1) },
  payoutValue: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.gray[900], marginBottom: sp(1) },
  smallText: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
  payoutFor: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(3) },
  summaryTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  iconBtn: { padding: sp(3), backgroundColor: colors.white, borderRadius: 10 },
  summaryCard: { backgroundColor: colors.white, borderRadius: 10, overflow: 'hidden' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  totalOrders: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalOrdersLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  totalOrdersValue: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  sectionWrap: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  sectionHead: { width: '100%', paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexShrink: 1 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  sectionBody: { paddingHorizontal: sp(4), paddingBottom: sp(3), gap: sp(2), borderTopWidth: 1, borderTopColor: colors.gray[200], borderStyle: 'dashed' },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: sp(2), gap: sp(2) },
  dashedTop: { borderTopWidth: 1, borderTopColor: colors.gray[200], borderStyle: 'dashed' },
  detailLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  detailLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[700], flexShrink: 1 },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  estRow: {
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderTopWidth: 2,
    borderTopColor: colors.gray[900],
    backgroundColor: colors.gray[50],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(2),
  },
  estText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  placeholderCard: { borderRadius: 10, padding: sp(4) },
  placeholderText: { fontSize: 14, lineHeight: 20, color: colors.gray[800], textAlign: 'center', paddingVertical: sp(8) },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, ...shadow['2xl'] },
  sheetBody: { padding: sp(6) },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4) },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  sheetClose: { padding: sp(1), borderRadius: 9999 },
  sheetText: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: sp(4) },
  sheetBtn: { width: '100%', paddingVertical: sp(3), borderRadius: 10, overflow: 'hidden', alignItems: 'center' },
  sheetBtnText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: '500' },
});
