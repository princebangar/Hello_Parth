import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AlertTriangle, Trash2 } from "lucide-react-native";
import { Dialog, Text, TextInput } from "@/native/ui";
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme";
import useBodyScrollLock from "@/shared/hooks/useBodyScrollLock.js";

/**
 * Shared "type DELETE to confirm" account-deletion dialog — same one Food's Settings page uses. Owns its own captcha
 * input state so callers only need `open` / `onClose` / `onConfirm` (called only once the user has typed "DELETE") /
 * `isDeleting`.
 */
export default function UserDeleteAccountDialog({
  open,
  onClose,
  onConfirm,
  isDeleting = false,
  warningText = "Your account will be Deleted. Admin will keep your historical records for revenue reporting.",
}) {
  const s = useStyles();
  const t = useTheme();
  const [captcha, setCaptcha] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!open) setCaptcha("");
  }, [open]);

  useBodyScrollLock(open);

  const canConfirm = captcha === "DELETE" && !isDeleting;

  return (
    <Dialog open={open} onClose={isDeleting ? undefined : onClose} dismissible={false} backdropOpacity={0.6} style={s.card}>
      <View style={s.head}>
        <View style={s.iconWrap}>
          <Trash2 size={28} color={t.dark ? colors.red[400] : colors.red[600]} />
        </View>
        <Text style={s.title}>Delete Your Account?</Text>
      </View>

      <Text style={s.text}>Are you sure you want to delete your account?</Text>

      <View style={s.warn}>
        <View style={s.warnHead}>
          <AlertTriangle size={16} color={t.dark ? colors.red[400] : colors.red[600]} />
          <Text style={s.warnTitle}>Warning</Text>
        </View>
        <Text style={s.warnText}>{warningText}</Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <TextInput
          placeholder="Type DELETE to confirm"
          placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
          value={captcha}
          onChangeText={(value) => setCaptcha(value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            s.input,
            captcha ? s.inputFilled : s.inputEmpty,
            focused && s.inputFocused,
          ]}
        />
      </View>

      <View style={s.row}>
        <Pressable onPress={onClose} disabled={isDeleting} style={[s.cancel, isDeleting && { opacity: 0.6 }]}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onConfirm} disabled={!canConfirm} style={[s.confirm, canConfirm ? s.confirmShadow : null]}>
          <Text style={s.confirmText}>{isDeleting ? "Deleting..." : "Delete Account"}</Text>
        </Pressable>
      </View>
    </Dialog>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    maxWidth: 384,
    padding: 24,
    borderRadius: 16,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100],
    ...shadow["2xl"],
  },
  head: { alignItems: "center", marginBottom: 16 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], textAlign: "center" },
  text: { fontSize: 14, lineHeight: 23, color: t.dark ? colors.gray[300] : colors.gray[600], marginBottom: 16, textAlign: "center" },
  warn: {
    marginBottom: 16,
    backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50],
    borderLeftWidth: 4,
    borderLeftColor: colors.red[500],
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    padding: 12,
  },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  warnTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: t.dark ? colors.red[400] : colors.red[700] },
  warnText: { fontSize: 12, lineHeight: 19.5, color: t.dark ? colors.red[300] : colors.red[700] },
  input: {
    width: "100%",
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    backgroundColor: "transparent",
    textAlign: "center",
    color: t.dark ? colors.white : colors.gray[900],
  },
  // tracking-widest + medium only for the typed text; the placeholder stays normal
  inputFilled: { fontWeight: "500", letterSpacing: 1.6 },
  inputEmpty: { fontWeight: "400" },
  inputFocused: { borderColor: colors.red[500] },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  cancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.dark ? colors.gray[600] : colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "600", color: t.dark ? colors.gray[200] : colors.gray[700] },
  confirm: { flex: 1, height: 48, borderRadius: 12, backgroundColor: "#FF3131", alignItems: "center", justifyContent: "center" },
  confirmShadow: { ...shadow.lg, shadowColor: colors.red[500], shadowOpacity: 0.2 },
  confirmText: { fontSize: 16, fontWeight: "600", color: colors.white },
}));
