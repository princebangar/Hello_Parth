import React from "react"
import { StyleSheet, View } from "react-native"
import { Spin } from "@/shared/components/Loader"
import { alpha, colors, makeStyles } from "@/theme"

export default function Loader() {
  const s = useStyles()
  return (
    <View style={s.page} accessibilityRole="progressbar">
      <View style={{ width: 48, height: 48 }}>
        <View style={s.track} />
        <Spin style={StyleSheet.absoluteFill}>
          <View style={s.arc} />
        </Spin>
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  page: { ...StyleSheet.absoluteFill, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  track: { ...StyleSheet.absoluteFill, borderWidth: 4, borderRadius: 24, borderColor: alpha("#DC2626", 0.1) },
  arc: { width: 48, height: 48, borderRadius: 24, borderWidth: 4, borderColor: "transparent", borderTopColor: "#DC2626" },
}))
