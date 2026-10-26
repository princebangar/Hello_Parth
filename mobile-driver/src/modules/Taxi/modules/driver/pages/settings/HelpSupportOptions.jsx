// Web: modules/Taxi/modules/driver/pages/settings/HelpSupportOptions.jsx — Help & Support: owner support email / phone,
// Live Chat and Support Ticket entries.
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Headset, Mail, MessageCircle, Phone } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { colors, shadow } from '@/theme';

const PAGE_BG = '#f8f9fb';

const HelpSupportOptions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  return (
    <Screen bg={PAGE_BG} edges={['top']}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeft size={18} color={colors.slate[900]} />
          </Pressable>
          <Text style={styles.title}>Help & Support</Text>
        </View>

        <View style={styles.body}>
          {/* Owner Support: direct email / phone (used to sit at the bottom of the profile page) */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.dot} />
              <Text style={styles.cardTitle}>Owner Support</Text>
            </View>

            <View style={styles.contactList}>
              <Pressable onPress={() => Linking.openURL('mailto:helloparthg@gmail.com').catch(() => {})} style={styles.contactRow}>
                <View style={styles.iconBox}>
                  <Mail size={20} color={colors.slate[600]} />
                </View>
                <View style={styles.minW0}>
                  <Text style={styles.contactLabel}>Email Support</Text>
                  <Text numberOfLines={1} style={styles.contactValue}>helloparthg@gmail.com</Text>
                </View>
              </Pressable>

              <Pressable onPress={() => Linking.openURL('tel:9193911911').catch(() => {})} style={styles.contactRow}>
                <View style={styles.iconBox}>
                  <Phone size={20} color={colors.slate[600]} />
                </View>
                <View style={styles.minW0}>
                  <Text style={styles.contactLabel}>Call Support</Text>
                  <Text style={styles.contactValue}>91-93-911-911</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => navigate(`${routePrefix}/support/chat`)} style={styles.option}>
            <View style={styles.optionLeft}>
              <View style={styles.iconBox}>
                <MessageCircle size={20} color={colors.slate[600]} />
              </View>
              <View>
                <Text style={styles.optionTitle}>Live Chat</Text>
                <Text style={styles.optionSub}>Talk instantly with support team</Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.slate[300]} />
          </Pressable>

          <Pressable onPress={() => navigate(`${routePrefix}/support/tickets`)} style={styles.option}>
            <View style={styles.optionLeft}>
              <View style={styles.iconBox}>
                <Headset size={20} color={colors.slate[600]} />
              </View>
              <View>
                <Text style={styles.optionTitle}>Support Ticket</Text>
                <Text style={styles.optionSub}>Raise and track issue tickets</Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.slate[300]} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
};

export default HelpSupportOptions;

const styles = StyleSheet.create({
  header: {
    zIndex: 30,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  back: {
    height: 40,
    width: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  title: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  body: { paddingHorizontal: 24, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 20, ...shadow.sm },
  cardHead: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.emerald[500] },
  cardTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.65, color: colors.slate[900] },
  contactList: { gap: 20 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { height: 44, width: 44, borderRadius: 14, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  minW0: { flexShrink: 1, minWidth: 0 },
  contactLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400] },
  contactValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[800] },
  option: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadow.sm,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  optionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  optionSub: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[400] },
});
