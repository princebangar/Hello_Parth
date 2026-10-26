import React, { useMemo } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, FileText, IndianRupee, Mail, Phone, ReceiptText, Scale, ScrollText, ShieldCheck } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { SUPPORT_INFO } from '../content/supportInfo';
import { termsRawText, privacyRawText } from './legalPageTexts';

const ownerContact = {
  phone: SUPPORT_INFO.phone,
  email: SUPPORT_INFO.email,
};

const vehiclePricing = [
  { type: 'Bike', capacity: 'Up to 2 riders', price: 'Starts at Rs 49', cancellationCut: 'Admin cut up to Rs 10', note: 'Best for quick solo rides and short-distance travel.' },
  { type: 'Auto', capacity: 'Up to 3 riders', price: 'Starts at Rs 79', cancellationCut: 'Admin cut up to Rs 15', note: 'Suitable for city commutes and local market travel.' },
  { type: 'Taxi', capacity: 'Up to 4 riders', price: 'Starts at Rs 129', cancellationCut: 'Admin cut up to Rs 25', note: 'Standard cab option for everyday point-to-point trips.' },
  { type: 'Premium Car', capacity: 'Up to 7 riders', price: 'Starts at Rs 249', cancellationCut: 'Admin cut up to Rs 40', note: 'Extra comfort and larger seating for family or business travel.' },
  { type: 'eRickshaw', capacity: 'Up to 3 riders', price: 'Starts at Rs 69', cancellationCut: 'Admin cut up to Rs 12', note: 'May be available in selected operating zones only.' },
];

const legalContent = {
  terms: {
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    icon: ScrollText,
    intro:
      'These terms are shown from the latest legal document provided for Hello Parth users and include the applicable bike, package, auto, and cab clauses.',
    rawText: termsRawText,
  },
  privacy: {
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    icon: ShieldCheck,
    intro:
      'This privacy policy is shown from the latest legal document provided for Hello Parth users and explains how information is collected, used, processed, stored, and protected.',
    rawText: privacyRawText,
  },
  refund: {
    label: 'Refund Policy',
    title: 'Refund & Cancellation Policy',
    icon: ReceiptText,
    intro:
      'This page explains refund eligibility, cancellation timelines, and indicative prices for the main vehicle types available on the Hello Parth platform. Refunds are reviewed based on service status, time of cancellation, and payment mode.',
    sections: [
      {
        title: 'When refunds may be approved',
        bullets: [
          'Duplicate payment or verified overcharge.',
          'Booking cancelled by the platform or partner after confirmation.',
          'Service could not be fulfilled and the customer was not at fault.',
          'Cancellation made within the free cancellation period, where applicable.',
        ],
      },
      {
        title: 'Refund policy overview',
        body:
          'Hello Parth reviews refund requests on a case-by-case basis to confirm whether the booking was completed, cancelled before service, cancelled after dispatch, or affected by a technical or payment issue. Approved refunds are returned only after internal verification of ride logs, payment status, and service records.',
      },
      {
        title: 'Cancellation rules',
        bullets: [
          'Bike and Auto bookings: free cancellation usually applies before partner assignment or within a short grace window after booking.',
          'Taxi bookings: a cancellation fee may apply once a driver is assigned, the driver is close to pickup, or the vehicle has already started toward the user.',
          'Premium Car bookings: because these block a larger-capacity vehicle, late cancellation may attract a higher convenience or blocking fee.',
          'Parcel or service-center linked vehicle bookings: once pickup, dispatch, or service preparation begins, the booking may become partially refundable or non-refundable.',
          'No-show cases, repeated misuse, or cancellations after service start are generally non-refundable.',
        ],
      },
      {
        title: 'Cases where refunds may be partial',
        bullets: [
          'If a driver or service partner has already been assigned and operational costs have started.',
          'If a vehicle was reserved for a scheduled booking and cancelled late by the customer.',
          'If waiting charges, toll blocking, convenience fees, or zone-specific service costs have already been incurred.',
          'If the service was partly delivered before the booking was cancelled or interrupted.',
        ],
      },
      {
        title: 'Cases where refunds are usually not allowed',
        bullets: [
          'Incorrect pickup or drop details entered by the user that caused service failure.',
          'Customer no-show after the partner reaches or waits at the pickup point.',
          'Cancellations made after the trip, rental, dispatch, or service has already started.',
          'Fraudulent transactions, chargeback misuse, or policy abuse under investigation.',
          'Complaints raised without enough booking or payment proof where service records show successful completion.',
        ],
      },
      {
        title: 'Refund timelines',
        bullets: [
          'UPI or wallet refunds are usually credited within 1 to 3 business days after approval.',
          'Card, bank, or gateway refunds are usually credited within 5 to 10 business days after approval.',
          'If a banking partner delays settlement, the final credit timeline may depend on the payment provider.',
        ],
      },
      {
        title: 'Refund eligibility',
        body:
          'Eligible refunds will be credited within 5 to 10 business days to the original payment method, subject to banking timelines.',
      },
      {
        title: 'How to request a refund',
        bullets: [
          'Raise the issue through the support team with your booking ID, payment details, and reason for the request.',
          'Submit the request as early as possible after the cancelled or affected booking.',
          'Hello Parth may ask for screenshots, transaction references, or additional verification before approval.',
        ],
      },
      {
        title: 'Indicative vehicle pricing',
        table: vehiclePricing,
      },
      {
        title: 'Important pricing note',
        body:
          'The prices and admin cancellation cuts listed above are indicative website references only. Actual booking fares and cancellation deductions can change based on city, route, timing, service zone, partner assignment stage, tolls, waiting time, demand, and service availability.',
      },
    ],
  },
  cancellation: {
    label: 'Cancellation Policy',
    title: 'Cancellation Policy',
    icon: Scale,
    intro:
      'This page summarizes how cancellations are handled across Hello Parth booking categories.',
    sections: [
      {
        title: 'General policy',
        bullets: [
          'Free cancellation may be available during a short grace period.',
          'Charges may apply after partner assignment, dispatch, or service start.',
          'Refundability depends on timing, service state, and payment verification.',
        ],
      },
    ],
  },
};

const getDocumentType = (pathname = '') => {
  const value = pathname.toLowerCase();
  if (value.includes('privacy-policy') || value.includes('privacy')) return 'privacy';
  if (value.includes('terms-and-conditions') || value.includes('terms')) return 'terms';
  if (value.includes('refund')) return 'refund';
  if (value.includes('cancellation')) return 'cancellation';
  return 'terms';
};

const isLegalHeadingLine = (line = '') => {
  const value = String(line || '').trim();
  if (!value) return false;
  if (/^[A-Z\s&()/-]{6,}$/.test(value)) return true;
  if (/^[A-Z]\.\s+[A-Z]/.test(value)) return true;
  if (/^[IVXLCDM]+\.\s+[A-Z]/.test(value)) return true;
  if (/^\([A-Za-z&\s]+\)$/.test(value)) return true;
  return false;
};

const ACCENT = '#f4b400';
const TABLE_HEADERS = ['Vehicle Type', 'Capacity', 'Starting Price', 'Cancellation Cut', 'Use Case'];

function Section({ section }) {
  return (
    <View style={[styles.card, { marginTop: 32 }]}>
      <Text style={styles.sectionTitle}>{section.title}</Text>

      {section.body ? <Text style={styles.sectionBody}>{section.body}</Text> : null}

      {section.bullets ? (
        <View style={{ marginTop: 16, gap: 12 }}>
          {section.bullets.map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {section.table ? (
        // grid-cols-1 on a phone: every cell is its own full-width row, separated by 1 px stone-200 lines
        <View style={styles.table}>
          {TABLE_HEADERS.map((h, i) => (
            <View key={h} style={[styles.th, i ? styles.cellGap : null]}>
              <Text style={styles.thText}>{h}</Text>
            </View>
          ))}
          {section.table.map((row) => (
            <View key={row.type} style={styles.tableRow}>
              <View style={styles.td}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <IndianRupee size={16} color={ACCENT} />
                  <Text style={styles.tdStrongLg}>{row.type}</Text>
                </View>
              </View>
              <View style={[styles.td, styles.cellGap]}><Text style={styles.tdText}>{row.capacity}</Text></View>
              <View style={[styles.td, styles.cellGap]}><Text style={styles.tdStrong}>{row.price}</Text></View>
              <View style={[styles.td, styles.cellGap]}><Text style={styles.tdStrong}>{row.cancellationCut}</Text></View>
              <View style={[styles.td, styles.cellGap]}><Text style={styles.tdText}>{row.note}</Text></View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const LegalPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const content = legalContent[getDocumentType(location.pathname)];
  const Icon = content.icon || FileText;
  const rawParagraphs = useMemo(
    () => (content.rawText
      ? content.rawText
        .split(/\r?\n\r?\n/)
        .map((block) => block.trim())
        .filter(Boolean)
      : []),
    [content.rawText],
  );

  const headerH = 64 + insets.top;

  const hero = (
    <View style={[styles.hero, { paddingTop: 112 + insets.top }]}>
      <View style={styles.heroIcon}>
        <Icon size={30} color={colors.black} />
      </View>
      <Text style={styles.heroTitle}>{content.title}</Text>
      <Text style={styles.heroIntro}>{content.intro}</Text>
      <View style={{ marginTop: 32, gap: 16 }}>
        <Pressable onPress={() => Linking.openURL(`tel:${ownerContact.phone}`).catch(() => {})} style={styles.contact}>
          <Phone size={18} color={ACCENT} />
          <Text style={styles.contactText}>{ownerContact.phone}</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(`mailto:${ownerContact.email}`).catch(() => {})} style={styles.contact}>
          <Mail size={18} color={ACCENT} />
          <Text style={styles.contactText}>{ownerContact.email}</Text>
        </Pressable>
      </View>
    </View>
  );

  // The long documents are one card on the web; here each paragraph is a slice of that card (a list, so the 100 kB of
  // text is not laid out at once).
  const renderParagraph = ({ item: paragraph, index }) => {
    const first = index === 0;
    const last = index === rawParagraphs.length - 1;
    return (
      <View
        style={[
          styles.slice,
          first && styles.sliceFirst,
          last && styles.sliceLast,
          { paddingTop: first ? 32 : 20, paddingBottom: last ? 32 : 0 },
        ]}
      >
        <View style={{ gap: 8 }}>
          {paragraph.split(/\r?\n/).filter(Boolean).map((line, lineIndex) => (
            <Text
              key={`${index}-${lineIndex}-${line.slice(0, 16)}`}
              style={isLegalHeadingLine(line) ? styles.lineHeading : styles.line}
            >
              {line}
            </Text>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Screen bg={colors.stone[50]} edges={[]} statusBarStyle="dark">
      {content.rawText ? (
        <FlatList
          data={rawParagraphs}
          keyExtractor={(paragraph, index) => `${index}-${paragraph.slice(0, 24)}`}
          renderItem={renderParagraph}
          ListHeaderComponent={<>{hero}<View style={{ height: 64 }} /></>}
          ListFooterComponent={<View style={{ height: 64 + insets.bottom }} />}
          contentContainerStyle={{ paddingBottom: 0 }}
          initialNumToRender={12}
          windowSize={11}
        />
      ) : (
        <FlatList
          data={content.sections}
          keyExtractor={(section) => section.title}
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: 24, marginTop: index === 0 ? -32 : 0 }}>
              <Section section={item} />
            </View>
          )}
          ListHeaderComponent={<>{hero}<View style={{ height: 64 }} /></>}
          ListFooterComponent={<View style={{ height: 64 + insets.bottom }} />}
        />
      )}

      {/* fixed top bar: yellow-50/90 with backdrop blur */}
      <View style={[styles.topBar, { height: headerH, paddingTop: insets.top }]}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.yellow[50], 0.9) }]} />
        <View style={styles.topInner}>
          <Pressable onPress={() => navigate(-1)} style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.stone[100] }]}>
            <ArrowLeft size={20} color={colors.slate[900]} />
          </Pressable>
          <Text style={styles.topLabel}>{content.label}</Text>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.yellow[100], 0.8),
    overflow: 'hidden',
  },
  topInner: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  back: { borderRadius: 999, padding: 8 },
  topLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 4.2, color: colors.stone[500] },
  hero: { backgroundColor: '#171717', paddingHorizontal: 24, paddingBottom: 64 },
  heroIcon: {
    marginBottom: 32,
    width: 72,
    height: 72,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTitle: { fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -0.9, color: colors.white },
  heroIntro: { marginTop: 24, fontSize: 18, lineHeight: 29, color: colors.stone[300] },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha('#ffffff', 0.1),
    backgroundColor: alpha('#ffffff', 0.05),
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  contactText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.stone[200],
    backgroundColor: colors.white,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  slice: {
    marginHorizontal: 24,
    paddingHorizontal: 32,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.stone[200],
  },
  sliceFirst: { borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sliceLast: { borderBottomWidth: 1, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  lineHeading: { fontSize: 18, lineHeight: 32, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  line: { fontSize: 14, lineHeight: 32, fontWeight: '500', color: colors.slate[700] },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '900', letterSpacing: -0.5, color: colors.slate[900] },
  sectionBody: { marginTop: 16, fontSize: 16, lineHeight: 32, color: colors.slate[600] },
  bullet: { marginTop: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  bulletText: { flex: 1, fontSize: 16, lineHeight: 28, color: colors.slate[600] },
  table: { marginTop: 24, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.stone[200], backgroundColor: colors.stone[200] },
  th: { backgroundColor: colors.stone[100], paddingHorizontal: 20, paddingVertical: 16 },
  thText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 3, color: colors.stone[500] },
  tableRow: { borderTopWidth: 1, borderTopColor: colors.stone[200] },
  td: { backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 20 },
  cellGap: { marginTop: 1 },
  tdStrongLg: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[900] },
  tdText: { fontSize: 14, lineHeight: 20, color: colors.slate[600] },
  tdStrong: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
});

export default LegalPage;
