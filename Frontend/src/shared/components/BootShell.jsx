import { getFoodStyleLocationParts, getLocationSubtitle, readSharedFoodLocation, readTaxiLocation } from '@/shared/utils/sharedUserLocation'
import { getAppRoutePath } from '@/shared/utils/nativeShell'
import { useSwitcherPill } from '@/shared/utils/useSwitcherIndex'

/**
 * The real top of the Taxi / Food home - the person's saved location, the Taxi | Food switch and the icons, in the
 * app's own colours - shown while the rest of the app is still loading. index.html paints exactly the same header from
 * plain HTML before any JavaScript arrives (see the ".boot-shell" block there); this is what React puts up when it
 * takes over, so the hand-off is invisible and only the part below the header is a skeleton.
 *
 * Only on phones (< 768 px) and only on the two home screens, whose real header it copies
 * (shared/components/SuperAppHomeHeader.jsx). Everything else keeps the plain grey skeleton.
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
  // the screen being opened - in the app's WebView that is the "#/..." part, the path there is only the app's start page
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
  food: { bg: '#D91F3A', pin: '#FF6B7A', activeTab: '#FF5C72', height: 393, radius: 36 },
}

const icon = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' }

export function BootShellHeader({ vertical }) {
  const theme = THEME[vertical]
  if (!theme) return null
  const { title, subtitle } = readTitleAndSubtitle()
  const pillRef = useSwitcherPill(vertical)
  const tab = (id, label) => ({
    flex: 1,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    color: id === vertical ? '#fff' : 'rgba(255,255,255,.85)',
    position: 'relative',
  })

  return (
    <div aria-hidden="true">
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          color: '#fff',
          background: theme.bg,
          height: theme.height,
          borderRadius: `0 0 ${theme.radius}px ${theme.radius}px`,
          fontFamily: "'Outfit','Poppins',system-ui,-apple-system,'Segoe UI',sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 16px 8px', boxSizing: 'border-box', height: 62 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.5" style={{ flex: 'none', fill: theme.pin, stroke: theme.pin }}>
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" fill="#fff" stroke="none" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, fontWeight: 700, lineHeight: '20px', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" style={{ flex: 'none', opacity: 0.9, ...icon }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, lineHeight: '14px', opacity: 0.8, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 14 }}>{subtitle}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" {...icon}>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <svg width="26" height="26" viewBox="0 0 24 24" strokeWidth="2.2" {...icon}>
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
              <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
            </svg>
            <span style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #fff', background: '#FFF5E6', overflow: 'hidden', display: 'block', boxSizing: 'border-box' }}>
              <img src="/assets/images/profile_avatar.webp" alt="" width="36" height="36" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </span>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', display: 'flex', gap: 2, padding: 4, borderRadius: 999, background: 'rgba(0,0,0,.25)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)', boxSizing: 'border-box' }}>
            <span
              ref={pillRef}
              style={{
                position: 'absolute', left: 4, top: 4, bottom: 4, width: 'calc((100% - 10px) / 2)', borderRadius: 999,
                background: theme.activeTab,
              }}
            />
            <span style={tab('taxi')}>Taxi</span>
            <span style={tab('food')}>Food</span>
          </div>
        </div>
        {vertical === 'food' ? (
          <div style={{ padding: '4px 16px 0', boxSizing: 'border-box' }}>
            <span style={{ display: 'block', height: 46, width: '76%', borderRadius: 16, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }} />
          </div>
        ) : null}
      </div>
      {vertical === 'taxi' ? <div style={{ height: 200, background: 'rgba(203,213,225,.8)' }} className="dark:!bg-white/10" /> : null}
    </div>
  )
}

/**
 * The part under the header while the Taxi / Food home loads: the same shapes as the real screen (search bar and service
 * tiles for Taxi; categories, filters, offers and the first restaurant for Food) and the floating bottom bar. The same
 * markup and sizes are in index.html (".bs-body"), whose stylesheet also styles this - so the plain-HTML stage and this
 * one look identical, and the real screen replaces it without anything jumping.
 */
const bar = (width, height, extra) => <i className="bs-b" style={{ width, height, ...extra }} />

function BottomBarSkeleton() {
  return (
    <div className="bs-nav">
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          {bar(22, 22)}
          {bar(34, 8)}
        </div>
      ))}
    </div>
  )
}

export function BootShellBody({ vertical }) {
  if (vertical === 'taxi') {
    const tiles = [[88, 64], [80, 70], [96, 76], [84, 60]]
    return (
      <div className="bs-body bs-on bs-taxi" aria-hidden="true">
        <div className="bs-c bs-flex" style={{ marginTop: 27, height: 60, borderRadius: 16, gap: 12, padding: '0 12px' }}>
          {bar(36, 36)}
          {bar(170, 14)}
        </div>
        {bar(170, 18, { margin: '10px 0 12px', borderRadius: 9 })}
        <div className="bs-grid">
          {tiles.map(([title, sub], i) => (
            <div key={i} className="bs-c bs-flex" style={{ height: 94, justifyContent: 'space-between', padding: '0 14px 0 18px' }}>
              <div>
                {bar(sub, 9)}
                {bar(title, 16, { marginTop: 10 })}
              </div>
              {bar(56, 56, { borderRadius: 18 })}
            </div>
          ))}
        </div>
        {bar(90, 18, { margin: '23px 0 14px', borderRadius: 9 })}
        <div className="bs-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bs-c" style={{ width: 88, height: 98, flex: 'none' }} />
          ))}
        </div>
        <BottomBarSkeleton />
      </div>
    )
  }

  if (vertical === 'food') {
    return (
      <div className="bs-body bs-on bs-food" aria-hidden="true">
        <div className="bs-row" style={{ marginTop: 17, gap: 16, paddingLeft: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 80, flex: 'none' }}>
              {bar(80, 80)}
              {bar(48, 9, { margin: '12px auto 0' })}
            </div>
          ))}
        </div>
        <div className="bs-row" style={{ marginTop: 20 }}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className="bs-b" style={{ width: 108, height: 37, flex: 'none' }} />
          ))}
        </div>
        {bar(96, 9, { margin: '20px 0 17px' })}
        <div className="bs-row">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className="bs-b" style={{ width: 88, height: 88, borderRadius: 20, flex: 'none' }} />
          ))}
        </div>
        {bar(190, 9, { margin: '48px 0 12px' })}
        {bar(220, 22, { borderRadius: 11 })}
        {bar('auto', 200, { marginTop: 25, borderRadius: 24 })}
        <BottomBarSkeleton />
      </div>
    )
  }

  return null
}
