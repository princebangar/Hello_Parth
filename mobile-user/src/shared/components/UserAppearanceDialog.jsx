import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Moon, Sun, X } from "lucide-react-native";
import { Dialog, Text } from "@/native/ui";
import { alpha, brand, colors, makeStyles, shadow, useTheme } from "@/theme";
import { getFoodUserTheme, saveFoodUserTheme, THEME_CHANGE_EVENT } from "@/shared/utils/theme.js";
import useBodyScrollLock from "@/shared/hooks/useBodyScrollLock.js";

// global.css shadcn variables (light / dark) the web dialog is styled with
const vars = (dark) => ({
  card: dark ? "#171717" : colors.white,
  background: dark ? "#0a0a0a" : colors.white,
  foreground: dark ? "#fafafa" : brand.foreground,
  mutedForeground: dark ? "#a1a1a1" : brand.mutedForeground,
  border: dark ? alpha("#ffffff", 0.1) : brand.border,
});

export default function UserAppearanceDialog({ open, onOpenChange }) {
  const s = useStyles();
  const t = useTheme();
  const v = vars(t.dark);
  const [theme, setTheme] = useState(() => getFoodUserTheme());
  // Picking a theme should feel instant — no lingering backdrop while it fades out. (The native dialog's fade is
  // already short; the ref is kept from the web for the same intent.)
  const instantCloseRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    instantCloseRef.current = false;
    setTheme(getFoodUserTheme());
  }, [open]);

  useEffect(() => {
    const syncTheme = () => setTheme(getFoodUserTheme());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useBodyScrollLock(open);

  const selectTheme = (nextTheme) => {
    instantCloseRef.current = true;
    saveFoodUserTheme(nextTheme);
    setTheme(nextTheme);
    onOpenChange?.(false);
  };

  const options = [
    { id: "light", title: "Light", description: "Default light theme", icon: Sun, iconColor: colors.yellow[500] },
    { id: "dark", title: "Dark", description: "Dark theme", icon: Moon, iconColor: t.dark ? colors.slate[300] : colors.slate[500] },
  ];

  return (
    <Dialog open={open} onClose={() => onOpenChange?.(false)} backdropOpacity={0.7} style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Appearance</Text>
          <Text style={s.subtitle}>Same theme for Food and Taxi</Text>
        </View>
        <Pressable
          onPress={() => onOpenChange?.(false)}
          accessibilityLabel="Close"
          style={({ pressed }) => [s.close, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <X size={18} strokeWidth={2.5} color={v.mutedForeground} />
        </Pressable>
      </View>

      <View style={s.list}>
        {options.map(({ id, title, description, icon: Icon, iconColor }) => {
          const selected = theme === id;
          return (
            <Pressable key={id} onPress={() => selectTheme(id)} style={[s.option, selected ? s.optionOn : s.optionOff]}>
              <View style={[s.radio, selected ? s.radioOn : s.radioOff]}>
                {selected && <Check size={12} color={colors.white} />}
              </View>
              <Icon size={20} color={iconColor} />
              <View>
                <Text style={s.optTitle}>{title}</Text>
                <Text style={s.optDesc}>{description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

const useStyles = makeStyles((t) => {
  const v = vars(t.dark);
  return {
    card: { maxWidth: 448, borderRadius: 28, borderWidth: 1, borderColor: v.border, backgroundColor: v.card, ...shadow["2xl"] },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: v.border,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    title: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: v.foreground },
    subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, color: v.mutedForeground },
    close: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: v.border,
      backgroundColor: v.background,
      alignItems: "center",
      justifyContent: "center",
    },
    list: { gap: 8, paddingHorizontal: 20, paddingVertical: 20 },
    option: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", borderRadius: 16, borderWidth: 2, padding: 12 },
    optionOn: { borderColor: "#DC2626", backgroundColor: t.dark ? alpha("#7F1D1D", 0.2) : "#fdfafc" },
    optionOff: { borderColor: v.border, backgroundColor: v.background },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: "#DC2626", backgroundColor: "#DC2626" },
    radioOff: { borderColor: v.border },
    optTitle: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: v.foreground },
    optDesc: { fontSize: 12, lineHeight: 16, color: v.mutedForeground },
  };
});
