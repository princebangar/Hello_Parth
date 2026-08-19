import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, ChevronDown } from 'lucide-react';
import { getVerticalTheme } from '@/shared/constants/superAppVerticalTheme';
import { syncThemeForPath } from '@/shared/utils/theme.js';
import { ensureFoodGuestSession } from '@/shared/utils/activeModule.js';

const LOCATION_STORAGE_KEY = 'helloparth:lastLocation';
const LOCATION_UPDATED_EVENT = 'helloparth:location-updated';

function readHelloParthLocation() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    const address = String(saved?.address || '').trim();
    if (!address) return null;
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      formattedAddress: address,
      area: parts[0] || address,
      city: parts.length > 2 ? parts[parts.length - 2] : parts[1] || '',
      state: parts.length > 1 ? parts[parts.length - 1] : '',
      address,
    };
  } catch {
    return null;
  }
}

function BurgerIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" fill="#2A9D8F" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 36L14 40L50 40L54 36" fill="#E9C46A" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="40" width="36" height="6" rx="3" fill="#8B5E3C" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-65 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 36L14 40L50 40L54 36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="14" y="40" width="36" height="6" rx="3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TaxiIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="22" y="10" width="20" height="7" rx="2" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <rect x="26" y="11.5" width="12" height="4" rx="1" fill="#FBBF24" />
        <path d="M14 24H50L46 17H18L14 24Z" fill="#2563EB" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" fill="#3B82F6" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M18 28H46" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
        <rect x="20" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <rect x="34" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <circle cx="18" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="46" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="18" cy="42" r="2" fill="#E2E8F0" />
        <circle cx="46" cy="42" r="2" fill="#E2E8F0" />
        <rect x="28" y="44" width="8" height="3" rx="1" fill="#64748B" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-70 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="10" width="20" height="7" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M14 24H50L46 17H18L14 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="18" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="46" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

const foodTheme = getVerticalTheme('food');
const taxiTheme = getVerticalTheme('taxi');

const VERTICALS = [
  {
    id: 'food',
    name: 'Hello Parth Food',
    path: '/food/user',
    themeBg: foodTheme.themeBg,
    activeTabBg: foodTheme.activeTabBg,
    inactiveTabBg: foodTheme.inactiveTabBg,
  },
  {
    id: 'taxi',
    name: 'Hello Parth Taxi',
    path: '/taxi/user',
    themeBg: taxiTheme.themeBg,
    activeTabBg: taxiTheme.activeTabBg,
    inactiveTabBg: taxiTheme.inactiveTabBg,
  },
];

export default function SuperAppHomeHeader({
  activeVertical: activeVerticalProp,
  location: locationProp,
  locationTitle,
  locationSubtitle,
  savedAddressText,
  handleLocationClick,
  tabsOnly = false,
  /** When true, render only the tabs row — parent supplies the themed background wrapper. */
  embedded = false,
}) {
  const navigate = useNavigate();
  const reactLocation = useLocation();
  const locationPath = reactLocation.pathname;

  let routeVertical = 'food';
  if (locationPath.startsWith('/taxi/')) {
    routeVertical = 'taxi';
  } else if (['food', 'taxi'].includes(activeVerticalProp)) {
    routeVertical = activeVerticalProp;
  }

  const activeVertical = ['food', 'taxi'].includes(activeVerticalProp)
    ? activeVerticalProp
    : routeVertical;
  const isTaxi = activeVertical === 'taxi';
  const currentVertical = VERTICALS.find((v) => v.id === activeVertical) || VERTICALS[0];
  const verticalTheme = getVerticalTheme(activeVertical);

  const handleVerticalTabClick = useCallback((verticalId) => {
    if (verticalId === 'food') {
      ensureFoodGuestSession();
      navigate('/food/user');
      return;
    }
    if (verticalId === 'taxi') {
      syncThemeForPath('/taxi/user');
      navigate('/taxi/user');
    }
  }, [navigate]);

  const [storedLocation, setStoredLocation] = useState(() => readHelloParthLocation());

  useEffect(() => {
    const syncLocation = () => setStoredLocation(readHelloParthLocation());
    syncLocation();
    window.addEventListener('storage', syncLocation);
    window.addEventListener(LOCATION_UPDATED_EVENT, syncLocation);
    return () => {
      window.removeEventListener('storage', syncLocation);
      window.removeEventListener(LOCATION_UPDATED_EVENT, syncLocation);
    };
  }, []);

  const location = locationProp ?? storedLocation;
  const walletPath = isTaxi ? '/taxi/user/wallet' : '/food/user/wallet';

  const displayTitle = useMemo(() => {
    if (locationTitle?.trim()) return locationTitle.trim();
    if (savedAddressText?.trim()) {
      const firstPart = savedAddressText.split(',')[0]?.trim();
      return firstPart || savedAddressText;
    }
    if (location?.area && location?.city) return `${location.area}, ${location.city}`;
    return location?.area || location?.city || location?.formattedAddress?.split(',')[0] || 'Select Location';
  }, [locationTitle, savedAddressText, location]);

  const displaySubtitle = useMemo(() => {
    if (locationSubtitle?.trim()) return locationSubtitle.trim();
    const parts = [location?.state, location?.zipCode || location?.postalCode].filter(Boolean);
    return parts.join(', ');
  }, [locationSubtitle, location]);

  const onLocationClick = useCallback(() => {
    if (handleLocationClick) {
      handleLocationClick();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
    }
  }, [handleLocationClick, isTaxi, navigate]);

  const tabsRow = (
    <div className={`relative z-20 px-3 pb-0 ${tabsOnly && !embedded ? 'pt-2' : ''}`}>
      <div className="flex w-full items-stretch gap-1">
        {VERTICALS.map((vertical) => {
          const isActive = vertical.id === activeVertical;
          const tabTheme = getVerticalTheme(vertical.id);
          const inactiveTabClass = currentVertical.inactiveTabBg;
          return (
            <div key={vertical.id} className={`flex-1 relative flex flex-col items-stretch ${isActive ? 'z-20' : 'z-10'}`}>
              <button
                type="button"
                onClick={() => handleVerticalTabClick(vertical.id)}
                style={isActive ? { '--active-tab-bg': tabTheme.activeTab } : undefined}
                className={`w-full min-h-[74px] flex flex-col items-center justify-center px-2 transition-all duration-300 rounded-t-[1.75rem] pt-2.5 pb-2.5 ${
                  isActive
                    ? `${vertical.activeTabBg} curvy-active-tab shadow-sm`
                    : `${inactiveTabClass}`
                }`}
              >
                <div className="mb-1.5 flex items-center justify-center">
                  {vertical.id === 'food' ? <BurgerIcon isActive={isActive} /> : <TaxiIcon isActive={isActive} />}
                </div>
                <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-white' : 'text-white/75'}`}>
                  {vertical.name}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (embedded) {
    return tabsRow;
  }

  return (
    <div
      className="relative z-10 w-full transition-colors duration-500 ease-in-out"
      style={{ backgroundColor: verticalTheme.theme }}
    >
      {!tabsOnly && (
      <div className="relative z-20 px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
          onClick={onLocationClick}
        >
          <MapPin className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} style={{ color: verticalTheme.accent, fill: verticalTheme.accent }} />
          <div className="flex flex-col min-w-0 text-white">
            <div className="flex items-center gap-0.5 min-w-0">
              <span className="text-[14px] font-bold truncate drop-shadow-sm">
                {displayTitle}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
            </div>
            {displaySubtitle ? (
              <span className="text-[11px] font-medium truncate opacity-80 max-w-[210px]">
                {displaySubtitle}
              </span>
            ) : null}
          </div>
        </button>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            type="button"
            className="h-10 w-10 relative flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition-all"
            onClick={() => navigate(walletPath)}
            aria-label="Wallet"
          >
            <div className="w-5 h-5 border-2 border-gray-800 rounded flex items-center justify-center">
              <span className="text-gray-800 text-[10px] font-bold font-serif">₹</span>
            </div>
          </button>
        </div>
      </div>
      )}

      {tabsRow}
    </div>
  );
}
