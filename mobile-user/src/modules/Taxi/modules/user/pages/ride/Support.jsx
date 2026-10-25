import React from 'react';
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, MessageCircle, Phone, HelpCircle, AlertCircle, XCircle, ShieldCheck, ChevronRight, Siren } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { alpha, colors, useTheme } from '@/theme';
import { SUPPORT_INFO } from '../../../shared/content/supportInfo';

// --user-* palette of modules/Taxi/index.css (light / dark)
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
// var(--user-card-shadow)
const cardShadow = (dark) => (dark
  ? { elevation: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }
  : { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } });

const Support = () => {
  const bottomNavSpace = useBottomNavSpace(40);
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const helpTopics = [
    { title: "Driver didn't arrive", Icon: XCircle },
    { title: 'Safety concern', Icon: ShieldCheck },
    { title: 'I lost an item', Icon: HelpCircle },
    { title: 'Payment failure', Icon: AlertCircle },
  ];

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_INFO.phoneHref}`).catch(() => {});
  };

  const openSupportChat = (topicTitle = '') => {
    const initialDraft = topicTitle ? `Hi, I need help with: ${topicTitle}.` : '';

    navigate(`${routePrefix}/ride/chat?admin=true&role=user`, {
      state: initialDraft ? { initialDraft } : undefined,
    });
  };

  const quickActions = [
    { title: 'Live chat', sub: 'Get quick help', Icon: MessageCircle, onClick: () => openSupportChat() },
    { title: 'Call support', sub: 'Talk to us', Icon: Phone, onClick: handleCall },
    { title: 'Emergency SOS', sub: 'Get safety help fast', Icon: Siren, onClick: () => navigate(`${routePrefix}/safety/sos`), danger: true },
  ];

  const card = { backgroundColor: p.card, borderWidth: 1, borderColor: p.border, ...cardShadow(t.dark) };
  // .service-art (light: soft yellow tint + #8A6100, dark: yellow tint + accent)
  const serviceArt = t.dark ? { bg: 'rgba(255,196,0,0.14)', fg: '#FFC400' } : { bg: 'rgba(255,196,0,0.16)', fg: '#8A6100' };

  return (
    <Screen bg={p.bg} edges={['top']}>
      <View style={[styles.header, { backgroundColor: p.card, borderBottomColor: p.border }]}>
        <Pressable
          onPress={() => navigate(-1)}
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <ArrowLeft size={22} strokeWidth={2.4} color={p.text} />
        </Pressable>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={[styles.kicker, { color: p.muted }]}>Support</Text>
          <Text numberOfLines={1} style={[styles.title, { color: p.text }]}>Help & Support</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomNavSpace }]} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 10 }}>
          {quickActions.map(({ title, sub, Icon, onClick, danger }) => (
            <Pressable
              key={title}
              onPress={onClick}
              style={({ pressed }) => [styles.action, card, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={[styles.actionIcon, { backgroundColor: danger ? alpha(colors.rose[500], 0.1) : serviceArt.bg }]}>
                <Icon size={20} strokeWidth={2.2} color={danger ? colors.rose[600] : serviceArt.fg} />
              </View>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={[styles.actionTitle, { color: p.text }]}>{title}</Text>
                <Text numberOfLines={1} style={[styles.actionSub, { color: p.sec }]}>{sub}</Text>
              </View>
              <ChevronRight size={18} strokeWidth={2.4} color={p.muted} />
            </Pressable>
          ))}
        </View>

        <View>
          <Text style={[styles.sectionTitle, { color: p.text }]}>Choose a topic</Text>
          <View style={{ gap: 10 }}>
            {helpTopics.map((topic) => (
              <Pressable
                key={topic.title}
                onPress={() => openSupportChat(topic.title)}
                style={({ pressed }) => [styles.topic, card, pressed && { transform: [{ scale: 0.99 }] }]}
              >
                <View style={styles.topicLeft}>
                  <View style={[styles.topicIcon, { backgroundColor: p.soft }]}>
                    <topic.Icon size={18} strokeWidth={2.2} color={p.text} />
                  </View>
                  <Text numberOfLines={1} style={[styles.topicTitle, { color: p.text }]}>{topic.title}</Text>
                </View>
                <ChevronRight size={18} strokeWidth={2.4} color={p.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { zIndex: 20, borderBottomWidth: 1, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { padding: 8, marginLeft: -8, borderRadius: 9999 },
  kicker: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  title: { marginTop: 2, fontSize: 19, lineHeight: 23, fontWeight: '600', letterSpacing: -0.47 },
  // pb-[calc(8.5rem+env(safe-area-inset-bottom))]: room for the floating bottom nav
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 136, gap: 24 },
  action: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  actionTitle: { fontSize: 15, lineHeight: 19, fontWeight: '600' },
  actionSub: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  sectionTitle: { marginBottom: 12, fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.17 },
  topic: { width: '100%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topicLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 },
  topicIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});

export default Support;
