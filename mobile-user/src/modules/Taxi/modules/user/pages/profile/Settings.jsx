// Web: modules/Taxi/modules/user/pages/profile/Settings.jsx — Settings hub (Edit Profile + Delete Account rows), same
// shape as Food's. Inside the Taxi scope index.css remaps gray text / bg-white to the --user-* palette (!important),
// which is what the web shows, so the same tokens are used here.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, User, Trash2 } from 'lucide-react-native';
import { Link, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { userAuthService, clearLocalUserSession } from '../../services/authService';
import { clearCurrentRide } from '../../services/currentRideService';
import { socketService } from '../../../../shared/api/socket';
import UserDeleteAccountDialog from '@/shared/components/UserDeleteAccountDialog.jsx';
import { preloadAuthApp } from '@/shared/utils/preloadLogin.js';
import { hideLogoutCover, hideLogoutCoverWhenLoginShown, showLogoutCover } from '@/shared/utils/logoutTransition.js';
import { useUserPalette } from '../../../../shared/context/UserThemeContext';

const BACK_SHADOW = { elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } };

/** Settings hub — same shape and colours as Food's (Edit Profile + Delete Account rows). */
export default function Settings() {
  const navigate = useNavigate();
  const P = useUserPalette();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await userAuthService.requestAccountDeletion('Requested via account settings');
      showLogoutCover();
      await preloadAuthApp();
      clearCurrentRide();
      socketService.disconnect();
      clearLocalUserSession();
      navigate('/login', { replace: true });
      hideLogoutCoverWhenLoginShown();
    } catch {
      hideLogoutCover();
      setIsDeleting(false);
    }
  };

  const rowBorder = { borderBottomColor: P.dark ? alpha(colors.gray[800], 0.8) : alpha(colors.gray[200], 0.8) };

  return (
    <Screen bg={P.bg} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [
              styles.back,
              BACK_SHADOW,
              { backgroundColor: P.cardBg, borderColor: P.dark ? alpha('#ffffff', 0.1) : alpha('#000000', 0.1) },
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
          >
            <ArrowLeft size={24} color={P.textPrimary} />
          </Pressable>
          <View>
            <Text style={[styles.title, { color: P.textPrimary }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: P.textSecondary }]}>Profile and account settings</Text>
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <Link to="/taxi/user/profile/edit" style={[styles.item, rowBorder]}>
            <View style={styles.itemRow}>
              <User size={20} color={P.textMuted} />
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: P.textPrimary }]}>Edit Profile</Text>
                <Text numberOfLines={1} style={[styles.itemSub, { color: P.textMuted }]}>
                  Change your name, description and profile photo
                </Text>
              </View>
            </View>
          </Link>

          <Pressable onPress={() => setDeleteAccountOpen(true)} style={[styles.item, rowBorder]}>
            <View style={styles.itemRow}>
              <Trash2 size={20} color="#FF3131" />
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: P.textPrimary }]}>Delete Account</Text>
                <Text numberOfLines={1} style={[styles.itemSub, { color: P.textMuted }]}>
                  Tap to delete your account
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <UserDeleteAccountDialog
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={handleDeleteAccount}
        isDeleting={isDeleting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 80 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
  back: { height: 44, width: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, lineHeight: 22, fontWeight: '600', letterSpacing: -0.55 },
  subtitle: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  item: { borderBottomWidth: 1, paddingVertical: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  itemSub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
