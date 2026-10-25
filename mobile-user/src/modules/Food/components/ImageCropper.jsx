import React, { useMemo } from "react"
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native"
import { X } from "lucide-react-native"
import { AppImage, Dialog, Text } from "@/native/ui"
import { alpha, brand, colors, makeStyles, shadow, useTheme } from "@/theme"

/**
 * Round "Crop Profile Photo" dialog.
 *
 * The web cut the circle out of the photo with react-easy-crop + a <canvas>. The app has no canvas and no image
 * manipulation module installed (expo-image-manipulator is not in package.json), so the picture is shown in the same
 * round frame and Save hands back the picked file as it is (its name gets the web's "-cropped" suffix). The system
 * picker can crop while picking (pickImage({ allowsEditing: true, aspect: [1, 1] }) in src/lib/media.js).
 * No screen of the user app opens this dialog.
 */
export function ImageCropper({ isOpen, onClose, imageFile, onCropComplete }) {
  const s = useStyles()
  const t = useTheme()
  const { width } = useWindowDimensions()
  const imageSrc = useMemo(() => (imageFile?.uri ? { uri: imageFile.uri } : null), [imageFile])
  const frame = Math.min(width - 32, 448) - 48

  const handleSave = async () => {
    try {
      if (!imageFile) return
      const base = imageFile.name ? imageFile.name.replace(/\.[^/.]+$/, "") : "cropped-image"
      const ext = String(imageFile.name || "").match(/\.[^/.]+$/)?.[0] || ".jpg"
      onCropComplete({ ...imageFile, name: imageFile.name ? `${base}-cropped${ext}` : `cropped-image${ext}` })
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Dialog open={Boolean(isOpen)} onClose={onClose} backdropOpacity={0.4} style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>Crop Profile Photo</Text>
      </View>
      <View style={s.stage}>
        {imageSrc ? (
          <>
            <AppImage src={imageSrc} style={StyleSheet.absoluteFill} contentFit="contain" />
            {/* round crop area over a dimmed picture, like react-easy-crop's cropShape="round" */}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]}>
              <View
                style={{
                  width: frame,
                  height: frame,
                  borderRadius: frame / 2,
                  borderWidth: 1,
                  borderColor: alpha("#ffffff", 0.5),
                  shadowColor: "#000",
                  shadowOpacity: 0.5,
                  shadowRadius: 0,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
            </View>
          </>
        ) : null}
      </View>
      <View style={s.footer}>
        <Pressable onPress={onClose} style={s.outline}>
          <Text style={s.outlineText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={({ pressed }) => [s.save, pressed && { backgroundColor: "#991B1B" }]}>
          <Text style={s.saveText}>Save</Text>
        </Pressable>
      </View>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={s.close}>
        <X size={20} strokeWidth={2.5} color={t.dark ? colors.gray[300] : colors.gray[500]} />
      </Pressable>
    </Dialog>
  )
}

const useStyles = makeStyles((t) => ({
  card: {
    maxWidth: 448,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.dark ? alpha("#ffffff", 0.1) : brand.border,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    ...shadow["2xl"],
  },
  header: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100] },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  stage: { width: "100%", height: 350, backgroundColor: colors.black, overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  footer: { padding: 16, backgroundColor: t.dark ? "#1a1a1a" : colors.white, flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  outline: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.dark ? alpha("#ffffff", 0.1) : brand.border,
    backgroundColor: t.dark ? "#0a0a0a" : colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontSize: 14, fontWeight: "500", color: t.dark ? "#fafafa" : brand.foreground },
  save: { height: 36, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  saveText: { fontSize: 14, fontWeight: "500", color: colors.white },
  close: {
    position: "absolute",
    right: 20,
    top: 20,
    borderRadius: 999,
    padding: 8,
    backgroundColor: t.dark ? alpha(colors.gray[800], 0.8) : colors.gray[50],
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.gray[700], 0.5) : alpha(colors.gray[200], 0.6),
  },
}))
