// Web: modules/Food/pages/user/profile/Settings.jsx — Edit Profile link + Delete Account (DELETE confirm dialog).
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Trash2, User } from "lucide-react-native";
import { useNavigate } from "@/lib/router";
import { toast } from "@/lib/toast";
import { Text } from "@/native/ui";
import { alpha, colors, makeStyles, sp, useTheme } from "@/theme";
import { authAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import { showAccountDeletedToast } from "@/shared/utils/customToasts";
import AnimatedPage from "@food/components/user/AnimatedPage";
import UserDeleteAccountDialog from "@/shared/components/UserDeleteAccountDialog.jsx";

export default function Settings() {
  const navigate = useNavigate();
  const s = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await authAPI.deleteAccount("user");

      showAccountDeletedToast();

      // Clear user module authentication data
      clearModuleAuth("user");

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event("userAuthChanged"));

      // Navigate to sign in page
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
      setDeleteAccountOpen(false);
    }
  };

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(6), paddingBottom: insets.bottom + sp(20) }]}>
        {/* Header: Back Arrow & Title */}
        <View style={s.header}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [s.backButton, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={t.dark ? colors.white : colors.black} />
          </Pressable>
          <View>
            <Text style={s.title}>Settings</Text>
            <Text style={s.subtitle}>Profile and account settings</Text>
          </View>
        </View>

        {/* Settings List */}
        <View style={{ marginTop: sp(6) }}>
          {/* Edit Profile */}
          <Pressable onPress={() => navigate("/food/user/profile/edit")} style={s.item}>
            {({ pressed }) => (
              <View style={s.itemRow}>
                <User size={20} color={pressed ? colors.red[500] : t.dark ? colors.gray[400] : colors.gray[500]} />
                <View style={s.itemText}>
                  <Text style={[s.itemTitle, pressed && { color: colors.red[500] }]}>Edit Profile</Text>
                  <Text style={s.itemSub} numberOfLines={1}>
                    Change your name, description and profile photo
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Delete Account */}
          <Pressable onPress={() => setDeleteAccountOpen(true)} style={s.item}>
            {({ pressed }) => (
              <View style={s.itemRow}>
                <Trash2 size={20} color="#FF3131" />
                <View style={s.itemText}>
                  <Text style={[s.itemTitle, pressed && { color: colors.red[500] }]}>Delete Account</Text>
                  <Text style={s.itemSub} numberOfLines={1}>
                    Tap to delete your account
                  </Text>
                </View>
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <UserDeleteAccountDialog
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={handleDeleteAccount}
        isDeleting={isDeleting}
      />
    </AnimatedPage>
  );
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  content: { paddingHorizontal: sp(6) },
  header: { flexDirection: "row", alignItems: "center", gap: sp(4), marginBottom: sp(8) },
  backButton: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.dark ? alpha("#1a1a1a", 0.7) : alpha(colors.white, 0.7),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.white, 0.1) : alpha(colors.black, 0.1),
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: 22, lineHeight: 22, fontWeight: "700", letterSpacing: -0.5, color: t.dark ? colors.white : colors.gray[900] },
  subtitle: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[500] : colors.gray[400], marginTop: sp(1) },
  item: { borderBottomWidth: 1, borderBottomColor: t.dark ? alpha(colors.gray[800], 0.8) : alpha(colors.gray[200], 0.8), paddingVertical: sp(4) },
  itemRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  itemSub: { fontSize: 13, lineHeight: 18, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 2 },
}));
