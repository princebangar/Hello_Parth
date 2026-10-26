import React from "react"
import { Pressable, View } from "react-native"
import { Camera, Upload, X } from "lucide-react-native"
import { Dialog, Text } from "@/native/ui"
import { alpha, brand, colors, makeStyles, shadow } from "@/theme"
import { openCamera, openGallery } from "@food/utils/imageUploadUtils"

/**
 * ImageSourcePicker component to choose between Camera and Gallery.
 * Shows a dialog in-app and hands the picked photo (a { uri, name, type } file from the native picker) to onFileSelect.
 * The web also kept a hidden <input type="file"> as the gallery fallback for browsers; the native picker needs none,
 * so `galleryInputRef` is accepted and passed on unchanged.
 */
export const ImageSourcePicker = ({
  isOpen,
  onClose,
  onFileSelect,
  title = "Update photo",
  description = "Choose how you want to upload your photo.",
  fileNamePrefix = "upload",
  galleryInputRef = null,
  // Gallery may return several images; onFileSelect is called once per image.
  multiple = false,
}) => {
  const s = useStyles()

  const handleOpenCamera = async () => {
    try {
      onClose()
      await openCamera({
        onSelectFile: onFileSelect,
        fileNamePrefix: fileNamePrefix,
      })
    } catch (error) {
      console.error("Camera error caught in ImageSourcePicker:", error)
      // Silently fail - toast already shown in openCamera function
    }
  }

  const handlePickFromDevice = async () => {
    try {
      onClose()
      await openGallery({
        onSelectFile: onFileSelect,
        fileNamePrefix,
        fallbackInputRef: galleryInputRef,
        multiple,
      })
    } catch (error) {
      console.error("Gallery error caught in ImageSourcePicker:", error)
      // Silently fail - toast already shown if needed
    }
  }

  return (
    <Dialog open={Boolean(isOpen)} onClose={onClose} backdropOpacity={0.4} style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.description}>{description}</Text>
      </View>
      <View style={s.list}>
        <Pressable onPress={handleOpenCamera} style={({ pressed }) => [s.option, pressed && s.pressed]}>
          <Text style={s.optionText}>Use Camera</Text>
          <View style={[s.optionIcon, { backgroundColor: colors.orange[50] }]}>
            <Camera size={20} color={colors.orange[600]} />
          </View>
        </Pressable>
        <Pressable onPress={handlePickFromDevice} style={({ pressed }) => [s.option, pressed && s.pressed]}>
          <Text style={s.optionText}>Upload from Device</Text>
          <View style={[s.optionIcon, { backgroundColor: colors.blue[50] }]}>
            <Upload size={20} color={colors.blue[600]} />
          </View>
        </Pressable>
      </View>
      {/* DialogContent's close button (absolute right-5 top-5) */}
      <Pressable onPress={onClose} accessibilityLabel="Close" style={s.close}>
        <X size={20} strokeWidth={2.5} color={colors.gray[500]} />
      </Pressable>
    </Dialog>
  )
}

// The picker's own classes are light (white buttons, gray-900 text); the dialog frame follows the theme (bg-card).
const useStyles = makeStyles((t) => ({
  card: {
    maxWidth: 384,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.dark ? alpha("#ffffff", 0.1) : brand.border,
    backgroundColor: t.dark ? "#171717" : colors.white,
    ...shadow["2xl"],
  },
  header: { padding: 20, paddingBottom: 12, gap: 8, paddingRight: 64 },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: colors.gray[900] },
  description: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  list: { gap: 8, paddingHorizontal: 20, paddingBottom: 20 },
  option: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: { transform: [{ scale: 0.98 }] },
  optionText: { fontWeight: "500", fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  optionIcon: { padding: 8, borderRadius: 8 },
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
