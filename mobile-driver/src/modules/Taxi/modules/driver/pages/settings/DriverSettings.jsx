// Web: modules/Taxi/modules/driver/pages/settings/DriverSettings.jsx — settings hub for the taxi driver and the owner:
// Edit Profile and Delete Account rows, same shape as the Food user's Settings page.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2, User } from 'lucide-react-native';
import { Link, useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';

/** Settings hub for taxi driver + owner: Edit Profile and Delete Account rows, same shape as the Food user's
 *  Settings page (blue on hover instead of Food's red). */
const DriverSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  return (
    <Screen bg={colors.white} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/profile`)}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <ArrowLeft size={24} color={colors.black} />
          </Pressable>
          <View>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Profile and account settings</Text>
          </View>
        </View>

        <View style={styles.list}>
          <Link to={`${routePrefix}/edit-profile`} style={styles.item}>
            <View style={styles.itemRow}>
              <User size={20} color={colors.gray[500]} />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>Edit Profile</Text>
                <Text numberOfLines={1} style={styles.itemSub}>Change your name, phone, email and profile photo</Text>
              </View>
            </View>
          </Link>

          <Link to={`${routePrefix}/delete-account`} style={styles.item}>
            <View style={styles.itemRow}>
              <Trash2 size={20} color="#FF3131" />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>Delete Account</Text>
                <Text numberOfLines={1} style={styles.itemSub}>Tap to delete your account</Text>
              </View>
            </View>
          </Link>
        </View>
      </ScrollView>
    </Screen>
  );
};

export default DriverSettings;

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 448, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24 },
  head: { marginBottom: 32, flexDirection: 'row', alignItems: 'center', gap: 16 },
  back: {
    height: 44,
    width: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.1),
    backgroundColor: alpha(colors.white, 0.7),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { transform: [{ scale: 0.95 }] },
  title: { fontSize: 22, lineHeight: 22, fontWeight: '700', letterSpacing: -0.55, color: colors.gray[900] },
  subtitle: { marginTop: 4, fontSize: 12, lineHeight: 16, color: colors.gray[400] },
  list: { marginTop: 24 },
  item: { borderBottomWidth: 1, borderBottomColor: alpha(colors.gray[200], 0.8), paddingVertical: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.gray[900] },
  itemSub: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.gray[500] },
});
