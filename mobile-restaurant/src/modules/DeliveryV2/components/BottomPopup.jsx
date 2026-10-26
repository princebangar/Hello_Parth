import React, { useEffect, useMemo, useRef, useState } from "react"
import { Animated, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from "react-native"
import { ChevronDown } from "lucide-react-native"
import { KeyboardAwareScrollView, Sheet, Text } from "@/native/ui"
import { colors, fonts, shadow } from "@/theme"
import useCloseOnBack from "@/modules/DeliveryV2/hooks/useCloseOnBack"

// "86vh" / "70%" / 500 -> px
const toPx = (value, screenH) => {
  if (typeof value === "number") return value
  const s = String(value || "").trim()
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return screenH * 0.86
  if (s.endsWith("vh") || s.endsWith("%")) return (screenH * n) / 100
  return n
}

/**
 * BottomPopup Component
 * A reusable animated bottom popup that can be dismissed by swiping down
 * (native: a bottom Sheet (Modal); the top 80px — handle + header — can be dragged down, > 100px closes it)
 *
 * @param {boolean} isOpen - Controls popup visibility
 * @param {function} onClose - Callback when popup is closed
 * @param {ReactNode} children - Content to display in popup
 * @param {string} title - Optional title for the popup
 * @param {boolean} showCloseButton - Show close button (default: true)
 * @param {boolean} closeOnBackdropClick - Close when backdrop is clicked (default: true)
 * @param {string} maxHeight - Maximum height of popup (default: "86vh")
 * @param {boolean} showHandle - Show drag handle (default: true)
 * @param {boolean} disableSwipeToClose - Disable swipe-to-close functionality (default: false)
 * @param {boolean} showBackdrop - Show backdrop overlay (default: true)
 * @param {boolean} backdropBlocksInteraction - Whether backdrop blocks pointer events (default: true)
 */
export default function BottomPopup({
  isOpen,
  onClose,
  children,
  title,
  showCloseButton = true,
  closeOnBackdropClick = true,
  maxHeight = "86vh",
  showHandle = true,
  disableSwipeToClose = false,
  collapsedContent = null, // Content to show when collapsed (e.g., Reached pickup button)
  showBackdrop = true, // Show backdrop overlay
  backdropBlocksInteraction = true, // Whether backdrop blocks pointer events
  closeOnHandleClick = false, // Close instead of collapse when handle is clicked
  closeOnBack = false // Device/browser Back closes only this sheet
}) {
  const { height: screenH } = useWindowDimensions()
  const dragY = useRef(new Animated.Value(0)).current
  const [isCollapsed, setIsCollapsed] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Reset drag state when popup closes
  useEffect(() => {
    if (!isOpen) {
      dragY.setValue(0)
      setIsCollapsed(false)
    }
  }, [isOpen, dragY])

  // Handle collapse toggle
  const handleCollapseToggle = () => {
    setIsCollapsed(prev => !prev)
  }

  // Close handler
  const handleClose = () => {
    dragY.setValue(0)
    onCloseRef.current?.()
  }
  const handleCloseRef = useRef(handleClose)
  handleCloseRef.current = handleClose

  // Swipe down on the top area (handle / header)
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !disableSwipeToClose && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) dragY.setValue(g.dy)
        },
        onPanResponderRelease: (_, g) => {
          const threshold = 100 // Minimum swipe distance to close
          if (g.dy > threshold) {
            handleCloseRef.current()
          } else {
            Animated.spring(dragY, { toValue: 0, damping: 30, stiffness: 300, useNativeDriver: true }).start()
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, { toValue: 0, damping: 30, stiffness: 300, useNativeDriver: true }).start()
        },
      }),
    [disableSwipeToClose, dragY],
  )

  useCloseOnBack(closeOnBack && isOpen, handleClose)

  const max = isCollapsed ? 120 : toPx(maxHeight, screenH)

  return (
    <Sheet
      open={Boolean(isOpen)}
      onClose={handleClose}
      dismissible={closeOnBackdropClick && showBackdrop && backdropBlocksInteraction}
      backdropOpacity={showBackdrop ? 0.5 : 0}
      style={styles.sheet}
    >
      <Animated.View style={[styles.popup, { maxHeight: max, transform: [{ translateY: dragY }] }]}>
        <View {...pan.panHandlers}>
          {/* Top Drag Handle Bar - Always visible for dragging */}
          {showHandle ? (
            <Pressable
              onPress={() => {
                if (closeOnHandleClick) {
                  handleClose()
                } else {
                  handleCollapseToggle()
                }
              }}
              style={styles.handle}
            >
              {!closeOnHandleClick ? <ChevronDown size={24} color={colors.gray[400]} style={{ marginBottom: 4 }} /> : null}
              <View style={styles.handleBar} />
            </Pressable>
          ) : null}

          {/* Header */}
          {title || showCloseButton ? (
            <View style={[styles.header, !showHandle && { paddingTop: 20 }]}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {showCloseButton ? (
                <Pressable
                  onPress={handleClose}
                  style={({ pressed }) => [styles.closeBtn, pressed && { backgroundColor: colors.gray[100] }]}
                  accessibilityLabel="Close"
                >
                  <ChevronDown size={24} color={colors.gray[600]} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Content */}
        {!isCollapsed ? (
          <KeyboardAwareScrollView style={styles.contentScroll} contentContainerStyle={styles.content} nestedScrollEnabled>
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <View style={[styles.content, { paddingBottom: 20 }]}>
            {collapsedContent}
          </View>
        )}
      </Animated.View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.white, ...shadow["2xl"] },
  popup: { backgroundColor: colors.white, overflow: "hidden", flexDirection: "column" },
  handle: { alignItems: "center", paddingTop: 12, paddingBottom: 8, width: "100%", backgroundColor: "transparent" },
  handleBar: { width: 48, height: 6, backgroundColor: colors.gray[300], borderRadius: 9999 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  title: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: "600", color: colors.gray[900], letterSpacing: 0.18, flexShrink: 1 },
  closeBtn: { marginLeft: "auto", padding: 8, borderRadius: 9999 },
  contentScroll: { flexGrow: 0 },
  content: { paddingHorizontal: 12, paddingVertical: 12 },
})
