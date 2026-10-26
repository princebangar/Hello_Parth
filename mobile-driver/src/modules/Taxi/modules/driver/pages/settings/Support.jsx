// Web: modules/Taxi/modules/driver/pages/settings/Support.jsx — "Support Hub": search box, WhatsApp / call buttons,
// troubleshooting FAQs (each opens a popup) and the policy rows.
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, HelpCircle, Phone, MessageCircle, ChevronRight, FileText, Globe, Search, ArrowUpRight, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Dialog, Screen, Text, TextInput } from '@/native/ui';
import { colors, driverTheme, shadow } from '@/theme';

const PAGE_BG = '#f8f9fb';

const DriverSupport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFaq, setActiveFaq] = useState(null);

  const faqs = [
    { q: 'How is payout calculated?', a: 'Based on distance + base fare + time.' },
    { q: 'What to do in an accident?', a: 'Press SOS immediately and call support.' },
    { q: 'How to change active vehicle?', a: 'Go to Vehicle Fleet and select primary.' },
  ];

  const openHelp = (type) => {
    if (type === 'call') Linking.openURL('tel:1800123456').catch(() => {});
    if (type === 'wa') Linking.openURL('https://wa.me/919424100424').catch(() => {});
  };

  const policyRows = [
    { label: 'Privacy Policy', Icon: FileText, path: '/privacy' },
    { label: 'Terms of Service', Icon: Globe, path: '/terms' },
  ];

  return (
    <Screen bg={PAGE_BG} edges={['top']}>
      <ScrollView
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 128 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeft size={18} color={colors.slate[900]} />
          </Pressable>
          <Text style={styles.title}>SUPPORT HUB</Text>
        </View>

        <View style={styles.main}>
          <View style={styles.searchBox}>
            <Search size={18} color={colors.slate[300]} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="SEARCH ISSUES..."
              placeholderTextColor={colors.slate[300]}
              autoCapitalize="characters"
              style={styles.searchInput}
            />
          </View>

          <View style={styles.quickRow}>
            <Pressable onPress={() => openHelp('wa')} style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed95]}>
              <MessageCircle size={24} strokeWidth={2.5} color={colors.slate[600]} />
              <Text style={styles.quickText}>Chat on WhatsApp</Text>
            </Pressable>
            <Pressable onPress={() => openHelp('call')} style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed95]}>
              <Phone size={24} strokeWidth={2.5} color={colors.slate[600]} />
              <Text style={styles.quickText}>Speak to Agent</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Troubleshooting</Text>
              <Pressable style={styles.docBtn}>
                <Text style={styles.docText}>Documentation</Text>
              </Pressable>
            </View>

            <View style={styles.faqList}>
              {faqs.map((faq, idx) => (
                <Pressable
                  key={faq.q}
                  onPress={() => setActiveFaq(idx)}
                  style={({ pressed }) => [styles.faqRow, pressed && styles.pressed99]}
                >
                  <View style={styles.faqLeft}>
                    <View style={styles.faqIcon}>
                      <HelpCircle size={18} color={colors.slate[400]} />
                    </View>
                    <Text style={styles.faqQ}>{faq.q}</Text>
                  </View>
                  <ArrowUpRight size={18} color={colors.slate[200]} />
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.policyList}>
            {policyRows.map(({ label, Icon }) => (
              <Pressable key={label} style={styles.policyRow}>
                {({ pressed }) => {
                  const tint = pressed ? colors.slate[900] : colors.slate[400];
                  return (
                    <>
                      <View style={styles.policyLeft}>
                        <Icon size={16} color={tint} />
                        <Text style={[styles.policyLabel, { color: tint }]}>{label}</Text>
                      </View>
                      <ChevronRight size={16} color={tint} />
                    </>
                  );
                }}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <Dialog open={activeFaq !== null} onClose={() => setActiveFaq(null)} backdropOpacity={0.6} style={styles.faqDialog}>
        {activeFaq !== null ? (
          <View style={styles.faqDialogBody}>
            <View style={styles.faqDialogHead}>
              <HelpCircle size={28} color={colors.blue[500]} />
              <Pressable onPress={() => setActiveFaq(null)} style={styles.faqClose}>
                <X size={18} color={colors.slate[400]} />
              </Pressable>
            </View>
            <Text style={styles.faqDialogQ}>{faqs[activeFaq].q}</Text>
            <Text style={styles.faqDialogA}>{faqs[activeFaq].a}</Text>
            <Pressable onPress={() => setActiveFaq(null)} style={styles.closeTopic}>
              <Text style={styles.closeTopicText}>Close Topic</Text>
            </Pressable>
          </View>
        ) : null}
      </Dialog>
    </Screen>
  );
};

export default DriverSupport;

const styles = StyleSheet.create({
  header: {
    zIndex: 30,
    marginBottom: 16,
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
  main: { paddingHorizontal: 24, gap: 24 },
  searchBox: {
    overflow: 'hidden',
    backgroundColor: colors.white,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, color: colors.slate[900], paddingVertical: 2 },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.slate[100],
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.slate[200],
    alignItems: 'center',
    gap: 8,
    ...shadow.sm,
  },
  pressed95: { transform: [{ scale: 0.95 }] },
  pressed99: { transform: [{ scale: 0.99 }] },
  quickText: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[600], textAlign: 'center' },
  section: { gap: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400], opacity: 0.6 },
  docBtn: { borderBottomWidth: 1, borderBottomColor: colors.slate[200], paddingBottom: 2 },
  docText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[600] },
  faqList: { gap: 12 },
  faqRow: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.sm,
  },
  faqLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  faqIcon: {
    width: 40,
    height: 40,
    backgroundColor: colors.slate[50],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQ: { flexShrink: 1, fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: -0.33, color: colors.slate[900] },
  policyList: { gap: 12, paddingBottom: 20 },
  policyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  policyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  policyLabel: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  faqDialog: { maxWidth: 384, borderRadius: 32, ...shadow['2xl'] },
  faqDialogBody: { padding: 28, gap: 16 },
  faqDialogHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  faqClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  faqDialogQ: { fontSize: 18, lineHeight: 18, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  faqDialogA: { fontSize: 13, lineHeight: 21, fontWeight: '700', color: colors.slate[400], opacity: 0.8 },
  // bg-slate-900 button: the partner button colour (Taxi blue, white text)
  closeTopic: { width: '100%', height: 48, marginTop: 8, borderRadius: 16, backgroundColor: driverTheme.button, alignItems: 'center', justifyContent: 'center' },
  closeTopicText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.white },
});
