import React, { useState, useEffect, useRef } from 'react';
import { Animated, Easing, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, Plus, Loader2, MessageSquare, ChevronRight } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, Text } from '@/native/ui';
import { colors, fonts, shadow } from '@/theme';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

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
 * SupportTicketsV2 - Restored Old UI for Support Ticket Hub.
 */
export const SupportTicketsV2 = () => {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getSupportTickets();
        if (response?.data?.success) {
          setTickets(response.data.data.tickets || []);
        }
      } catch {
        toast.error("Failed to load tickets");
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, []);

  // web: bg-orange-50 text-orange-600 / blue / green -> the delivery theme's primary soft + primary + primary border
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "open":
      case "in_progress":
      case "resolved":
        return { bg: '#E7EFFA', text: '#15498B', border: '#C3D0E1' };
      default:
        return { bg: colors.gray[50], text: colors.gray[600], border: colors.gray[100] };
    }
  };

  const createButton = (
    <Pressable
      onPress={() => navigate("/food/delivery/help/tickets/create")}
      style={({ pressed }) => [styles.createBtn, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Plus size={20} color={colors.white} />
      <Text style={styles.createText}>RAISE NEW TICKET</Text>
    </Pressable>
  );

  const renderTicket = ({ item: ticket }) => {
    const sc = getStatusColor(ticket.status);
    return (
      <Pressable
        onPress={() => navigate(`/food/delivery/help/tickets/${ticket._id}`)}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={styles.subject} numberOfLines={1}>{String(ticket.subject || '').toUpperCase()}</Text>
              {ticket.ticketId ? (
                <View style={styles.idPill}>
                  <Text style={styles.idText}>{`#${ticket.ticketId}`}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.desc} numberOfLines={1}>{ticket.description}</Text>
          </View>
          <ChevronRight size={20} color={colors.gray[200]} />
        </View>

        <View style={styles.footerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <View style={[styles.statusPill, { backgroundColor: sc.bg, borderColor: sc.border }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>{String(ticket.status?.replace('_', ' ') || '').toUpperCase()}</Text>
            </View>
            <Text style={styles.category}>{String(ticket.category || '').toUpperCase()}</Text>
          </View>
          <Text style={styles.date}>{new Date(ticket.createdAt).toLocaleDateString()}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen bg={colors.white}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[50] }]}>
          <ArrowLeft size={24} color={colors.gray[950]} />
        </Pressable>
        <Text style={styles.title}>Support Tickets</Text>
      </View>

      {loading ? (
        <View style={styles.body}>
          {createButton}
          <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Spinner size={32} color={colors.gray[200]} />
            <Text style={styles.micro}>SYNCING TICKETS...</Text>
          </View>
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.body}>
          {createButton}
          <View style={{ paddingVertical: 96, alignItems: 'center' }}>
            <View style={styles.emptyIcon}>
              <MessageSquare size={40} color={colors.gray[200]} />
            </View>
            <Text style={styles.emptyTitle}>NO ACTIVE TICKETS</Text>
            <Text style={styles.emptySub}>CREATE A TICKET IF YOU NEED ASSISTANCE</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t, idx) => String(t._id || idx)}
          renderItem={renderTicket}
          ListHeaderComponent={createButton}
          ListHeaderComponentStyle={{ marginBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80 }}
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.gray[50], zIndex: 50, ...shadow.sm },
  backBtn: { padding: 4, borderRadius: 9999 },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.gray[950], letterSpacing: 0.2 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 24 },
  createBtn: { width: '100%', backgroundColor: colors.black, padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: '#D1DCEB', ...shadow.xl },
  createText: { color: colors.white, fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: 1.4 },
  micro: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[400], letterSpacing: 1 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyTitle: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.gray[950], letterSpacing: 1.4 },
  emptySub: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: '700', marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#D1DCEB', borderRadius: 16, padding: 20, overflow: 'hidden', ...RX },
  subject: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.gray[950], letterSpacing: -0.35, flexShrink: 1 },
  idPill: { backgroundColor: colors.gray[100], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  idText: { fontSize: 9, lineHeight: 12, fontFamily: 'monospace', fontWeight: '700', color: colors.gray[900] },
  desc: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontWeight: '500' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.gray[50] },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  statusText: { fontSize: 9, lineHeight: 12, fontFamily: fonts.sora, fontWeight: '900', letterSpacing: 0.9 },
  category: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.gray[400], letterSpacing: 0.9, flexShrink: 1 },
  date: { fontSize: 9, lineHeight: 12, fontWeight: '700', color: colors.gray[300] },
});
