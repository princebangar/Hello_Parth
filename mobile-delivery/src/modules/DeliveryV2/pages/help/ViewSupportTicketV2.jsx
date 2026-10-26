import React, { useState, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, Loader2, ShieldCheck, Mail } from 'lucide-react-native';
import { useParams } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, Text } from '@/native/ui';
import { colors, fonts, shadow } from '@/theme';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const PRIMARY_SOFT = '#E7EFFA';
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

function Spinner({ color, size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

/**
 * ViewSupportTicketV2 - Restored Old UI for Ticket Details.
 */
export const ViewSupportTicketV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getSupportTicketById(ticketId);
        if (response?.data?.success) {
          const found =
            response?.data?.data?.ticket ||
            response?.data?.data ||
            response?.data?.ticket ||
            null;
          setTicket(found);
        }
      } catch {
        toast.error("Failed to load ticket details");
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [ticketId]);

  if (loading) {
    return (
      <Screen bg={colors.white}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={32} color={PRIMARY} />
        </View>
      </Screen>
    );
  }
  if (!ticket) {
    return (
      <Screen bg={colors.white}>
        <View style={{ flex: 1, padding: 80 }}>
          <Text style={styles.notFound}>TICKET NOT FOUND</Text>
        </View>
      </Screen>
    );
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "open": return { text: PRIMARY, bg: PRIMARY_SOFT };
      case "resolved": return { text: PRIMARY, bg: PRIMARY_SOFT };
      case "closed": return { text: colors.gray[600], bg: colors.gray[50] };
      default: return { text: PRIMARY, bg: PRIMARY_SOFT };
    }
  };
  const sc = getStatusColor(ticket.status);

  return (
    <Screen bg={colors.gray[50]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[50] }]}>
          <ArrowLeft size={24} color={colors.gray[950]} />
        </Pressable>
        <Text style={styles.title}>TICKET INFO</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status & ID */}
        <View style={[styles.card, { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Text style={styles.micro}>ID REFERENCE</Text>
            <Text style={styles.idText}>{`#${ticket.ticketId || "Pending"}`}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{String(ticket.status || '').toUpperCase()}</Text>
          </View>
        </View>

        {/* Subject & Description */}
        <View style={[styles.card, { gap: 16 }]}>
          <View style={{ gap: 4 }}>
            <Text style={styles.micro}>SUBJECT</Text>
            <Text style={styles.subject}>{ticket.subject}</Text>
          </View>
          <View style={{ gap: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.gray[50] }}>
            <Text style={styles.micro}>DETAIL DESCRIPTION</Text>
            <Text style={styles.desc}>{ticket.description}</Text>
          </View>
        </View>

        {/* Response Section */}
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'flex-start', gap: 16 }]}>
          <View style={styles.responseIcon}>
            <ShieldCheck size={20} color={PRIMARY} />
          </View>
          <View style={{ gap: 8, flexShrink: 1 }}>
            <Text style={styles.micro}>SUPPORT RESPONSE</Text>
            <Text style={styles.response}>
              {ticket.adminResponse || "Our support team is currently reviewing your ticket. You'll receive a notification once there is an update."}
            </Text>
            {ticket.respondedAt ? (
              <Text style={styles.micro}>{`UPDATED ${new Date(ticket.respondedAt).toLocaleString()}`.toUpperCase()}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Mail size={48} color={colors.gray[900]} />
          <Text style={styles.footerText}>HELLO PARTH FOOD SUPPORT FLEET</Text>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.gray[50], zIndex: 50, ...shadow.sm },
  backBtn: { padding: 4, borderRadius: 9999 },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.gray[950], letterSpacing: -0.5 },
  notFound: { textAlign: 'center', color: colors.gray[400], fontWeight: '700', letterSpacing: 1.6, fontSize: 16 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 80, gap: 24 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 17.6, borderWidth: 1, borderColor: '#D1DCEB', ...RX },
  micro: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[400], letterSpacing: 1 },
  idText: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.gray[950] },
  statusPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  statusText: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', letterSpacing: 1 },
  subject: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.gray[950] },
  desc: { fontSize: 12, lineHeight: 19, color: colors.gray[600], fontWeight: '500' },
  responseIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: PRIMARY_SOFT, alignItems: 'center', justifyContent: 'center' },
  response: { fontSize: 12, lineHeight: 19, color: PRIMARY, fontWeight: '700', fontStyle: 'italic' },
  footer: { marginTop: 40, alignItems: 'center', justifyContent: 'center', opacity: 0.2, gap: 16 },
  footerText: { fontSize: 10, fontFamily: fonts.sora, fontWeight: '900', letterSpacing: 4, textAlign: 'center', color: colors.gray[900] },
});
