// Web: modules/Taxi/modules/driver/pages/settings/SupportChat.jsx — the driver / owner live support chat: a header
// with Back and the shared support chat panel filling the rest of the screen.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { colors, shadow } from '@/theme';
import UserSupportChatPanel from '../../../shared/components/UserSupportChatPanel';

const SupportChat = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const backPath = location.state?.backPath || `${routePrefix}/help-support`;
  const backState = location.state?.backState;

  return (
    // the panel's composer keeps itself above the navigation bar (surface "plain")
    <Screen bg={colors.white} edges={['top']} keyboard>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigate(backPath, backState ? { state: backState } : undefined)}
          accessibilityLabel="Back"
          style={styles.back}
        >
          <ArrowLeft size={18} color={colors.slate[900]} />
        </Pressable>
        <Text style={styles.title}>Support Chat</Text>
      </View>

      <UserSupportChatPanel
        mode="participant"
        preferredRole="driver"
        title="Driver Support Chat"
        subtitle="Live Messages"
        surface="plain"
        style={styles.panel}
      />
    </Screen>
  );
};

export default SupportChat;

const styles = StyleSheet.create({
  header: {
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...shadow.sm,
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
  title: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  panel: { flex: 1 },
});
