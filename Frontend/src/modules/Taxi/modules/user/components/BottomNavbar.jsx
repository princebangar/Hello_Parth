import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clock, Map } from 'lucide-react';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import busIcon from '../../../assets/3d images/AutoCab/bus.png';

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
  const { settings, modules, loading, hasBootstrapSettings } = useSettings();
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const busModule = (modules || []).find(m => m.service_type === 'bus' || m.name.toLowerCase() === 'bus');
  const dynamicBusIcon = busModule?.mobile_menu_icon ? normalizeAssetUrl(busModule.mobile_menu_icon) : busIcon;
  const showNavSkeleton = loading && !hasBootstrapSettings;

  const navItems = [
    { icon: Home, label: 'Ride', path: '/taxi/user' },
    { icon: Clock, label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ imageIcon: dynamicBusIcon, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { icon: Map, label: 'Support', path: '/taxi/user/support' },
  ];

  if (showNavSkeleton) {
    return (
      <nav className="user-bottom-nav pointer-events-none" aria-hidden="true">
        <div className="user-bottom-nav-bar pointer-events-auto">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="user-bottom-nav-item">
              <div className="h-[22px] w-[22px] animate-pulse rounded-full" style={{ background: 'var(--user-card-soft)' }} />
              <div className="h-2.5 w-9 animate-pulse rounded-full" style={{ background: 'var(--user-card-soft)' }} />
            </div>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="user-bottom-nav pointer-events-none" aria-label="Main navigation">
      <div className="user-bottom-nav-bar pointer-events-auto">
        {navItems.map(({ icon: Icon, imageIcon, label, path }) => {
          const isActive =
            path === '/taxi/user'
              ? pathname === path
              : pathname === path || pathname.startsWith(`${path}/`);

          return (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              aria-current={isActive ? 'page' : undefined}
              className={`user-bottom-nav-item outline-none ${isActive ? 'is-active' : ''}`}
            >
              {imageIcon ? (
                <img
                  src={imageIcon}
                  alt=""
                  className="h-5 w-5 object-contain"
                  style={{ opacity: isActive ? 1 : 0.8 }}
                  draggable={false}
                />
              ) : (
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} color="currentColor" />
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavbar;
