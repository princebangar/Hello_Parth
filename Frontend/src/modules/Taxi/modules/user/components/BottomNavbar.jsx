import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IoHome, IoReceipt, IoBus, IoHeadset } from 'react-icons/io5';
import { motion } from 'framer-motion';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { preloadTaxiTab } from './tabPages';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

// Colours, the opaque bar and the yellow active pill all live in index.css
// (.user-bottom-nav-bar / .user-bottom-nav-item) so the nav follows the user theme tokens.
const BottomNavbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings, modules } = useSettings();
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const busModule = (modules || []).find(m => m.service_type === 'bus' || m.name.toLowerCase() === 'bus');
  // An icon the admin uploaded for the Bus module wins; otherwise the same filled icon set as the other tabs.
  const dynamicBusIcon = busModule?.mobile_menu_icon ? normalizeAssetUrl(busModule.mobile_menu_icon) : null;

  const navItems = [
    { icon: IoHome, label: 'Home', path: '/taxi/user' },
    { icon: IoReceipt, label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ icon: IoBus, imageIcon: dynamicBusIcon, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { icon: IoHeadset, label: 'Support', path: '/taxi/user/support' },
  ];

  // No placeholder bar: the real tabs are on screen from the first frame (Home / Rides / Support never depend on settings).
  // Only Bus waits for the settings; it then slides in instead of the whole bar swapping from a skeleton.

  return (
    <nav className="user-bottom-nav pointer-events-none" aria-label="Main navigation">
      <div className="user-bottom-nav-bar pointer-events-auto">
        {navItems.map(({ icon: Icon, imageIcon, label, path }) => {
          const isActive =
            path === '/taxi/user'
              ? pathname === path
              : pathname === path || pathname.startsWith(`${path}/`);

          return (
            <motion.button
              key={label}
              layout="position"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              type="button"
              onClick={() => navigate(path)}
              // the screen's code and first data start loading as soon as a finger lands, not when it lifts
              onPointerDown={() => preloadTaxiTab(path)}
              aria-current={isActive ? 'page' : undefined}
              className={`user-bottom-nav-item outline-none touch-manipulation ${isActive ? 'is-active' : ''}`}
            >
              {/* Same sliding active pill as Food's nav (shared layoutId -> it glides to the tapped tab). */}
              {isActive && (
                <motion.div
                  layoutId="taxi-active-nav-bg"
                  className="user-bottom-nav-pill absolute inset-x-1 inset-y-1 z-0 rounded-[1.5rem]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                {imageIcon ? (
                  <img
                    src={imageIcon}
                    alt=""
                    className={`h-5 w-5 object-contain transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                    style={{ opacity: isActive ? 1 : 0.8 }}
                    draggable={false}
                  />
                ) : (
                  <Icon
                    className={`h-[22px] w-[22px] transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                    aria-hidden="true"
                  />
                )}
                <span className="text-[10px] font-black tracking-tight uppercase leading-none">{label}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavbar;
