// Android Back on a login screen (Prince, 26 Oct). The login screen is the first screen of a signed-out app, so Back
// leaves the app at once — it used to go back to the signed-in screen under it, which showed white for 1-2 s and sent
// the user straight back to login. With something typed in the number box a short "Exit?" popup asks first.
//   <LoginExitGuard dirty={phone.length > 0} accent="#0E4B9C" />   (render it on the screen; active while focused)
import React, { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Dialog } from './Sheet';
import { Text } from './Text';

export function LoginExitGuard({ dirty, accent = '#2563EB', enabled = true }) {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (dirtyRef.current) setOpen(true);
        else BackHandler.exitApp();
        return true;
      });
      return () => sub.remove();
    }, [enabled]),
  );

  return (
    <Dialog open={open} onClose={() => setOpen(false)} style={styles.card}>
      <Text style={styles.title}>Exit the app?</Text>
      <Text style={styles.body}>The number you typed will not be saved.</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.btn, styles.cancel, pressed && styles.pressed]}>
          <Text style={[styles.btnText, { color: '#334155' }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setOpen(false);
            BackHandler.exitApp();
          }}
          style={({ pressed }) => [styles.btn, { backgroundColor: accent }, pressed && styles.pressed]}
        >
          <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Exit</Text>
        </Pressable>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { padding: 22, borderRadius: 24, maxWidth: 360 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  body: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#64748B', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#F1F5F9' },
  btnText: { fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
