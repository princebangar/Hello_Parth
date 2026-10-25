// Web: modules/Taxi/modules/user/components/LocationOffDialog.jsx — "Use current location" could not read the device
// position (location off / permission refused). Portalled to <body> on the web, i.e. outside the Taxi theme scope:
// always the light card. `reason`: 'denied' (permission refused) or anything else (GPS off / no signal).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MapPinOff } from 'lucide-react-native';
import { Dialog, Text } from '@/native/ui';
import { alpha, colors, shadow } from '@/theme';

const LocationOffDialog = ({ open, reason = 'off', onRetry, onClose }) => {
  const denied = reason === 'denied';

  return (
    <Dialog open={Boolean(open)} onClose={onClose} dismissible={false} backdropOpacity={0.55} style={styles.dialogShell}>
      <View accessibilityRole="alert" accessibilityLabel="Turn on location" style={styles.card}>
        <View style={styles.iconWrap}>
          <MapPinOff size={26} color={colors.amber[600]} />
        </View>
        <Text style={styles.title}>Turn on location</Text>
        <Text style={styles.body}>
          {denied
            ? 'Location access is blocked for Hello Parth. Allow it in your phone / browser settings, then tap Try again.'
            : 'Your phone location (GPS) is off. Turn it on in the phone settings to use your current location, then tap Try again.'}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
            <Text style={styles.btnGhostText}>Not now</Text>
          </Pressable>
          <Pressable onPress={onRetry} style={({ pressed }) => [styles.btn, styles.btnDark, pressed && styles.pressed]}>
            <Text style={styles.btnDarkText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  // the Dialog's own card is transparent: the web card below carries the look
  dialogShell: { backgroundColor: 'transparent', maxWidth: 340, overflow: 'visible' },
  card: { width: '100%', maxWidth: 340, borderRadius: 28, backgroundColor: colors.white, padding: 24, alignItems: 'center', ...shadow['2xl'] },
  iconWrap: { height: 56, width: 56, borderRadius: 28, backgroundColor: colors.amber[100], alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 16, fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900], textAlign: 'center' },
  body: { marginTop: 8, fontSize: 13, lineHeight: 21, fontWeight: '600', color: colors.slate[500], textAlign: 'center' },
  actions: { marginTop: 20, flexDirection: 'row', gap: 12, width: '100%' },
  btn: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  btnGhostText: { fontSize: 13, fontWeight: '700', color: colors.slate[600] },
  btnDark: { backgroundColor: colors.slate[900] },
  btnDarkText: { fontSize: 13, fontWeight: '700', color: colors.white },
  pressed: { transform: [{ scale: 0.95 }] },
});

export default LocationOffDialog;
