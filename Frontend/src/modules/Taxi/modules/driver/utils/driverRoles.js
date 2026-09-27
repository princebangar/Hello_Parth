import { Briefcase, BusFront, CarFront, Users } from 'lucide-react';

// The four partner roles that sign in through the driver / owner portal. The login, OTP and role-selection
// screens all render from this list so the wording, icons and routing stay in one place.
export const DRIVER_ROLES = [
  {
    id: 'driver',
    label: 'Taxi Driver',
    description: 'Rides and parcel deliveries',
    Icon: CarFront,
    accent: '#d97706',
    tint: 'rgba(245, 158, 11, 0.14)',
  },
  {
    id: 'owner',
    label: 'Fleet Owner',
    description: 'Vehicles and attached drivers',
    Icon: Briefcase,
    accent: '#059669',
    tint: 'rgba(16, 185, 129, 0.14)',
  },
  {
    id: 'pooling_driver',
    label: 'Pooling Driver',
    description: 'Shared seats on fixed routes',
    Icon: Users,
    accent: '#7c3aed',
    tint: 'rgba(139, 92, 246, 0.14)',
  },
  {
    id: 'bus_driver',
    label: 'Bus Driver',
    description: 'Bus service and bookings',
    Icon: BusFront,
    accent: '#0284c7',
    tint: 'rgba(14, 165, 233, 0.14)',
  },
];

export const DEFAULT_DRIVER_ROLE = 'driver';
const LAST_LOGIN_ROLE_KEY = 'driverLoginRole';

export const normalizeDriverRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (['pooling_driver', 'pooling-driver', 'poolingdriver', 'pooling'].includes(normalized)) return 'pooling_driver';
  if (['bus_driver', 'bus-driver', 'busdriver', 'bus'].includes(normalized)) return 'bus_driver';
  return DEFAULT_DRIVER_ROLE;
};

export const isDriverRole = (role) => DRIVER_ROLES.some((item) => item.id === String(role || '').trim().toLowerCase());

export const getDriverRole = (role) =>
  DRIVER_ROLES.find((item) => item.id === normalizeDriverRole(role)) || DRIVER_ROLES[0];

// Owners live under /taxi/owner/*, every other partner role under /taxi/driver/*.
export const getRoutePrefixForRole = (role) =>
  normalizeDriverRole(role) === 'owner' ? '/taxi/owner' : '/taxi/driver';

export const readLastLoginRole = () => {
  try {
    const stored = localStorage.getItem(LAST_LOGIN_ROLE_KEY);
    return isDriverRole(stored) ? stored : '';
  } catch {
    return '';
  }
};

export const rememberLoginRole = (role) => {
  try {
    localStorage.setItem(LAST_LOGIN_ROLE_KEY, normalizeDriverRole(role));
  } catch {
    // private mode / blocked storage — the picker just falls back to the default role
  }
};
