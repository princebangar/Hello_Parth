import React, { useEffect, useRef, useState } from 'react'
import { Animated, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { AppImage, Text } from '@/native/ui'
import { alpha, fonts, useTheme } from '@/theme'
import { getFoodStyleLocationParts, getLocationSubtitle, readSharedFoodLocation, readTaxiLocation } from '@/shared/utils/sharedUserLocation'
import { getAppRoutePath } from '@/shared/utils/nativeShell'
import { useSwitcherPill } from '@/shared/utils/useSwitcherIndex'

const DEFAULT_AVATAR = require('../../assets/public/images/profile_avatar.webp')

/**
 * The real top of the Taxi / Food home - the person's saved location, the Taxi | Food switch and the icons, in the
 * app's own colours - shown while the rest of the screen is still loading (VerticalSwitchOverlay), so only the part
 * below the header is a skeleton. Copies shared/components/SuperAppHomeHeader.jsx. (The web also painted it from
 * index.html before any JavaScript arrived; the app has no such stage.)
 */
export const BOOT_SHELL_MAX_WIDTH = 767

export function getBootVertical(pathname = '') {
  const path = String(pathname || '').replace(/\/+$/, '')
  if (path === '/taxi/user') return 'taxi'
  if (path === '/food' || path === '/food/user' || path === '/food/user/home') return 'food'
  return ''
}

export function shouldShowBootShell() {
  if (typeof window === 'undefined') return ''
  if (!window.matchMedia(`(max-width: ${BOOT_SHELL_MAX_WIDTH}px)`).matches) return ''
  return getBootVertical(getAppRoutePath())
}

const readTitleAndSubtitle = () => {
  const food = readSharedFoodLocation()
  if (food && (food.area || food.address || food.formattedAddress)) {
    const parts = getFoodStyleLocationParts(food)
    return {
      title: parts.title || 'Select Location',
      subtitle: getLocationSubtitle({ address: food.address || food.formattedAddress, title: parts.title, state: parts.state, pincode: parts.pincode }),
    }
  }
  const taxi = readTaxiLocation()
  const address = String(taxi?.address || taxi?.area || '').trim()
  if (address) {
    const title = String(taxi.area || address.split(',')[0] || '').trim() || 'Select Location'
    return { title, subtitle: getLocationSubtitle({ address, title, state: taxi.state, pincode: taxi.pincode }) }
  }
  return { title: 'Select Location', subtitle: '' }
}

const THEME = {
  taxi: { bg: '#0B172A', pin: '#5B9BD5', activeTab: '#2563EB', height: 130, radius: 0 },
  food: { bg: '#9A1809', pin: '#FF6B7A', activeTab: '#FF5C72', height: 393, radius: 36 },
}

const icon = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' }
const HEADER_FONT = { fontFamily: fonts.outfit }

export function BootShellHeader({ vertical }) {
  const theme = THEME[vertical]
  const pill = useSwitcherPill(vertical)
  const insets = useSafeAreaInsets()
  const [tabsWidth, setTabsWidth] = useState(0)
  if (!theme) return null
  const { title, subtitle } = readTitleAndSubtitle()
  const pillWidth = Math.max(0, (tabsWidth - 10) / 2)
  const tabText = (id) => ({ ...HEADER_FONT, fontSize: 15, fontWeight: '700', color: id === vertical ? '#fff' : 'rgba(255,255,255,0.85)' })

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={{
          width: '100%',
          backgroundColor: theme.bg,
          height: theme.height + insets.top,
          paddingTop: insets.top,
          borderBottomLeftRadius: theme.radius,
          borderBottomRightRadius: theme.radius,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 8, height: 62 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <View style={{ padding: 6 }}>
              <Svg width={16} height={16} viewBox="0 0 24 24" strokeWidth={2} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)">
                <Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <Circle cx={12} cy={10} r={3} fill="none" />
              </Svg>
            </View>
            <View style={{ flexDirection: 'column', minWidth: 0, flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ ...HEADER_FONT, fontSize: 15, fontWeight: '900', lineHeight: 20, color: '#fff', flexShrink: 1 }}>{title}</Text>
                <Svg width={12} height={12} viewBox="0 0 24 24" strokeWidth={2} opacity={0.7} {...icon}>
                  <Path d="m6 9 6 6 6-6" />
                </Svg>
              </View>
              <Text numberOfLines={1} style={{ ...HEADER_FONT, fontSize: 10, fontWeight: '500', lineHeight: 12, marginTop: 2, color: 'rgba(255,255,255,0.8)', minHeight: 12 }}>{subtitle}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" strokeWidth={2} {...icon}>
              <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </Svg>
            <Svg width={26} height={26} viewBox="0 0 24 24" strokeWidth={2.2} {...icon}>
              <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
              <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
            </Svg>
            <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#fff', backgroundColor: '#FFF5E6', overflow: 'hidden' }}>
              <AppImage src={DEFAULT_AVATAR} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={0} />
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <View
            onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                left: 4,
                top: 4,
                bottom: 4,
                width: pillWidth,
                borderRadius: 999,
                backgroundColor: theme.activeTab,
                transform: [{ translateX: Animated.multiply(pill, pillWidth + 2) }],
              }}
            />
            <View style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={tabText('taxi')}>Taxi</Text>
            </View>
            <View style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={tabText('food')}>Food</Text>
            </View>
          </View>
        </View>
        {vertical === 'food' ? (
          <View style={{ paddingTop: 4, paddingHorizontal: 16 }}>
            <View style={{ height: 46, width: '76%', borderRadius: 16, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 }} />
          </View>
        ) : null}
      </View>
      {vertical === 'taxi' ? (
        <View
          style={{
            width: '100%',
            marginTop: -1,
            aspectRatio: 390 / 263,
            backgroundColor: theme.bg,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 10 },
            elevation: 6,
          }}
        />
      ) : null}
    </View>
  )
}

// index.html: @keyframes boot-pulse (opacity 1 -> 0.5 -> 1, 1.6 s)
function usePulse() {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return v
}

/**
 * The part under the header while the Taxi / Food home loads: the same shapes as the real screen (search bar and service
 * tiles for Taxi; categories, filters, offers and the first restaurant for Food) and the floating bottom bar. Same
 * sizes as index.html's ".bs-*" styles (light and dark).
 */
export function BootShellBody({ vertical }) {
  const t = useTheme()
  const opacity = usePulse()
  const insets = useSafeAreaInsets()
  const barBg = t.dark ? alpha('#ffffff', 0.1) : 'rgba(226,232,240,0.9)'
  const cardBg = t.dark ? '#141414' : '#fff'
  const cardShadow = t.dark ? null : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }

  const bar = (width, height, extra) => (
    <Animated.View style={[{ width, height, borderRadius: 999, backgroundColor: barBg, opacity }, extra]} />
  )
  const card = (style, children) => <View style={[{ backgroundColor: cardBg, borderRadius: 20 }, cardShadow, style]}>{children}</View>
  const row = (style, children) => <View style={[{ flexDirection: 'row', gap: 12, overflow: 'hidden' }, style]}>{children}</View>

  const bottomBar = (
    <View
      style={[
        {
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 25 + insets.bottom,
          height: 70,
          borderRadius: 35,
          backgroundColor: cardBg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 12,
          zIndex: 5,
        },
        t.dark ? null : { shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 30, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
      ]}
    >
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ alignItems: 'center', gap: 6 }}>
          {bar(22, 22)}
          {bar(34, 8)}
        </View>
      ))}
    </View>
  )

  if (vertical === 'taxi') {
    const tiles = [[88, 64], [80, 70], [96, 76], [84, 60]]
    return (
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 120 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {card({ marginTop: 16, height: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }, (
          <>
            {bar(36, 36)}
            {bar(170, 14)}
          </>
        ))}
        {bar(170, 18, { marginTop: 10, marginBottom: 12, borderRadius: 9 })}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14 }}>
          {tiles.map(([title, sub], i) => (
            <React.Fragment key={i}>
              {card({ flexGrow: 1, flexBasis: '40%', height: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 14 }, (
                <>
                  <View>
                    {bar(sub, 9)}
                    {bar(title, 16, { marginTop: 10 })}
                  </View>
                  {bar(56, 56, { borderRadius: 18 })}
                </>
              ))}
            </React.Fragment>
          ))}
        </View>
        {bar(90, 18, { marginTop: 23, marginBottom: 14, borderRadius: 9 })}
        {row(null, [0, 1, 2, 3].map((i) => <React.Fragment key={i}>{card({ width: 88, height: 98 })}</React.Fragment>))}
        {bottomBar}
      </View>
    )
  }

  if (vertical === 'food') {
    return (
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 120 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {row({ marginTop: 17, gap: 16, paddingLeft: 8 }, [0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 80 }}>
            {bar(80, 80)}
            {bar(48, 9, { marginTop: 12, alignSelf: 'center' })}
          </View>
        )))}
        {row({ marginTop: 20 }, [0, 1, 2, 3].map((i) => <React.Fragment key={i}>{bar(108, 37)}</React.Fragment>))}
        {bar(96, 9, { marginTop: 20, marginBottom: 17 })}
        {row(null, [0, 1, 2, 3].map((i) => <React.Fragment key={i}>{bar(88, 88, { borderRadius: 20 })}</React.Fragment>))}
        {bar(190, 9, { marginTop: 48, marginBottom: 12 })}
        {bar(220, 22, { borderRadius: 11 })}
        {bar('100%', 200, { marginTop: 25, borderRadius: 24 })}
        {bottomBar}
      </View>
    )
  }

  return null
}
