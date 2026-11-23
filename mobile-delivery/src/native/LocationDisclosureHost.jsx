// The location explanation shown before Android's location permission prompt (Google Play prominent disclosure).
// See src/lib/locationDisclosure.js. Mounted once in the root layout.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Navigation, Bike, PowerOff } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { deliveryTheme as dv } from '@/theme';
import { registerLocationDisclosureHost, setLocationDisclosureShown } from '@/lib/locationDisclosure';
import { navigateTo } from '@/lib/router';

const POINTS = [
  { Icon: Bike, text: 'Send you delivery orders near you' },
  { Icon: Navigation, text: 'Guide you to the restaurant and the customer' },
  { Icon: MapPin, text: 'Show customers live tracking of the order you are carrying' },
  { Icon: PowerOff, text: 'Location sharing stops as soon as you go Offline' },
];

export function LocationDisclosureHost() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const finishRef = useRef(null);

  useEffect(() => {
    registerLocationDisclosureHost((finish) => {
      finishRef.current = finish;
      setOpen(true);
    });
    return () => registerLocationDisclosureHost(null);
  }, []);

  useEffect(() => {
    setLocationDisclosureShown(open);
  }, [open]);

  const close = (accepted) => {
    setOpen(false);
    const finish = finishRef.current;
    finishRef.current = null;
    finish?.(accepted);
  };

  const openPolicy = () => {
    close(false);
    navigateTo('/food/delivery/privacy');
  };

  return (
    <Modal visible={open} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close(false)}>
      <View style={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.iconWrap}>
            <MapPin size={40} color={dv.primary} />
          </View>
          <Text style={styles.title}>Allow location access</Text>
          <Text style={styles.body}>
            Hello Parth Delivery Partner collects your precise location data to enable order assignment, navigation and live
            order tracking,{' '}
            <Text style={styles.strong}>even when the app is closed or not in use</Text>, while you are Online.
          </Text>

          <View style={styles.points}>
            {POINTS.map(({ Icon, text }) => (
              <View key={text} style={styles.point}>
                <View style={styles.pointIcon}>
                  <Icon size={20} color={dv.primary} />
                </View>
                <Text style={styles.pointText}>{text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.note}>
            While you are Online, a "You are online" notification is shown. Your location is shared with the customer and
            restaurant only for the order you are delivering. On the next screen, Android will ask for location
            permission; choose "Allow all the time" so orders keep coming when your screen is off.
          </Text>
          <Text style={styles.link} onPress={openPolicy} suppressHighlighting>
            Read our Privacy Policy
          </Text>
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => close(true)}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => close(false)}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: dv.surface, paddingHorizontal: 24 },
  // centred on tall screens (no empty gap above the buttons); scrolls on small ones
  scroll: { flexGrow: 1, justifyContent: 'center', paddingBottom: 16 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: dv.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: dv.text, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 23, color: dv.muted, textAlign: 'center' },
  strong: { fontWeight: '800', color: dv.text },
  points: { marginTop: 24, gap: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: dv.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1, fontSize: 15, lineHeight: 21, color: dv.text, fontWeight: '600' },
  note: { marginTop: 24, fontSize: 13, lineHeight: 20, color: dv.muted },
  link: { marginTop: 12, fontSize: 14, color: dv.primary, fontWeight: '700', textDecorationLine: 'underline' },
  actions: { gap: 10, paddingTop: 12 },
  primaryBtn: { height: 52, borderRadius: 14, backgroundColor: dv.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: dv.muted, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
