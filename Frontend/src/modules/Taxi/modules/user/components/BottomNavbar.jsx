import React, { startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clock, Map, User, BusFront } from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';

const BottomNavbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const showBusService = String(settings.transportRide?.enable_bus_service || '0') === '1';

  const navItems = [
    { icon: Home, label: 'Ride', path: '/taxi/user' },
    { icon: Clock, label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ icon: BusFront, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { icon: Map, label: 'Support', path: '/taxi/user/support' },
    { icon: User, label: 'Profile', path: '/taxi/user/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-[100] px-6 pb-6 pt-2 pointer-events-none">
      <div className="flex items-center justify-around bg-white/70 backdrop-blur-2xl border border-white/40 rounded-[32px] shadow-[0_20px_40px_rgba(0,0,0,0.12)] px-2 py-2 pointer-events-auto relative">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive =
            path === '/taxi/user'
              ? pathname === path || pathname === `${path}/`
              : pathname === path || pathname.startsWith(`${path}/`);

          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (isActive) return;
                startTransition(() => {
                  navigate(path);
                });
              }}
              className="flex-1 flex flex-col items-center justify-center py-1.5 relative z-10 outline-none tap-highlight-transparent group"
            >
              <div className="relative flex flex-col items-center">
                <div
                  className={`absolute -inset-y-2 -inset-x-4 rounded-[20px] transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.25)] opacity-100'
                      : 'opacity-0'
                  }`}
                />

                <div
                  className={`relative z-20 transition-transform duration-150 ${
                    isActive ? 'scale-110 -translate-y-px' : 'scale-100'
                  }`}
                >
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={`transition-colors duration-150 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`}
                  />
                </div>

                <span
                  className={`relative z-20 text-[10px] font-black uppercase tracking-[0.18em] font-['Outfit'] mt-1 transition-colors duration-150 ${
                    isActive ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavbar;
