/**
 * Loading placeholder for the Taxi customer screens (Rides, Profile, Support, Wallet, Bus, ride steps ...), shaped like
 * the screen that is opening.
 *
 * On the web the drawing lived in index.html (window.__taxiPageSkeleton, the .tp-* styles) so the first paint, this
 * placeholder and the screen's own loading state were one skeleton. Here the same shapes and sizes are drawn natively.
 */
import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { alpha, makeStyles, useTheme } from '@/theme'

// index.html: @keyframes boot-pulse (1 -> 0.5 -> 1 over 1.6 s, ease-in-out)
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

const PulseContext = React.createContext(null)

/** .tp-b: one pulsing bar */
function B({ w, h, style }) {
  const t = useTheme()
  const opacity = React.useContext(PulseContext)
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: 999, backgroundColor: t.dark ? alpha('#ffffff', 0.1) : 'rgba(226,232,240,0.9)', opacity },
        style,
      ]}
    />
  )
}

function Card({ children, style }) {
  const s = useStyles()
  return <View style={[s.card, style]}>{children}</View>
}

const Row = ({ children, style }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>{children}</View>
const Col = ({ children, style }) => <View style={[{ flex: 1, minWidth: 0 }, style]}>{children}</View>
const Stack = ({ children, style }) => <View style={[{ gap: 12, padding: 16 }, style]}>{children}</View>
const repeat = (n, fn) => Array.from({ length: n }, (_, i) => <React.Fragment key={i}>{fn(i)}</React.Fragment>)

function Top({ sub, style }) {
  const s = useStyles()
  return (
    <View style={[s.top, style]}>
      <B w={24} h={24} style={{ marginTop: 2 }} />
      <Col>
        {sub ? <B w={84} h={10} style={{ marginBottom: 8 }} /> : null}
        <B w={170} h={22} style={{ borderRadius: 8 }} />
        {sub ? <B w={220} h={10} style={{ marginTop: 9 }} /> : null}
      </Col>
    </View>
  )
}

const ListItem = () => (
  <Card style={{ padding: 16 }}>
    <Row>
      <B w={48} h={48} style={{ borderRadius: 16 }} />
      <Col>
        <B w="60%" h={14} />
        <B w="82%" h={10} style={{ marginTop: 9 }} />
        <B w="42%" h={10} style={{ marginTop: 9 }} />
      </Col>
      <B w={54} h={22} />
    </Row>
  </Card>
)

function Rows({ n }) {
  const s = useStyles()
  return (
    <Card style={{ overflow: 'hidden' }}>
      {repeat(n, (i) => (
        <Row style={[{ paddingVertical: 14, paddingHorizontal: 16 }, i ? s.divider : null]}>
          <B w={38} h={38} style={{ borderRadius: 12 }} />
          <Col>
            <B w="46%" h={13} />
            <B w="64%" h={9} style={{ marginTop: 8 }} />
          </Col>
          <B w={8} h={14} style={{ borderRadius: 4 }} />
        </Row>
      ))}
    </Card>
  )
}

const OptionCard = () => (
  <Card style={{ padding: 16 }}>
    <Row>
      <B w={44} h={44} style={{ borderRadius: 14 }} />
      <Col>
        <B w="40%" h={14} />
        <B w="58%" h={10} style={{ marginTop: 8 }} />
      </Col>
      <B w={8} h={14} style={{ borderRadius: 4 }} />
    </Row>
  </Card>
)

const Label = ({ w }) => <B w={w} h={10} style={{ marginTop: 8, marginLeft: 4 }} />

function Chips() {
  const s = useStyles()
  const widths = [56, 64, 76, 48, 72]
  return (
    <View style={s.chips}>
      <View style={s.chipsIn}>
        {widths.map((w, i) => (
          <B key={i} w={w} h={34} style={i ? null : { backgroundColor: 'rgba(250,204,21,0.55)' }} />
        ))}
      </View>
    </View>
  )
}

function Stats({ center }) {
  const s = useStyles()
  return (
    <Row style={[{ marginTop: 18, paddingTop: 16 }, s.divider]}>
      {repeat(3, () => (
        <Col style={center ? { alignItems: 'center' } : null}>
          <B w={center ? 46 : 40} h={9} />
          <B w={center ? 30 : 28} h={16} style={{ marginTop: 9 }} />
        </Col>
      ))}
    </Row>
  )
}

const PAGES = {
  activity: () => (
    <>
      <Top sub />
      <Chips />
      <Stack>{repeat(4, () => <ListItem />)}</Stack>
    </>
  ),
  // just the list - the Rides screen's own "loading your trips" state, under its real header and filters
  'activity-list': () => <Stack style={{ padding: 0 }}>{repeat(4, () => <ListItem />)}</Stack>,
  profile: () => (
    <>
      <ProfileTop />
      <Stack>
        <Card style={{ padding: 18 }}>
          <Row>
            <B w={64} h={64} style={{ borderRadius: 20 }} />
            <Col>
              <B w={130} h={18} />
              <B w={120} h={10} style={{ marginTop: 9 }} />
              <B w={70} h={10} style={{ marginTop: 9 }} />
            </Col>
          </Row>
          <Stats center />
        </Card>
        <Rows n={3} />
        <Label w={80} />
        <Rows n={3} />
      </Stack>
    </>
  ),
  support: () => (
    <>
      <Top sub />
      <Stack>
        {repeat(3, () => <OptionCard />)}
        <Label w={110} />
        <Rows n={4} />
      </Stack>
    </>
  ),
  wallet: () => (
    <>
      <Top />
      <Stack>
        <Card style={{ padding: 18 }}>
          <B w={96} h={10} />
          <B w={120} h={30} style={{ marginTop: 10, borderRadius: 10 }} />
          <B w="100%" h={44} style={{ marginTop: 22, borderRadius: 14 }} />
        </Card>
        <Card style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
          <Row>
            <B w={40} h={40} style={{ borderRadius: 12 }} />
            <Col>
              <B w="40%" h={13} />
              <B w="70%" h={9} style={{ marginTop: 8 }} />
            </Col>
          </Row>
        </Card>
        <Label w={130} />
        <Rows n={3} />
      </Stack>
    </>
  ),
  bus: () => (
    <>
      <Top sub />
      <Stack>
        <Card style={{ padding: 18 }}>
          <Row>
            <Col>
              <B w="55%" h={18} />
              <B w="80%" h={10} style={{ marginTop: 10 }} />
            </Col>
            <B w={44} h={44} style={{ borderRadius: 14 }} />
          </Row>
          <Stats />
        </Card>
        <Card style={{ padding: 18 }}>
          <B w="40%" h={16} />
          <B w="100%" h={56} style={{ marginTop: 18, borderRadius: 16 }} />
          <B w="100%" h={56} style={{ marginTop: 12, borderRadius: 16 }} />
          <B w="100%" h={48} style={{ marginTop: 12, borderRadius: 16 }} />
        </Card>
      </Stack>
    </>
  ),
  page: () => (
    <>
      <Top />
      <Stack>{repeat(3, () => <ListItem />)}</Stack>
    </>
  ),
}

// The profile variant's header is a single 96 x 24 bar (not the back-arrow + title header).
function ProfileTop() {
  const s = useStyles()
  return (
    <View style={[s.top, { paddingTop: 18, paddingBottom: 14 }]}>
      <B w={96} h={24} style={{ borderRadius: 8 }} />
    </View>
  )
}
export default function TaxiPageSkeleton({ variant = 'page' }) {
  const s = useStyles()
  const pulse = usePulse()
  const draw = PAGES[variant] || PAGES.page
  return (
    <PulseContext.Provider value={pulse}>
      <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={variant === 'activity-list' ? null : s.page}>
        {draw()}
      </View>
    </PulseContext.Provider>
  )
}

/** Which placeholder belongs to a Taxi address (same rule index.html uses). */
export function taxiSkeletonVariant(pathname = '') {
  let p = String(pathname || '').split('?')[0]
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  if (p.endsWith('/activity')) return 'activity'
  if (p.endsWith('/profile')) return 'profile'
  if (p.endsWith('/support')) return 'support'
  if (p.endsWith('/wallet')) return 'wallet'
  if (p.endsWith('/bus')) return 'bus'
  return 'page'
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? '#0b0b0b' : '#f1f4f9', paddingBottom: 120 },
  card: {
    backgroundColor: t.dark ? '#141414' : '#ffffff',
    borderRadius: 20,
    ...(t.dark ? {} : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }),
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: t.dark ? '#141414' : '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.7)',
  },
  divider: { borderTopWidth: 1, borderTopColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.6)' },
  chips: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: t.dark ? '#141414' : '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.7)',
  },
  chipsIn: { flexDirection: 'row', gap: 8, overflow: 'hidden', padding: 5, borderRadius: 999, backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : '#eef2f7' },
}))
