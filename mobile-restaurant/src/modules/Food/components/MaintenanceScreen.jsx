import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { AppImage, Text } from "@/native/ui";
import { alpha, colors, shadow } from "@/theme";

// The artwork of public/maintenance/ (the web's index.html painted the same screen on a refresh), bundled in the app.
const maintenanceArt = require("../../../assets/public/maintenance/maintenance-art.png");
const maintenancePattern = require("../../../assets/public/maintenance/maintenance-pattern.jpg");
const ICONS = {
  cloche: require("../../../assets/public/maintenance/maintenance-icon-experience.png"),
  "food-taxi": require("../../../assets/public/maintenance/maintenance-icon-food-taxi.png"),
  rocket: require("../../../assets/public/maintenance/maintenance-icon-rocket.png"),
  gift: require("../../../assets/public/maintenance/maintenance-icon-gift.png"),
};
const ART_RATIO = 764 / 608;
const PATTERN_RATIO = 1024 / 400;

/**
 * Full-screen Under Maintenance UI, shared by the Food screen (Food admin switch) and the all-apps screen (Global
 * admin switch). Same design for both; only the three points differ — they come in through `content`.
 * Title / subtitle are part of the board artwork; the points and footer are real text so they can be edited.
 * (The web also set document.title and removed index.html's boot copy of this screen; neither exists in the app.)
 */
export default function MaintenanceScreen({ content, onBack, backLabel = "Back" }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [contentH, setContentH] = useState(screenH);
  // background-size: 100% auto; background-repeat: repeat-y
  const tileH = screenW / PATTERN_RATIO;
  const tiles = Math.ceil(Math.max(contentH, screenH) / tileH) + 1;

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ flexGrow: 1 }}
        onContentSizeChange={(_, h) => setContentH(h)}
      >
        <View pointerEvents="none" style={styles.patternCol}>
          {Array.from({ length: tiles }, (_, i) => (
            <AppImage key={i} src={maintenancePattern} style={{ width: screenW, height: tileH }} contentFit="fill" transition={0} />
          ))}
        </View>

        <View style={[styles.inner, { paddingTop: 40 + insets.top, paddingBottom: 32 + insets.bottom, minHeight: screenH }]}>
          <AppImage
            src={maintenanceArt}
            accessibilityLabel="We're Under Maintenance"
            style={{ width: "100%", aspectRatio: ART_RATIO, alignSelf: "center" }}
            contentFit="contain"
            transition={0}
          />

          <View style={{ marginTop: 24, paddingHorizontal: 4 }}>
            {content.features.map((feature, index) => (
              <View
                key={feature.id}
                style={[styles.feature, index < content.features.length - 1 ? styles.featureDivider : null]}
              >
                <AppImage src={ICONS[feature.icon]} style={styles.featureIcon} contentFit="contain" transition={0} />
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {content.footer ? <Text style={styles.footer}>{content.footer}</Text> : null}
        </View>
      </ScrollView>

      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityLabel={backLabel}
          style={({ pressed }) => [styles.back, { top: 16 + insets.top }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <ArrowLeft size={20} color={colors.neutral[800]} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFill, zIndex: 2000000, elevation: 100, backgroundColor: "#FDF6ED" },
  patternCol: { position: "absolute", top: 0, left: 0, right: 0 },
  inner: { width: "100%", maxWidth: 480, alignSelf: "center", justifyContent: "center", paddingHorizontal: 20 },
  feature: { flexDirection: "row", alignItems: "center", gap: 20, paddingVertical: 16 },
  // border-b-2 border-dashed border-[#F3C9A0]
  featureDivider: { borderBottomWidth: 2, borderStyle: "dashed", borderColor: "#F3C9A0" },
  featureIcon: { width: 84, height: 84, flexShrink: 0 },
  featureTitle: { fontSize: 22, lineHeight: 27.5, fontWeight: "700", letterSpacing: -0.55, color: "#3A2312" },
  featureBody: { marginTop: 4, fontSize: 16, lineHeight: 22, fontWeight: "500", color: alpha("#3A2312", 0.85) },
  footer: { marginTop: 12, textAlign: "center", fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#C2570C" },
  back: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha("#ffffff", 0.9),
    borderWidth: 1,
    borderColor: alpha("#000000", 0.05),
    ...shadow.md,
  },
});
