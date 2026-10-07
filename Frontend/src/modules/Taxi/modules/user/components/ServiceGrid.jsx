import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import { getPageCache, setPageCache, registerPageCacheLifecycle } from '@/shared/utils/pageCache';

registerPageCacheLifecycle();

const SERVICE_MODULES_CACHE_KEY = 'taxi_home_service_modules';
// The session cache above is wiped whenever the tab closes or reloads, so every app open started with grey tiles
// until the request came back. The last list is also kept in localStorage: it is shown at once and the request
// that follows replaces it (stale-while-revalidate).
const SERVICE_MODULES_PERSIST_KEY = 'taxi_service_modules_v1';

const readPersistedModules = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVICE_MODULES_PERSIST_KEY) || 'null');
    return Array.isArray(parsed?.list) && parsed.list.length > 0 ? parsed.list : null;
  } catch {
    return null;
  }
};

const persistModules = (list) => {
  try {
    if (Array.isArray(list) && list.length > 0) {
      localStorage.setItem(SERVICE_MODULES_PERSIST_KEY, JSON.stringify({ at: Date.now(), list }));
    }
  } catch {
    // storage full / blocked - the session cache still works
  }
};

const readModuleList = (response) =>
  response?.data?.data?.results || response?.data?.results || response?.data || [];

/** Downloads the service tiles ahead of time (login screen) so Taxi's first screen has them. Needs no login. */
export const prefetchServiceModules = async () => {
  if (getPageCache(SERVICE_MODULES_CACHE_KEY) || readPersistedModules()) return;
  try {
    // Warm-up read made from the OTHER app (Food): runs behind that screen's own requests.
    const response = await userService.getAppModules({ limit: 100 }, { background: true });
    const list = readModuleList(response);
    if (Array.isArray(list) && list.length > 0) {
      setPageCache(SERVICE_MODULES_CACHE_KEY, list);
      persistModules(list);
    }
  } catch {
    // purely an optimisation
  }
};

const getDynamicImageSrc = (item = {}, fallbackImage) => {
  const rawImage = item.uploadedImage || item.imageUrl || item.image || item.thumbnail || item.icon || null;

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
import { userService } from '../services/userService';
import { X, LayoutGrid } from 'lucide-react';
import ServiceArt from './ServiceArt';

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import deliveryFallback from '../../../assets/user-app/delivery.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import truckFallback from '../../../assets/user-app/truck.png';
import busFallback from '../../../assets/user-app/bus.png';
import fallbackCar from '../../../assets/user-app/fallback-car.png';

const getFallbackIcon = (module = {}) => {
  const name = String(module?.name || '').toLowerCase();
  const serviceType = String(module?.service_type || '').toLowerCase();
  const transportType = String(module?.transport_type || '').toLowerCase();

  if (serviceType === 'bus' || name.includes('bus')) {
    return busFallback;
  }
  if (name.includes('bike')) {
    return bikeFallback;
  }
  if (transportType === 'delivery' || serviceType === 'delivery' || name.includes('delivery')) {
    return deliveryFallback;
  }
  if (name.includes('parcel')) {
    return parcelFallback;
  }
  if (name.includes('truck')) {
    return truckFallback;
  }
  if (name.includes('taxi') || name.includes('cab') || name.includes('ride') || name.includes('normal')) {
    return taxiFallback;
  }
  return fallbackCar;
};

const normalizeModuleText = (value = '') => String(value || '').trim().toLowerCase();

const isDeliveryModule = (module = {}) => {
  const name = normalizeModuleText(module?.name);
  const serviceType = normalizeModuleText(module?.service_type);
  const transportType = normalizeModuleText(module?.transport_type);

  return (
    transportType === 'delivery' ||
    serviceType === 'delivery' ||
    name.includes('delivery') ||
    name.includes('delhivery')
  );
};

const isNormalRideModule = (module = {}) => {
  const name = normalizeModuleText(module?.name);
  const serviceType = normalizeModuleText(module?.service_type);
  const transportType = normalizeModuleText(module?.transport_type);

  if (isDeliveryModule(module)) {
    return false;
  }

  if (['outstation', 'bus', 'pooling'].includes(serviceType)) {
    return false;
  }

  return (
    ['normal', 'taxi', 'ride', 'ride_hailing', 'ride-hailing'].includes(serviceType) ||
    ['taxi', 'both'].includes(transportType) ||
    name.includes('taxi') ||
    name.includes('cab') ||
    name.includes('ride') ||
    name.includes('normal')
  );
};

const getPinnedModuleOrder = (module = {}) => {
  if (isNormalRideModule(module)) return 1;
  if (isDeliveryModule(module)) return 2;
  return null;
};

const Motion = motion;

export const ServiceCard = React.memo(({ icon, label, description, path, loading, isDark, onClick }) => {
  const navigate = useNavigate();
  const [imgSrc, setImgSrc] = useState(icon);

  useEffect(() => {
    setImgSrc(icon);
  }, [icon]);

  if (loading) {
    return (
      <div className={`h-[106px] w-full animate-pulse rounded-[24px] border ${isDark ? 'border-zinc-800/85 bg-zinc-900/60' : 'border-slate-200 bg-slate-100/80'
        }`} />
    );
  }

  const getDynamicSubtitle = () => {
    if (description && description.trim() !== '') {
      return description;
    }
    const cleanLabel = String(label || '').toLowerCase();
    if (cleanLabel.includes('ride') || cleanLabel.includes('cab') || cleanLabel.includes('taxi')) {
      return 'Everyday rides';
    }
    if (cleanLabel.includes('bike')) {
      return 'Beat the traffic';
    }
    if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery') || cleanLabel.includes('courier')) {
      return 'Send anything';
    }
    if (cleanLabel.includes('bus')) {
      return 'Intercity travel';
    }
    if (cleanLabel.includes('pool')) {
      return 'Share your ride';
    }
    return 'Everything in minutes';
  };

  const handleCardClick = () => {
    const cleanLabel = String(label || '').toLowerCase();
    let vehicleType = '';
    if (cleanLabel.includes('bike') || cleanLabel.includes('moto')) vehicleType = 'bike';
    else if (cleanLabel.includes('auto')) vehicleType = 'auto';
    else if (cleanLabel.includes('cab') || cleanLabel.includes('taxi') || cleanLabel.includes('car') || cleanLabel === 'book now' || cleanLabel === 'ride') vehicleType = 'cab';
    else if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery')) vehicleType = 'parcel';

    if (vehicleType) {
      localStorage.setItem('selectedVehicleType', vehicleType);
      console.log('--- TEMPORARY DEBUG LOG ---');
      console.log('selectedVehicleType on click (ServiceCard):', vehicleType);
    } else {
      localStorage.removeItem('selectedVehicleType');
    }

    if (onClick) {
      onClick();
    } else if (path) {
      navigate(path);
    }
  };

  return (
    <motion.button
      type="button"
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={handleCardClick}
      className={`relative overflow-hidden w-full h-[106px] flex items-center justify-between p-4 rounded-[24px] border text-left transition-all duration-300 group shadow-sm ${isDark
          ? 'bg-gradient-to-br from-zinc-900 to-zinc-950/90 border-zinc-800 hover:border-yellow-500/30 hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)]'
          : 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200/70 hover:border-[#FFB300]/30 hover:shadow-[0_8px_16px_rgba(15,23,42,0.04)]'
        }`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.05] pointer-events-none" />

      <div className="flex flex-col justify-center max-w-[58%] pr-1">
        <span className={`text-[10px] sm:text-[11px] font-semibold leading-snug line-clamp-1 opacity-75 uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-slate-500'
          }`}>
          {getDynamicSubtitle()}
        </span>
        <span className={`text-base sm:text-[17px] font-black mt-1 leading-tight tracking-tight line-clamp-2 uppercase ${isDark ? 'text-white group-hover:text-yellow-400' : 'text-slate-900 group-hover:text-[#FFB300]'
          }`}>
          {label}
        </span>
      </div>

      <div className="relative h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 flex items-center justify-center">
        <img
          src={imgSrc}
          alt={label}
          loading="lazy"
          onError={() => {
            const cleanLabel = String(label || '').toLowerCase();
            if (cleanLabel.includes('bus')) {
              setImgSrc(busFallback);
            } else if (cleanLabel.includes('bike')) {
              setImgSrc(bikeFallback);
            } else if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery')) {
              setImgSrc(parcelFallback);
            } else if (cleanLabel.includes('ride') || cleanLabel.includes('cab') || cleanLabel.includes('taxi')) {
              setImgSrc(taxiFallback);
            } else {
              setImgSrc(fallbackCar);
            }
          }}
          className="h-full w-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.15)] transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    </motion.button>
  );
});

const ViewAllCard = React.memo(({ isDark, onClick }) => {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`relative overflow-hidden w-full h-[106px] flex items-center justify-between p-4 rounded-[24px] border text-left transition-all duration-300 group shadow-sm ${isDark
          ? 'bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700/80 hover:border-yellow-500/30 hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)]'
          : 'bg-gradient-to-br from-slate-100 to-slate-200/90 border-slate-300 hover:border-[#FFB300]/30 hover:shadow-[0_8px_16px_rgba(15,23,42,0.04)]'
        }`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.05] pointer-events-none" />

      <div className="flex flex-col justify-center">
        <span className={`text-[10px] sm:text-[11px] font-semibold leading-snug opacity-75 uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-slate-500'
          }`}>
          Explore more
        </span>
        <span className={`text-base sm:text-[17px] font-black mt-1 leading-tight tracking-tight uppercase ${isDark ? 'text-white group-hover:text-yellow-400' : 'text-slate-900 group-hover:text-[#FFB300]'
          }`}>
          All Services
        </span>
      </div>

      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 ${isDark ? 'bg-zinc-700/60' : 'bg-slate-200'
        }`}>
        <LayoutGrid size={24} className={isDark ? 'text-yellow-400' : 'text-[#FFB300]'} strokeWidth={2.5} />
      </div>
    </motion.button>
  );
});

const ServiceCardStretched = React.memo(({ subtitle, title, icon, path, onClick, item }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    const cleanTitle = String(title || '').toLowerCase();
    let vehicleType = '';
    if (cleanTitle.includes('bike') || cleanTitle.includes('moto')) vehicleType = 'bike';
    else if (cleanTitle.includes('auto')) vehicleType = 'auto';
    else if (cleanTitle.includes('cab') || cleanTitle.includes('taxi') || cleanTitle.includes('car') || cleanTitle === 'book now' || cleanTitle === 'ride') vehicleType = 'cab';
    else if (cleanTitle.includes('parcel') || cleanTitle.includes('delivery')) vehicleType = 'parcel';

    if (vehicleType) {
      localStorage.setItem('selectedVehicleType', vehicleType);
    } else {
      localStorage.removeItem('selectedVehicleType');
    }

    if (onClick) {
      onClick();
    } else if (path) {
      navigate(path);
    }
  };

  const isAllServices = String(title || '').toLowerCase().includes('all services');
  // The admin's tile image wins, then the module's own icon; with neither, ServiceArt draws a glyph.
  const artSrc = getDynamicImageSrc(item || {}, icon || '');
  const showSubtitle = subtitle && String(subtitle).toLowerCase() !== String(title || '').toLowerCase();

  return (
    <button type="button" onClick={handleCardClick} className="everything-card group">
      <div className="everything-card-content">
        {showSubtitle && <span>{subtitle}</span>}
        <h3>{title}</h3>
      </div>

      <div className="everything-card-art service-art">
        {isAllServices ? (
          <LayoutGrid className="service-art-glyph" size={26} strokeWidth={2} aria-hidden="true" />
        ) : (
          <ServiceArt src={artSrc} label={title} hint={title} />
        )}
      </div>
    </button>
  );
});

const defaultSettings = {
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Car Taxi', subtitle: 'Everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' }
  ]
};

const ServiceGrid = ({
  showAllModal: parentShowAllModal,
  setShowAllModal: parentSetShowAllModal,
  isAllServicesOpen,
  setIsAllServicesOpen,
  onLoadServices
}) => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const cachedModules = getPageCache(SERVICE_MODULES_CACHE_KEY) || readPersistedModules();
  const [modules, setModules] = useState(cachedModules || []);
  const [loading, setLoading] = useState(!cachedModules);
  const [localShowAllModal, localSetShowAllModal] = useState(false);

  const showAllModal = isAllServicesOpen !== undefined
    ? isAllServicesOpen
    : (parentShowAllModal !== undefined ? parentShowAllModal : localShowAllModal);

  const setShowAllModal = setIsAllServicesOpen !== undefined
    ? setIsAllServicesOpen
    : (parentSetShowAllModal !== undefined ? parentSetShowAllModal : localSetShowAllModal);

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
    return null;
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
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [settings?.userHomeSettings]);

  useEffect(() => {
    const handleOpenModal = () => {
      setShowAllModal(true);
    };
    window.addEventListener('helloparth:open-all-services-modal', handleOpenModal);
    return () => window.removeEventListener('helloparth:open-all-services-modal', handleOpenModal);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchModules = async () => {
      // Cached list is already showing (if any) — don't flash a loading
      // state back on for a silent background refresh.
      if (!cachedModules) setLoading(true);
      try {
        const response = await userService.getAppModules({ limit: 100 });
        const list = readModuleList(response);
        if (isMounted) {
          setModules(list);
          setPageCache(SERVICE_MODULES_CACHE_KEY, list);
          persistModules(list);
        }
      } catch (error) {
        console.error('[ServiceGrid] Failed to fetch modules dynamically:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchModules();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getServiceKey = (service, index) => {
    const label = String(service?.label || '').trim();
    const path = String(service?.path || '').trim();
    return label || path ? `${label || 'service'}-${path || index}` : `service-${index}`;
  };

  const getPath = (module) => {
    const serviceType = String(module?.service_type || '').trim().toLowerCase();
    const transportType = String(module?.transport_type || '').trim().toLowerCase();
    const moduleName = String(module?.name || '').trim().toLowerCase();

    if (transportType === 'delivery') return '/taxi/user/parcel/type';
    if (serviceType === 'outstation') return '/taxi/user/intercity';
    if (serviceType === 'pooling' || moduleName.includes('pooling')) {
      return '/taxi/user/pooling';
    }

    if (serviceType === 'bus' || transportType === 'bus' || moduleName.includes('bus')) {
      return '/taxi/user/bus';
    }

    if (
      ['normal', 'taxi', 'ride', 'ride_hailing', 'ride-hailing'].includes(serviceType) ||
      ['taxi', 'both'].includes(transportType) ||
      moduleName.includes('taxi') ||
      moduleName.includes('cab')
    ) {
      return '/taxi/user/ride/select-location';
    }

    return '/taxi/user/ride/select-location';
  };

  const getAccent = (index) => {
    const accnets = [
      'bg-[linear-gradient(135deg,#FFF7ED_0%,#FFE5C2_100%)]',
      'bg-[linear-gradient(135deg,#FEFCE8_0%,#FDE68A_100%)]',
      'bg-[linear-gradient(135deg,#EFF6FF_0%,#DBEAFE_100%)]',
      'bg-[linear-gradient(135deg,#F5F3FF_0%,#E9D5FF_100%)]',
      'bg-[linear-gradient(135deg,#ECFDF5_0%,#A7F3D0_100%)]',
      'bg-[linear-gradient(135deg,#FFF1F2_0%,#FECDD3_100%)]',
    ];
    return accnets[index % accnets.length];
  };

  const isParcelModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return (
      name.includes('parcel') ||
      name.includes('courier') ||
      transportType === 'delivery' ||
      serviceType === 'delivery'
    );
  };

  const isBikeModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return (
      name.includes('bike') ||
      name.includes('moto') ||
      serviceType === 'bike' ||
      transportType === 'bike'
    );
  };

  const isRideModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return (
      !isParcelModule(module) &&
      !isBikeModule(module) &&
      (
        name.includes('ride') ||
        name.includes('cab') ||
        name.includes('taxi') ||
        serviceType === 'normal' ||
        transportType === 'taxi'
      )
    );
  };

  const activeModules = React.useMemo(() => {
    return (modules || []).filter(
      (m) => m.active === 1 || m.active === true || String(m.active) === '1' || String(m.active) === 'true'
    );
  }, [modules]);

  const parcelModule = activeModules.find(isParcelModule);
  const bikeModule = activeModules.find(isBikeModule);
  const rideModule = activeModules.find(isRideModule);

  const parcelActive = !!parcelModule;
  const bikeActive = !!bikeModule;
  const rideActive = !!rideModule;
  const showAsymmetricGrid = parcelActive && bikeActive && rideActive;

  const sortedModules = React.useMemo(() => {
    return activeModules
      .slice()
      .sort((a, b) => {
        const pinnedA = getPinnedModuleOrder(a);
        const pinnedB = getPinnedModuleOrder(b);

        if (pinnedA !== null || pinnedB !== null) {
          if (pinnedA === null) return 1;
          if (pinnedB === null) return -1;
          if (pinnedA !== pinnedB) return pinnedA - pinnedB;
        }

        const orderA = Number(a?.order_by);
        const orderB = Number(b?.order_by);
        const hasOrderA = Number.isFinite(orderA);
        const hasOrderB = Number.isFinite(orderB);

        if (hasOrderA && hasOrderB && orderA !== orderB) {
          return orderA - orderB;
        }

        if (hasOrderA !== hasOrderB) {
          return hasOrderA ? -1 : 1;
        }

        return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
      });
  }, [activeModules]);

  const services = React.useMemo(() => {
    return sortedModules.map((m, idx) => {
      const apiIcon = normalizeAssetUrl(m.mobile_menu_icon || m.uploadedImage || m.imageUrl || m.image);
      const serviceTypeDisplay = String(m.service_type || '').toUpperCase();
      const transportTypeDisplay = String(m.transport_type || '').toUpperCase();
      const typeLabel = serviceTypeDisplay && transportTypeDisplay
        ? `${serviceTypeDisplay} • ${transportTypeDisplay}`
        : serviceTypeDisplay || transportTypeDisplay || 'SERVICE';

      return {
        icon: apiIcon && apiIcon.trim() !== '' ? apiIcon : getFallbackIcon(m),
        hasImage: !!(apiIcon && apiIcon.trim() !== ''),
        label: m.name,
        description: typeLabel,
        path: getPath(m),
        accentClass: getAccent(idx),
        rawModule: m,
      };
    });
  }, [sortedModules]);

  useEffect(() => {
    if (onLoadServices) {
      onLoadServices(services);
    }
  }, [services, onLoadServices]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 280,
        damping: 24,
      },
    },
  };

  return (
    <div className="w-full">
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="py-1"
      >
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="user-section-title">
            Everything In Minutes
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-full animate-pulse rounded-[20px] h-[114px]" style={{ background: 'var(--user-card-soft)' }} />
            ))}
          </div>
        ) : (() => {
          const activeItems = (uiSettings?.everything || defaultSettings.everything)
            .filter(item => item.status === 'active' || item.status === true)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

          return (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="everything-grid grid grid-cols-2 gap-3"
            >
              {activeItems.map((item, idx) => {
                const isAllServices = String(item.title || '').toLowerCase().includes('all services');
                const isParcel = String(item.title || '').toLowerCase().includes('parcel');
                const isBike = String(item.title || '').toLowerCase().includes('bike');
                const isBook = /book|ride|car|cab|taxi/.test(String(item.title || '').toLowerCase());

                const moduleIcon = (module) => normalizeAssetUrl(module?.mobile_menu_icon);
                const fallbackIcon = isParcel ? moduleIcon(parcelModule)
                  : isBike ? moduleIcon(bikeModule)
                    : isBook ? moduleIcon(rideModule)
                      : '';

                const clickHandler = () => {
                  const clickRoute = item.actionRoute || item.route;
                  if (clickRoute === "ALL_SERVICES_MODAL" || isAllServices) {
                    setShowAllModal(true);
                  } else if (clickRoute) {
                    navigate(clickRoute);
                  } else {
                    const fallbackRoute = isParcel ? '/taxi/user/parcel/type' : '/taxi/user/ride/select-location';
                    const isSelectLocationRoute = fallbackRoute.includes('/ride/select-location');

                    if (isSelectLocationRoute) {
                      const category = isBike ? 'bike' : 'car';
                      navigate(fallbackRoute, { state: { selectedCategory: category, flow: 'ride', activeInput: 'drop' } });
                    } else {
                      navigate(fallbackRoute);
                    }
                  }
                };

                return (
                  <motion.div key={item.id || idx} variants={itemVariants} className="col-span-1">
                    <ServiceCardStretched
                      title={item.title}
                      subtitle={item.subtitle}
                      icon={fallbackIcon}
                      onClick={clickHandler}
                      item={item}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          );
        })()}
      </motion.section>
    </div>
  );
};

export default ServiceGrid;
