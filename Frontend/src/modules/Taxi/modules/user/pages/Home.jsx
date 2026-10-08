import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronRight, Clock3, MapPin, ShieldCheck, User, Clock, Heart, Search, X } from 'lucide-react';
import SuperAppHomeHeader from '@/shared/components/SuperAppHomeHeader';
import HeaderGreeting from '../components/HeaderGreeting';
import ServiceGrid, { ServiceCard } from '../components/ServiceGrid';
import ServiceArt from '../components/ServiceArt';
import useTaxiNotificationUnread from '../utils/useTaxiNotificationUnread';
import LocationMapSection from '../components/LocationMapSection';
import ActionsSection from '../components/ActionsSection';
import PromoBanners from '../components/PromoBanners';
import ExplorerSection from '../components/ExplorerSection';
import CheckUsOutSection from '../components/CheckUsOutSection';
// ... removed import ...

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import deliveryFallback from '../../../assets/user-app/delivery.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import truckFallback from '../../../assets/user-app/truck.png';
import busFallback from '../../../assets/user-app/bus.png';
import yellowTaxiImg from '../../../assets/user-app/yellow-taxi.jpg';
import indiaGateRealImg from '@/assets/india_gate_real.png';
import seamlessHighwayBg from '@/assets/seamless_highway_bg.png';
import airplaneIcon from '../../../assets/3d images/AutoCab/airoplan.png';
import railwayIcon from '../../../assets/3d images/AutoCab/one way.png';
import busStationIcon from '../../../assets/3d images/AutoCab/bus.png';
import api from '../../../shared/api/axiosInstance';
import { useSettings } from '../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';

const getDynamicImageSrc = (item = {}, fallbackImage) => {
  const rawImage = item.uploadedImage || item.imageUrl || item.image || item.bannerImage || item.thumbnail || item.url || item.icon || null;

  if (!rawImage) {
    return fallbackImage;
  }

  let imageUrl = rawImage;
  if (!rawImage.startsWith('http') && !rawImage.startsWith('data:')) {
    const origin = (typeof BACKEND_ORIGIN !== 'undefined' ? BACKEND_ORIGIN : 'http://localhost:5000').replace('/api/v1', '');
    const cleanPath = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
    imageUrl = `${origin}${cleanPath}`;
  }

  if (item.updatedAt) {
    const separator = imageUrl.includes('?') ? '&' : '?';
    imageUrl = `${imageUrl}${separator}v=${item.updatedAt}`;
  }

  return imageUrl;
};

const SafeImage = ({ item, fallbackImage, className, alt, ...props }) => {
  const resolved = getDynamicImageSrc(item, fallbackImage);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    <img
      src={src}
      alt={alt || item?.title || ''}
      className={className}
      loading="lazy"
      onError={() => {
        setSrc(fallbackImage);
      }}
      {...props}
    />
  );
};

const PromoBannerImage = ({ promo, fallbackImage }) => {
  const resolved = getDynamicImageSrc(promo, fallbackImage);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    <>
      <img
        src={src}
        alt=""
        style={{ display: 'none' }}
        onError={() => setSrc(fallbackImage)}
      />
      <div
        className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 ease-out group-hover:scale-105"
        style={{
          backgroundImage: `url(${src})`,
          backgroundPosition: 'center',
        }}
      />
    </>
  );
};

import { getLocalUserToken, clearLocalUserSession } from '../services/authService';
import { getSavedLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { hasPersistentMap } from '../utils/persistentMap';
import useTaxiZoneGate from '../utils/useTaxiZoneGate';
import { showHelloParthBrandedToast } from '@/shared/utils/customToasts';
import { getFoodStyleLocationParts } from '@/shared/utils/sharedUserLocation';
import { cleanRecentPlace, loadRoadDistances } from '../utils/preciseLocation';
import { distanceBetweenKm } from '../utils/nearbyPlaces';

const RECENT_MAX_DISTANCE_KM = 50;
import OutOfZoneScreen from '@food/components/user/OutOfZoneScreen';
import {
  CURRENT_RIDE_UPDATED_EVENT,
  getCurrentRide,
  getCurrentRideSignature,
  isActiveCurrentRide,
  saveCurrentRide,
  clearCurrentRide,
} from '../services/currentRideService';

const Motion = motion;
const ACTIVE_RIDE_SYNC_INTERVAL_MS = 15000;
const IDLE_RIDE_SYNC_INTERVALS_MS = [60000, 120000, 180000];
const DEFERRED_SECTION_DELAY_MS = 250;
const FORCED_SYNC_COOLDOWN_MS = 10000;

const getCurrentRideIcon = (ride) => {
  const customIcon = String(
    ride?.vehicleIconUrl ||
    ride?.vehicle?.vehicleIconUrl ||
    ride?.vehicle?.icon ||
    ride?.driver?.vehicleIconUrl ||
    '',
  ).trim();

  if (customIcon && !customIcon.includes('localhost') && !customIcon.startsWith('/')) {
    return customIcon;
  }

  const serviceType = String(ride?.serviceType || ride?.type || '').toLowerCase();
  const iconType = String(ride?.vehicleIconType || ride?.driver?.vehicleIconType || ride?.driver?.vehicleType || '').toLowerCase();

  if (serviceType === 'parcel' || serviceType === 'delivery') {
    return parcelFallback;
  }

  if (iconType.includes('bike')) {
    return bikeFallback;
  }

  if (iconType.includes('auto')) {
    return taxiFallback;
  }

  if (serviceType === 'bus') {
    return busFallback;
  }

  return taxiFallback;
};

// Shown as the pickup only until the real current address is known - never a made-up city.
const PICKUP_PLACEHOLDER = 'Detecting your location...';

const defaultSettings = {
  homeSections: {
    enableEverything: true,
    enableExplore: true,
    enablePromo: true,
    enableGoPlaces: true
  },
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Car Taxi', subtitle: 'Everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' }
  ],
  explore: [
    { id: '1', title: 'Parcel on Bike', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Auto', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Cab Economy', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'Bike', image: '', route: '/taxi/user/ride/select-location', order: 4, status: 'active' }
  ],
  promos: [
    { id: '1', title: 'Experience A New Standard With Hello Parth', subtitle: 'A premier private hire service where luxury and reliability converge.', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Need to Send Packages? Try Parcel!', subtitle: 'Fast and secure delivery across your city at affordable prices.', image: '', route: '/taxi/user/parcel/type', order: 2, status: 'active' }
  ],
  goPlaces: [
    { id: '1', title: 'Hassle-Free City Rides', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Quick Rides to Railway Station', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Ride to Bus Terminal', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' }
  ]
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled time pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled time pending';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledCountdownLabel = (value, now = Date.now()) => {
  const parsed = value ? new Date(value) : null;
  const time = parsed?.getTime?.() || NaN;

  if (!Number.isFinite(time)) {
    return '';
  }

  const diffMs = time - now;
  if (diffMs <= 0) {
    return 'Pickup window is opening now';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${minutes}m`;
};

const RecentLocationsList = ({ routePrefix }) => {
  const navigate = useNavigate();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  const [recentLocations, setRecentLocations] = useState(() => {
    try {
      const saved = window.localStorage.getItem('helloparth:recentLocations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) { }
    // A new user has no recent places yet — never show made-up ones.
    return [];
  });

  const getSavedLocationCoords = () => {
    const saved = getSavedLocation();
    if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon)) {
      return [saved.lon, saved.lat];
    }
    return null;
  };

  useEffect(() => {
    const handleRefresh = () => {
      try {
        const saved = window.localStorage.getItem('helloparth:recentLocations');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecentLocations(parsed);
          }
        }
      } catch (e) { }
    };
    window.addEventListener('storage', handleRefresh);
    window.addEventListener('helloparth:recent-locations-updated', handleRefresh);
    return () => {
      window.removeEventListener('storage', handleRefresh);
      window.removeEventListener('helloparth:recent-locations-updated', handleRefresh);
    };
  }, []);

  // Distances are the road distance from the current location (what Google Maps shows), not the straight line.
  const [recentRoadMeters, setRecentRoadMeters] = useState({});
  const recentOriginKey = (getSavedLocationCoords() || []).join(',');
  // Only places near the person's current location are suggested here - a trip once searched in another city
  // (Mumbai, 385 km away) is not a "recent place" for someone standing in Indore.
  const nearbyRecents = useMemo(() => {
    const origin = getSavedLocationCoords();
    if (!origin) return recentLocations.map(cleanRecentPlace);
    return recentLocations.filter((item) => {
      if (!item.lat || !item.lon) return false;
      const km = distanceBetweenKm(origin, [Number(item.lon), Number(item.lat)]);
      return Number.isFinite(km) && km <= RECENT_MAX_DISTANCE_KM;
    }).map(cleanRecentPlace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentLocations, recentOriginKey]);
  useEffect(() => {
    const origin = getSavedLocationCoords();
    const items = nearbyRecents.slice(0, 3).filter((item) => item.lat && item.lon);
    if (!origin || items.length === 0) return undefined;
    let cancelled = false;
    let timer = null;
    let tries = 0;
    const run = () => {
      if (cancelled) return;
      if (!window.google?.maps) {
        // the map on this screen is still loading the Google library
        if (tries++ < 30) timer = setTimeout(run, 500);
        return;
      }
      loadRoadDistances(window.google, origin, items.map((item) => ({ coords: [item.lon, item.lat] }))).then((meters) => {
        if (cancelled || !meters) return;
        const next = {};
        items.forEach((item, index) => {
          if (Number.isFinite(meters[index])) next[`${item.lat},${item.lon}`] = meters[index];
        });
        setRecentRoadMeters(next);
      });
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [nearbyRecents, recentOriginKey]);

  const recentList = useMemo(() => {
    return nearbyRecents.map((item) => {
      const meters = recentRoadMeters[`${item.lat},${item.lon}`];
      const distanceLabel = Number.isFinite(meters)
        ? (meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`)
        : '';
      return {
        ...item,
        distance: distanceLabel || 'Recent',
      };
    }).slice(0, 3);
  }, [nearbyRecents, recentRoadMeters]);

  return (
    <div className="space-y-1 mt-2">
      {recentList.map((item, index) => (
        <div key={index} className="w-full">
          <div
            className={`w-full flex items-center justify-between gap-3 py-3 text-left rounded-xl px-2 transition-colors duration-200 ${isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-100/60'
              }`}
          >
            <div
              onClick={() =>
                navigate(`${routePrefix}/ride/select-location`, {
                  state: {
                    drop: item.address,
                    dropCoords: item.lat && item.lon ? [item.lon, item.lat] : null,
                    activeInput: 'drop',
                  },
                })
              }
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
            >
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}>
                <Clock size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className={`text-[14px] font-bold leading-tight truncate ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>
                  {item.name}
                </h4>
                <p className={`text-[11px] font-medium mt-1 truncate ${isDark ? 'text-zinc-400' : 'text-[#64748B]'}`}>
                  {item.distance && `${item.distance} • `}{item.address}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const updated = recentLocations.map((loc) => {
                  if (loc.address === item.address) {
                    return { ...loc, favourite: !loc.favourite };
                  }
                  return loc;
                });
                setRecentLocations(updated);
                localStorage.setItem('helloparth:recentLocations', JSON.stringify(updated));
              }}
              className={`hover:text-rose-500 transition-colors px-1 shrink-0 ${item.favourite ? 'text-rose-500' : 'text-slate-400'
                }`}
            >
              <Heart size={16} fill={item.favourite ? 'currentColor' : 'none'} />
            </button>
          </div>
          {index < recentList.length - 1 && (
            <div className={`border-b border-dashed mx-2 ${isDark ? 'border-slate-800/80' : 'border-slate-200/80'}`} />
          )}
        </div>
      ))}
    </div>
  );
};

const Home = () => {
  const unreadNotifications = useTaxiNotificationUnread();
  const outOfZone = useTaxiZoneGate();
  useEffect(() => {
    if (!outOfZone) return undefined;
    const timer = setTimeout(() => {
      showHelloParthBrandedToast({
        id: 'out-of-zone-toast',
        title: 'Our services are unavailable here right now.',
        message: 'Please choose a different location',
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [outOfZone]);
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSettings();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const appName = settings.general?.app_name || 'App';
  const [uiSettings, setUiSettings] = useState(() => {
    try {
      if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
        return settings.userHomeSettings;
      }
      const saved = window.localStorage.getItem('helloparth:admin:user-app-settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return defaultSettings;
  });

  useEffect(() => {
    if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
      setUiSettings(prev => {
        if (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings)) {
          return prev;
        }
        return settings.userHomeSettings;
      });
    }
  }, [settings?.userHomeSettings]);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = window.localStorage.getItem('helloparth:admin:user-app-settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setUiSettings(prev => {
            if (JSON.stringify(prev) === JSON.stringify(parsed)) {
              return prev;
            }
            return parsed;
          });
        } else {
          if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
            setUiSettings(prev => {
              if (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings)) {
                return prev;
              }
              return settings.userHomeSettings;
            });
          } else {
            setUiSettings(prev => prev === defaultSettings ? prev : defaultSettings);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [settings?.userHomeSettings]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAllServicesOpen, setIsAllServicesOpen] = useState(false);
  const [activeServices, setActiveServices] = useState([]);
  const [pickupAddress, setPickupAddress] = useState(() => (
    String(getSavedLocation()?.address || '').trim() || PICKUP_PLACEHOLDER
  ));
  const [isLocationLoading, setIsLocationLoading] = useState(() => !getSavedLocation()?.address);

  useEffect(() => {
    const handleLocationUpdate = () => {
      setPickupAddress(String(getSavedLocation()?.address || '').trim() || PICKUP_PLACEHOLDER);
    };
    const handleLocationStatus = (e) => {
      setIsLocationLoading(e.detail === 'loading');
    };
    window.addEventListener(LOCATION_UPDATED_EVENT, handleLocationUpdate);
    window.addEventListener('helloparth:location-status', handleLocationStatus);
    return () => {
      window.removeEventListener(LOCATION_UPDATED_EVENT, handleLocationUpdate);
      window.removeEventListener('helloparth:location-status', handleLocationStatus);
    };
  }, []);

  const [currentRide, setCurrentRide] = useState(() => {
    const ride = getCurrentRide();
    return isActiveCurrentRide(ride) ? ride : null;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  // The map is mounted a beat after the first paint on a cold start (keeps the first screen light). When the map
  // already exists - coming back from Food - there is nothing heavy left to wait for: mount it straight away, or
  // the screen shows a grey placeholder where the map was a moment ago.
  const [showDeferredSections, setShowDeferredSections] = useState(() => hasPersistentMap());
  // Home renders a phone layout and a desktop layout and hides one with CSS. The map (and its GPS / geocoding work)
  // must exist only once, in the layout that is actually on screen.
  const [isDesktopLayout, setIsDesktopLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (event) => setIsDesktopLayout(event.matches);
    setIsDesktopLayout(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const [isHoveringPromo, setIsHoveringPromo] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const [isProgrammaticScrolling, setIsProgrammaticScrolling] = useState(false);
  const promoScrollRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef(null);
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const currentRideRef = useRef(currentRide);
  const lastSyncAtRef = useRef(0);
  const consecutiveIdleMissesRef = useRef(0);
  const lastRideSignatureRef = useRef(getCurrentRideSignature(currentRide));

  const persistCurrentRide = (ride) => {
    const normalizedRide = isActiveCurrentRide(ride) ? ride : null;
    const nextSignature = getCurrentRideSignature(normalizedRide);

    if (lastRideSignatureRef.current === nextSignature) {
      return;
    }

    lastRideSignatureRef.current = nextSignature;
    setCurrentRide(normalizedRide);

    if (normalizedRide) {
      saveCurrentRide(normalizedRide);
    } else {
      clearCurrentRide();
    }
  };

  useEffect(() => {
    currentRideRef.current = currentRide;
    lastRideSignatureRef.current = getCurrentRideSignature(currentRide);
  }, [currentRide]);

  const rawBanners = uiSettings?.promos || defaultSettings.promos;
  const promoBanners = useMemo(() => {
    if (!Array.isArray(rawBanners)) return [];
    return rawBanners.filter(b => {
      const imageSrc = b.uploadedImage || b.imageUrl || b.image || b.bannerImage || b.thumbnail || b.url;
      return b.status !== false && b.status !== 'inactive' && imageSrc;
    });
  }, [rawBanners]);

  useEffect(() => {
    setCurrentPromoIndex(0);
  }, [promoBanners.length]);

  useEffect(() => {
    if (!promoBanners || promoBanners.length <= 1) return;
    if (isHoveringPromo) return;

    const interval = setInterval(() => {
      setCurrentPromoIndex(prev => (prev + 1) % promoBanners.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [promoBanners.length, isHoveringPromo]);



  useEffect(() => {
    const timer = setTimeout(() => {
      const container = document.querySelector('.user-home') || document.querySelector('.user-app') || document.querySelector('.user-home-page');
      if (container) {
        container.scrollTop = 220;
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleServiceClick = (service) => {
    // Scroll everything to top immediately upon clicking a service
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.documentElement) document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.body) document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.querySelectorAll('.overflow-y-auto, [class*="overflow-y-auto"], .overflow-y-scroll, .no-scrollbar').forEach(el => {
      el.scrollTop = 0;
    });

    // Helper to map fallback routes to registered routes defensively
    const cleanRoute = (route) => {
      if (!route) return '/taxi/user/ride/select-location';
      if (route === '/delivery') return '/taxi/user/parcel/type';
      if (route === '/bus') return '/taxi/user/bus';
      if (route === '/truck') return '/taxi/user/ride/select-location';
      return route;
    };

    const targetRoute = service.actionRoute || service.route;

    if (targetRoute === "ALL_SERVICES_MODAL") {
      setIsAllServicesOpen(true);
      return;
    }

    if (targetRoute && targetRoute.trim() !== '') {
      setIsAllServicesOpen(false);

      let vehicleType = '';
      const tName = String(service.name || service.label || service.title || "").toLowerCase();
      if (tName.includes('bike') || tName.includes('moto')) vehicleType = 'bike';
      else if (tName.includes('auto')) vehicleType = 'auto';
      else if (tName.includes('cab') || tName.includes('taxi') || tName.includes('car') || tName === 'book now' || tName === 'ride') vehicleType = 'cab';
      else if (tName.includes('parcel') || tName.includes('delivery')) vehicleType = 'parcel';

      console.log('--- TEMPORARY DEBUG LOG ---');
      console.log('selectedVehicleType from home:', vehicleType);

      if (vehicleType && vehicleType !== 'parcel') {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-location?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(targetRoute), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    const name = String(service.name || service.label || service.title || "").toLowerCase();
    const serviceType = String(service.service_type || service.serviceType || service.moduleService || "").toLowerCase();
    const transportType = String(service.transport_type || service.transportType || "").toLowerCase();

    // Close any open bottom sheet/modal
    setIsAllServicesOpen(false);

    const definedPath = service.path;
    if (definedPath && definedPath.trim() !== '') {
      let vehicleType = '';
      if (name.includes('bike') || name.includes('moto')) vehicleType = 'bike';
      else if (name.includes('auto')) vehicleType = 'auto';
      else if (name.includes('cab') || name.includes('taxi') || name.includes('car') || name === 'book now' || name === 'ride') vehicleType = 'cab';
      else if (name.includes('parcel') || name.includes('delivery')) vehicleType = 'parcel';

      console.log('--- TEMPORARY DEBUG LOG ---');
      console.log('selectedVehicleType from home:', vehicleType);

      if (vehicleType && vehicleType !== 'parcel') {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-location?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(definedPath), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    if (name.includes("parcel") || name.includes("delivery") || name.includes("courier") || serviceType.includes("delivery") || serviceType.includes("parcel")) {
      navigate("/taxi/user/parcel/type");
      return;
    }

    if (name.includes("bus") || transportType.includes("bus") || serviceType.includes("bus")) {
      navigate("/taxi/user/bus");
      return;
    }

    if (name.includes("pooling") || serviceType.includes("pooling")) {
      navigate("/taxi/user/pooling");
      return;
    }

    if (name.includes("outstation") || name.includes("intercity") || serviceType.includes("intercity")) {
      navigate("/taxi/user/intercity");
      return;
    }

    if (name.includes("truck")) {
      navigate("/taxi/user/ride/select-location");
      return;
    }

    // Extract category if it matches common ride types
    let selectedCategory = '';
    if (name.includes('bike') || name.includes('moto')) selectedCategory = 'bike';
    else if (name.includes('auto')) selectedCategory = 'auto';
    else if (name.includes('cab') || name.includes('taxi') || name.includes('car')) selectedCategory = 'cab';

    // Default ride / taxi / cab / bike flow
    navigate("/taxi/user/ride/select-location", { state: { selectedCategory } });
  };

  useEffect(() => {
    const token = getLocalUserToken();
    if (!token) {
      clearLocalUserSession();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const shouldTickClock =
    Number.isFinite(currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN);

  useEffect(() => {
    if (!shouldTickClock) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [shouldTickClock]);

  useEffect(() => {
    let cancelled = false;
    const scheduleDeferredSections = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
        if (!cancelled) {
          setShowDeferredSections(true);
        }
      }, { timeout: DEFERRED_SECTION_DELAY_MS })
      : window.setTimeout(() => {
        if (!cancelled) {
          setShowDeferredSections(true);
        }
      }, DEFERRED_SECTION_DELAY_MS);

    return () => {
      cancelled = true;
      if (typeof scheduleDeferredSections === 'number') {
        window.clearTimeout(scheduleDeferredSections);
        return;
      }

      window.cancelIdleCallback?.(scheduleDeferredSections);
    };
  }, []);

  useEffect(() => {
    const refreshCurrentRide = () => {
      const ride = getCurrentRide();
      const nextRide = isActiveCurrentRide(ride) ? ride : null;
      lastRideSignatureRef.current = getCurrentRideSignature(nextRide);
      setCurrentRide(nextRide);
    };

    refreshCurrentRide();
    window.addEventListener('storage', refreshCurrentRide);
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);

    let cancelled = false;
    let syncTimer = null;
    let syncInFlight = false;

    const scheduleNextSync = () => {
      if (cancelled) {
        return;
      }

      const nextInterval = currentRideRef.current
        ? ACTIVE_RIDE_SYNC_INTERVAL_MS
        : IDLE_RIDE_SYNC_INTERVALS_MS[Math.min(consecutiveIdleMissesRef.current, IDLE_RIDE_SYNC_INTERVALS_MS.length - 1)];
      syncTimer = window.setTimeout(() => {
        syncCurrentRide();
      }, nextInterval);
    };

    const syncCurrentRide = async (reason = 'timer') => {
      if (cancelled || syncInFlight || document.visibilityState === 'hidden') {
        scheduleNextSync();
        return;
      }

      // `mount` is exempt: lastSyncAtRef outlives a quick unmount/remount (StrictMode, coming back
      // to Home within the cooldown), and skipping here would leave no sync timer running at all.
      if (
        reason === 'focus' &&
        Date.now() - lastSyncAtRef.current < FORCED_SYNC_COOLDOWN_MS
      ) {
        return;
      }

      syncInFlight = true;
      lastSyncAtRef.current = Date.now();
      try {
        const token = getLocalUserToken();
        if (!token) {
          persistCurrentRide(null);
          currentRideRef.current = null;
          consecutiveIdleMissesRef.current = 0;
          return;
        }

        let rideData = null;

        try {
          rideData = unwrapApiPayload(await api.get('/rides/active/me'));
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status !== 404) {
            throw error;
          }
        }

        if (rideData?._id || rideData?.rideId) {
          const normalizedRide = {
            rideId: rideData._id || rideData.rideId,
            pickup: rideData.pickupAddress || rideData.pickup,
            drop: rideData.dropAddress || rideData.drop,
            pickupCoords: rideData.pickupLocation?.coordinates || rideData.pickupCoords || null,
            dropCoords: rideData.dropLocation?.coordinates || rideData.dropCoords || null,
            fare: rideData.fare,
            baseFare: rideData.baseFare || rideData.fare || 0,
            status: rideData.status,
            liveStatus: rideData.liveStatus,
            serviceType: rideData.serviceType,
            scheduledAt: rideData.scheduledAt || null,
            acceptedAt: rideData.acceptedAt || null,
            arrivedAt: rideData.arrivedAt || null,
            estimatedDistanceMeters: rideData.estimatedDistanceMeters || 0,
            estimatedDurationMinutes: rideData.estimatedDurationMinutes || 0,
            paymentMethod: rideData.paymentMethod || 'Cash',
            pricingSnapshot: rideData.pricingSnapshot || null,
            otp: rideData.otp || '',
            driver: rideData.driverId || rideData.driver,
            vehicleIconUrl: rideData.vehicleIconUrl,
            vehicleIconType: rideData.vehicleIconType,
          };
          if (isActiveCurrentRide(normalizedRide)) {
            if (cancelled) return;
            consecutiveIdleMissesRef.current = 0;
            persistCurrentRide(normalizedRide);
            currentRideRef.current = normalizedRide;
            return;
          }
        }

        if (cancelled) return;
        consecutiveIdleMissesRef.current = Math.min(
          consecutiveIdleMissesRef.current + 1,
          IDLE_RIDE_SYNC_INTERVALS_MS.length - 1,
        );
        persistCurrentRide(null);
        currentRideRef.current = null;
      } finally {
        syncInFlight = false;
        scheduleNextSync();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState !== 'hidden') {
        syncCurrentRide('focus');
      }
    };

    syncCurrentRide('mount');
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      cancelled = true;
      if (syncTimer) {
        window.clearTimeout(syncTimer);
      }
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('storage', refreshCurrentRide);
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);
    };
  }, []);

  const driverName = currentRide?.driver?.name || 'Captain';
  const serviceType = String(currentRide?.serviceType || currentRide?.type || 'ride').toLowerCase();
  const vehicleLabel = currentRide?.driver?.vehicle || currentRide?.driver?.vehicleType || (serviceType === 'parcel' ? 'Parcel' : 'Taxi');
  const currentRideIcon = getCurrentRideIcon(currentRide);
  const trackingPath =
    serviceType === 'parcel'
      ? `${routePrefix}/parcel/tracking`
      : `${routePrefix}/ride/tracking`;
  const rideStage = String(currentRide?.liveStatus || currentRide?.status || 'accepted').toLowerCase();
  const hasAssignedDriver = Boolean(currentRide?.driver?._id || currentRide?.driver?.id || currentRide?.driver?.name);
  const scheduledTimestamp = currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN;
  const isScheduledRide = Number.isFinite(scheduledTimestamp);
  const isScheduledUpcoming = isScheduledRide && scheduledTimestamp > clockNow;
  const isScheduledAcceptedRide = ['ride', 'intercity'].includes(serviceType) && isScheduledUpcoming && hasAssignedDriver && ['accepted', 'arriving'].includes(rideStage);
  const rideStageLabel =
    rideStage === 'started'
      ? serviceType === 'parcel' ? 'Parcel in transit' : 'Ride in progress'
      : rideStage === 'arrived'
        ? serviceType === 'parcel' ? 'Parcel reached destination' : `${driverName} reached destination`
        : rideStage === 'arriving'
          ? serviceType === 'parcel' ? `${driverName} reached sender` : `${driverName} has arrived`
          : serviceType === 'parcel'
            ? 'Parcel booked'
            : 'Ride booked';
  const rideStageContextLabel = isScheduledAcceptedRide
    ? 'Driver assigned for your scheduled trip'
    : rideStageLabel;
  const scheduledDateLabel = formatScheduledDateTime(currentRide?.scheduledAt);
  const scheduledCountdown = getScheduledCountdownLabel(currentRide?.scheduledAt, clockNow);
  const footerIllustrationBg = {
    backgroundImage: `url(${indiaGateRealImg})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
    backgroundSize: 'cover',
  };
  const footerIllustrationFadeMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  const footerIllustrationEdgeBlurMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  const renderExploreSection = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2">
          <div className="h-4 w-20 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md mb-3" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[86px] h-[96px] rounded-[20px] animate-pulse bg-slate-200 dark:bg-zinc-800/80" />
            ))}
          </div>
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableExplore === false) {
      return null;
    }

    const cards = uiSettings?.explore || defaultSettings.explore;
    const activeCards = cards
      .filter(c => c.status === 'active' || c.status === true)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    return (
      <div className="pt-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="user-section-title">Explore</h2>
          <button
            type="button"
            onClick={() => setIsAllServicesOpen(true)}
            className="text-[13px] font-semibold flex items-center gap-0.5"
            style={{ pointerEvents: 'auto', zIndex: 100, position: 'relative', color: 'var(--user-text-secondary)' }}
          >
            View all <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-3 -mx-1 px-1">
          {activeCards.map((card, idx) => (
            <motion.button
              key={card.id || idx}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => handleServiceClick(card)}
              className="flex-shrink-0 w-[88px] rounded-[18px] flex flex-col items-center gap-2 px-2 pt-3 pb-2.5 text-center"
              style={{ background: 'var(--user-card-bg)', border: '1px solid var(--user-border)', boxShadow: 'var(--user-card-shadow)' }}
            >
              <div className="service-art h-12 w-12 rounded-[14px]">
                <ServiceArt src={getDynamicImageSrc(card, '')} label={card.title} hint={card.title} size={24} imgClassName="h-full w-full object-contain p-1.5" />
              </div>
              <span className="text-[12px] font-semibold leading-tight text-center line-clamp-2" style={{ color: 'var(--user-text-primary)' }}>
                {card.title}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    );
  };

  const renderPromoBanner = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2">
          <div className="h-[140px] w-full rounded-[26px] animate-pulse bg-slate-200 dark:bg-zinc-800/80" />
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enablePromo === false) {
      return null;
    }

    if (!promoBanners || promoBanners.length === 0) return null;

    const fallbackImages = [yellowTaxiImg, seamlessHighwayBg];

    const handleTouchStart = (e) => {
      touchStartX.current = e.targetTouches[0].clientX;
      setIsHoveringPromo(true);
    };

    const handleTouchMove = (e) => {
      touchEndX.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
      setIsHoveringPromo(false);
      const diffX = touchStartX.current - touchEndX.current;
      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swiped left -> next banner
          setCurrentPromoIndex((prev) => (prev + 1) % promoBanners.length);
        } else {
          // Swiped right -> prev banner
          setCurrentPromoIndex((prev) => (prev - 1 + promoBanners.length) % promoBanners.length);
        }
      }
    };

    return (
      <div
        className="pt-2 relative w-full overflow-hidden"
        onMouseEnter={() => setIsHoveringPromo(true)}
        onMouseLeave={() => setIsHoveringPromo(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="promo-carousel bg-[#0B1220]" style={{ border: '1px solid var(--user-border)', boxShadow: 'var(--user-card-shadow)' }}>
          <div
            className="promo-track"
            style={{ transform: `translateX(-${currentPromoIndex * 100}%)` }}
          >
            {promoBanners.map((item, idx) => {
              const fallback = fallbackImages[idx % fallbackImages.length];
              const resolvedImgSrc = getDynamicImageSrc(item, fallback);
              return (
                <div
                  key={item.id || item._id}
                  className="promo-slide cursor-pointer"
                  onClick={() => {
                    if (item.route) {
                      const targetRoute = item.route;
                      const isSelectLocationRoute = targetRoute.includes('/ride/select-location');
                      if (isSelectLocationRoute) {
                        navigate(targetRoute, { state: { activeInput: 'drop', flow: 'ride' } });
                      } else {
                        navigate(targetRoute);
                      }
                    } else {
                      navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } });
                    }
                  }}
                >
                  <img
                    src={resolvedImgSrc}
                    alt={item.title || "Promo"}
                    className="w-full h-[150px] object-cover rounded-[22px] block"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent z-10 rounded-[22px]" />
                  <div className="absolute inset-0 flex items-center p-6 z-20">
                    <div className="max-w-[80%] space-y-1.5 text-left">
                      <h2 className="text-[18px] font-bold leading-tight tracking-tight text-slate-50 whitespace-normal break-words">
                        <span className="text-[#FFC400]">{item.title ? item.title.split(' ')[0] : ''}</span>
                        {' '}
                        {item.title ? item.title.split(' ').slice(1).join(' ') : ''}
                      </h2>
                      {item.subtitle && (
                        <p className="text-[12px] font-medium text-slate-200/90 leading-snug line-clamp-2">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Autoplay Linear Progress Bar */}
          {promoBanners.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-30 overflow-hidden">
              <motion.div
                key={currentPromoIndex}
                initial={{ width: '0%' }}
                animate={isHoveringPromo ? { width: '0%' } : { width: '100%' }}
                transition={{ duration: 3, ease: 'linear' }}
                className="h-full bg-[#FFC400]"
              />
            </div>
          )}

          {/* Page Indicators */}
          {promoBanners.length > 1 && (
            <div className="promo-dots">
              {promoBanners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPromoIndex(idx);
                  }}
                  className={idx === currentPromoIndex ? "active" : ""}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGoPlacesSection = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2 space-y-2">
          <div className="h-4 w-32 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md" />
          <div className="h-3 w-40 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md mb-3" />
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[156px] h-[162px] rounded-[24px] animate-pulse bg-slate-200 dark:bg-zinc-800/80" />
            ))}
          </div>
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableGoPlaces === false) {
      return null;
    }

    const cards = uiSettings?.goPlaces || defaultSettings.goPlaces;
    const activeCards = cards
      .filter(c => c.status === 'active' || c.status === true)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const getGoPlacesIcon = (title) => {
      const cleanTitle = String(title || '').toLowerCase();
      if (cleanTitle.includes('airport') || cleanTitle.includes('flight')) return airplaneIcon;
      if (cleanTitle.includes('railway') || cleanTitle.includes('station') || cleanTitle.includes('train')) return railwayIcon;
      if (cleanTitle.includes('bus') || cleanTitle.includes('terminal')) return busStationIcon;
      return railwayIcon;
    };

    return (
      <div className="pt-1">
        <div className="mb-3">
          <h2 className="user-section-title">Go Places with Hello Parth</h2>
          <p className="mt-1 text-[12px] font-medium" style={{ color: 'var(--user-text-muted)' }}>
            Fast bookings to key transit hubs
          </p>
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-3 -mx-1 px-1">
          {activeCards.map((card, idx) => (
            <motion.button
              key={card.id || idx}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => {
                if (card.route) {
                  navigate(card.route);
                } else {
                  navigate(`${routePrefix}/ride/select-location`);
                }
              }}
              className="flex-shrink-0 w-[156px] rounded-[20px] overflow-hidden text-left group flex flex-col"
              style={{ background: 'var(--user-card-bg)', border: '1px solid var(--user-border)', boxShadow: 'var(--user-card-shadow)' }}
            >
              {/* Image area */}
              <div className="service-art h-[84px] w-full p-3">
                <SafeImage
                  item={card}
                  fallbackImage={getGoPlacesIcon(card.title)}
                  className="h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Title & action */}
              <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                <h4 className="text-[14px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--user-text-primary)' }}>
                  {card.title}
                </h4>
                <div className="flex items-center gap-0.5 text-[12px] font-semibold leading-none" style={{ color: 'var(--user-text-secondary)' }}>
                  Book now <ChevronRight size={13} strokeWidth={2.5} />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  };

  const exploreSection = useMemo(() => {
    return renderExploreSection();
  }, [uiSettings?.explore, uiSettings?.homeSections?.enableExplore, isDark, settingsLoading]);

  const promoBanner = useMemo(() => {
    return renderPromoBanner();
  }, [promoBanners, currentPromoIndex, isHoveringPromo, uiSettings?.homeSections?.enablePromo, isDark, settingsLoading]);

  const goPlacesSection = useMemo(() => {
    return renderGoPlacesSection();
  }, [uiSettings?.goPlaces, uiSettings?.homeSections?.enableGoPlaces, isDark, settingsLoading]);

  if (outOfZone) {
    const saved = getSavedLocation();
    return (
      <OutOfZoneScreen
        service="taxi"
        isGuest={!getLocalUserToken()}
        location={{ area: saved?.area || getFoodStyleLocationParts({ address: saved?.address }).title, city: saved?.address }}
        handleLocationClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride', fromOutOfZone: true } })}
      />
    );
  }

  return (
    <div className="min-h-screen w-full lg:max-w-7xl mx-auto relative font-sans no-scrollbar overflow-x-clip transition-colors duration-300 user-app-theme shadow-2xl">

      {/* 1. MOBILE LAYOUT: Google Map component + Sticky Search Bar + HomeContent */}
      <div className="block lg:hidden">
        <div className="user-home">
          {/* Solid top app bar — location + Food/Taxi switcher. Own space, not
              floated over the map, so nothing overlaps. */}
          <div className="user-home-appbar">
            <SuperAppHomeHeader activeVertical="taxi" notificationCount={unreadNotifications} />
          </div>

          {/* Map — sits below the app bar, fully visible, own box. */}
          <div className="map-header">
            {showDeferredSections && !isDesktopLayout ? (
              <LocationMapSection />
            ) : (
              <div className={`h-full w-full animate-pulse ${isDark ? 'bg-[#0f172a]' : 'bg-slate-200'}`} />
            )}

            {/* Pickup Address Pill: overlays the map's own bottom edge only */}
            <div
              onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride' } })}
              className="pickup-address-pill flex items-center gap-2.5 rounded-full py-2 pl-4 pr-2 cursor-pointer"
              style={{ background: 'var(--user-card-bg)', border: '1px solid var(--user-border)', boxShadow: '0 8px 24px rgba(15,23,42,0.22)', color: 'var(--user-text-primary)' }}
            >
              <div className="w-[10px] h-[10px] rounded-full bg-[#168a45] shrink-0 ring-4 ring-[#168a45]/20" />
              <span className="text-[13px] font-semibold truncate flex-1 leading-none">
                {isLocationLoading ? 'Pinning your current location...' : pickupAddress}
              </span>
              <span className="text-[11px] font-bold rounded-full px-3 py-1.5 shrink-0 leading-none" style={{ background: 'var(--user-accent)', color: 'var(--user-accent-ink)' }}>
                Change
              </span>
            </div>
          </div>
          {/* Content Sheet — flows directly after the map, no overlap */}
          <div className="home-sheet space-y-3">
            {/* Sticky Search Bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="user-search-bar"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all relative overflow-hidden"
                style={{ background: 'var(--user-card-bg)', border: '1px solid var(--user-border)', boxShadow: 'var(--user-card-shadow)' }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--user-accent)', color: 'var(--user-accent-ink)' }}>
                  <Search size={16} strokeWidth={2.6} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium" style={{ color: 'var(--user-text-primary)' }}>
                  Where do you want to go?
                </span>
              </motion.button>
            </motion.div>

            {/* Recent Locations List */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <RecentLocationsList routePrefix={routePrefix} />
            </motion.div>

            {/* Compact Active Ride/Booking Banner */}
            {currentRide && String(currentRide?.status || '').toLowerCase() !== 'end_requested' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="pt-1"
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(trackingPath, { state: currentRide })}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left shadow-sm transition-all duration-200 ${isDark
                    ? 'bg-[#111827] border-zinc-800 text-white hover:bg-zinc-800'
                    : 'bg-emerald-50/40 border-emerald-100/60 text-slate-900 hover:bg-emerald-50/75'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[13px] font-bold truncate leading-none">
                      You have an active ride
                    </span>
                  </div>
                  <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400 hover:opacity-80 shrink-0 flex items-center gap-0.5 leading-none">
                    View details <ChevronRight size={14} className="mt-0.5" />
                  </span>
                </motion.button>
              </motion.div>
            )}

            {/* Everything In Minutes Grid */}
            {(!uiSettings?.homeSections || uiSettings.homeSections.enableEverything !== false) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="everything-section"
              >
                <ServiceGrid
                  isAllServicesOpen={isAllServicesOpen}
                  setIsAllServicesOpen={setIsAllServicesOpen}
                  onLoadServices={setActiveServices}
                />
              </motion.div>
            )}

            {/* Explore Horizontal List */}
            {exploreSection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="explore-section"
              >
                {exploreSection}
              </motion.div>
            )}

            {/* Promo Banner */}
            {promoBanner && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="promo-section"
              >
                {promoBanner}
              </motion.div>
            )}

            {/* Go Places */}
            {goPlacesSection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="go-places-section"
              >
                {goPlacesSection}
              </motion.div>
            )}

            {/* Active Scheduled Ride Tracker */}
            {isScheduledAcceptedRide && (
              <div className="pt-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(trackingPath, { state: currentRide })}
                  className="block w-full overflow-hidden rounded-[28px] border border-slate-800 p-5 text-left bg-slate-900 text-white shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] bg-yellow-400/10 text-yellow-400">
                      <ShieldCheck size={11} strokeWidth={3} />
                      Confirmed
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full animate-pulse bg-yellow-400" />
                      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-yellow-400">Live Status</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <h2 className="text-[24px] font-black tracking-tight leading-none text-white">
                        {scheduledCountdown}
                      </h2>
                      <p className="mt-1.5 text-[12px] font-bold text-slate-400">
                        {scheduledDateLabel}
                      </p>
                    </div>
                    <div className="relative mb-1">
                      <div className="absolute -inset-4 rounded-full bg-yellow-400/5 blur-xl animate-pulse" />
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 shadow-2xl border border-slate-800">
                        <img src={currentRideIcon} alt="" className="h-8 w-8 object-contain" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between rounded-xl p-2.5 bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-slate-900 border border-slate-800 text-yellow-400 flex items-center justify-center">
                        <User size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-none">Driver & Vehicle</p>
                        <p className="mt-0.5 truncate text-[12.5px] font-bold">{driverName} • {vehicleLabel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-none">Fare</p>
                      <p className="mt-0.5 text-[12.5px] font-bold">₹{Number(currentRide?.fare || 0).toFixed(0)}</p>
                    </div>
                  </div>
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. DESKTOP LAYOUT (hidden lg:grid) */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8 lg:px-6 lg:pt-6 relative z-10">

        {/* Left Column (Greeting + Categories + Promos) */}
        <div className="lg:col-span-5 space-y-4">
          <SuperAppHomeHeader activeVertical="taxi" />
          <HeaderGreeting />

          {/* Compact Active Ride/Booking Banner (Desktop) */}
          {currentRide && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(trackingPath, { state: currentRide })}
              className={`w-full flex items-center justify-between px-5 py-4 rounded-[24px] border text-left shadow-md transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800'
                : 'bg-emerald-50/40 border-emerald-100/60 text-slate-900 hover:bg-emerald-50/75'
                }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[14px] font-bold truncate">
                  You have an active ride
                </span>
              </div>
              <span className="text-[13px] font-black text-emerald-600 dark:text-emerald-400 hover:opacity-80 shrink-0 flex items-center gap-0.5">
                View details <ChevronRight size={15} className="mt-0.5" />
              </span>
            </motion.button>
          )}
          {/* Premium Top Banner */}
          {promoBanner}

          {/* Everything In Minutes Grid */}
          {(!uiSettings?.homeSections || uiSettings.homeSections.enableEverything !== false) && (
            <div>
              <ServiceGrid onLoadServices={setActiveServices} />
            </div>
          )}

          {/* Explore Horizontal List */}
          {exploreSection}

          {/* Go Places Section */}
          {goPlacesSection}
        </div>

        {/* Right Column (Map) */}
        <div className="lg:col-span-7 space-y-6 lg:sticky lg:top-6 self-start">
          {showDeferredSections && isDesktopLayout ? (
            <div className="lg:h-[calc(100vh-14rem)] min-h-[480px]">
              <LocationMapSection />
            </div>
          ) : (
            <div className="lg:h-[calc(100vh-14rem)] min-h-[480px] h-[480px] animate-pulse rounded-[20px] border border-white/80 bg-white/70 shadow-[0_10px_22px_rgba(15,23,42,0.05)]" />
          )}
        </div>

      </div>

      <AnimatePresence>
        {isAllServicesOpen && (
          <AllServicesBottomSheet
            services={activeServices}
            onClose={() => setIsAllServicesOpen(false)}
            onServiceClick={handleServiceClick}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

const AllServicesBottomSheet = ({ services, onClose, onServiceClick }) => {

  useEffect(() => {
    // Reset window and body scroll positions when opening All Services bottom sheet
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // Reset parent/global user app scroll container scroll heights
    const scrollables = document.querySelectorAll('.overflow-y-auto, [class*="overflow-y-auto"], .overflow-y-scroll, .no-scrollbar');
    scrollables.forEach(el => {
      el.scrollTop = 0;
    });
  }, []);

  return (
    <div className="all-services-backdrop flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="all-services-sheet flex flex-col"
        style={{ color: 'var(--user-text-primary)', boxShadow: '0 20px 56px rgba(8,12,20,0.4)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid var(--user-border)' }}>
          <span className="text-[18px] font-bold tracking-tight">All Services</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-95"
            style={{ background: 'var(--user-card-soft)', color: 'var(--user-text-secondary)' }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Services grid — 4 across */}
        <div className="flex-1 overflow-y-auto mt-5 no-scrollbar">
          <div className="grid grid-cols-4 gap-y-5 gap-x-2">
            {services.map((service, index) => {
              const { icon, label, hasImage } = service;
              return (
                <div key={index} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      onServiceClick(service);
                    }}
                    className="flex flex-col items-center group cursor-pointer focus:outline-none"
                  >
                    <div className="service-art h-16 w-16 rounded-[18px] transition-transform duration-200 group-active:scale-95">
                      <ServiceArt src={hasImage ? icon : ''} label={label} hint={label} size={28} imgClassName="h-full w-full object-contain p-2" />
                    </div>
                    <span className="mt-2 max-w-[78px] break-words whitespace-normal text-center text-[12px] font-semibold leading-tight" style={{ color: 'var(--user-text-primary)' }}>
                      {label}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
