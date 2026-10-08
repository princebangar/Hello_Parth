import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  FOOD_ADMIN_HOME,
  GLOBAL_ADMIN_HOME,
  TAXI_ADMIN_HOME,
  prefetchFoodAdmin,
  prefetchTaxiAdmin,
} from '@/shared/utils/activeModule.js';
import { getAdminHomePath, getModuleAccess } from '@/shared/utils/adminAccess.js';
import { POOLING_ENABLED } from '../../../shared/featureFlags';
import { socketService } from '../../../shared/api/socket';
import { warmAdminPages } from '@/shared/utils/warmAdminPages.js';
import { useSettings } from '../../../shared/context/SettingsContext';
import { getSupportConversations, markSupportMessagesRead } from '../../shared/chat/chatApi';
import { adminService } from '../services/adminService';
import { hasAdminPermission } from '../constants/adminAccess';
import {
  clearUnifiedAdminSession,
  getUnifiedAdminProfile,
  syncAdminSessionBridge,
} from '../services/adminSession';
import toast from 'react-hot-toast';
import {
  Ban,
  BarChart3,
  Bell,
  Briefcase,
  Car,
  Bus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  Home,
  IndianRupee,
  Layers,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  PlusCircle,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DEFAULT_BRAND_LOGO } from '@/shared/constants/brandLogo';
import AdminThemeToggle from '@/shared/components/AdminThemeToggle';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const ADMIN_MODE = 'admin';
const OWNER_MODE = 'owner';
const MODE_STORAGE_KEY = 'adminPanelMode';
const SIDEBAR_EXPANSION_STORAGE_KEY = 'adminSidebarExpandedGroups';
const NOTIFICATION_DISMISS_STORAGE_KEY = 'adminNotificationDismissals';

const pathMatches = (pathname, targetPath) =>
  pathname === targetPath || pathname.startsWith(`${targetPath}/`);

const hasActiveChild = (pathname, items = []) =>
  items.some((item) => {
    if (item.path && pathMatches(pathname, item.path)) return true;
    if (item.subItems) return hasActiveChild(pathname, item.subItems);
    return false;
  });

// The Taxi menu used to put ~13 unrelated things under "Home". Items keep their own definitions (paths,
// permissions, sub-items); this only decides which section heading each top-level item sits under, in order.
const ADMIN_SECTION_LAYOUT = [
  { title: 'Home', labels: ['Dashboard', 'Admin Earnings', 'Chat'] },
  { title: 'Operations', labels: ['Trip Requests', 'Ongoing Requests', 'User SOS', 'Driver SOS', 'Delivery Requests', 'Cancellation Analytics', 'Geofencing', 'Bus Service', 'Car Pooling'] },
  { title: 'People', labels: ['Customer Management', 'Driver Management', 'Owner Management'] },
  { title: 'Pricing & Services', labels: ['Price Management'] },
  { title: 'Marketing', labels: ['Broadcast Notifications', 'Promotions Management'] },
  { title: 'Finance & Support', labels: ['Wallet Payment', 'Report', 'Support Management'] },
  { title: 'Masters & Settings', labels: ['Language', 'Vehicle Preferences', 'Business Settings', 'App Settings'] },
];

const organizeAdminSections = (sections = []) => {
  const byLabel = new Map();
  sections.forEach((section) => (section.items || []).forEach((item) => byLabel.set(item.label, item)));
  const used = new Set();
  const organized = ADMIN_SECTION_LAYOUT.map(({ title, labels }) => ({
    title,
    items: labels.map((label) => {
      const item = byLabel.get(label);
      if (item) used.add(label);
      return item;
    }).filter(Boolean),
  })).filter((section) => section.items.length > 0);

  // Anything not named above (a future menu item) must never disappear — keep it under "More".
  const leftovers = [];
  sections.forEach((section) => (section.items || []).forEach((item) => {
    if (!used.has(item.label)) leftovers.push(item);
  }));
  if (leftovers.length > 0) organized.push({ title: 'More', items: leftovers });
  return organized;
};

// Keys of every group that contains the current page, so the sidebar opens to it automatically.
const collectActiveGroupKeys = (sections = [], pathname = '') => {
  const keys = [];
  const walk = (items, parentKey) => {
    items.forEach((item) => {
      if (!item.subItems || !hasActiveChild(pathname, item.subItems)) return;
      const key = `${parentKey}:${item.label}`;
      keys.push(key);
      walk(item.subItems, key);
    });
  };
  sections.forEach((section) => walk(section.items || [], section.title));
  return keys;
};

const flattenItems = (sections = []) =>
  sections.flatMap((section) => section.items ?? []);

const flattenSearchEntries = (items = [], parentLabels = []) =>
  items.flatMap((item) => {
    const currentTrail = [...parentLabels, item.label].filter(Boolean);

    if (item.path) {
      return [
        {
          label: item.label,
          path: item.path,
          trail: parentLabels,
          keywords: currentTrail.join(' ').toLowerCase(),
        },
      ];
    }

    if (item.subItems) {
      return flattenSearchEntries(item.subItems, currentTrail);
    }

    return [];
  });

const filterSidebarItemsBySearch = (items = [], query = '') => {
  if (!query) return items;

  return items.flatMap((item) => {
    const labelMatch = String(item.label || '').toLowerCase().includes(query);

    if (item.subItems) {
      const filteredChildren = filterSidebarItemsBySearch(item.subItems, query);
      if (labelMatch) return [item];
      if (filteredChildren.length > 0) return [{ ...item, subItems: filteredChildren }];
      return [];
    }

    return labelMatch ? [item] : [];
  });
};

const readAdminProfile = () => {
  if (typeof window === 'undefined') {
    return { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  }

  try {
    const parsed = getUnifiedAdminProfile();
    return parsed || { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  } catch {
    return { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  }
};

const filterSidebarItemsByAccess = (items = [], adminProfile = {}) =>
  items.flatMap((item) => {
    const selfAllowed = !item.permission || hasAdminPermission(adminProfile, item.permission);

    if (item.subItems) {
      const filteredSubItems = filterSidebarItemsByAccess(item.subItems, adminProfile);
      if (!selfAllowed && filteredSubItems.length === 0) {
        return [];
      }
      if (filteredSubItems.length === 0) {
        return [];
      }
      return [{ ...item, subItems: filteredSubItems }];
    }

    return selfAllowed ? [item] : [];
  });

const filterSidebarSectionsByAccess = (sections = [], adminProfile = {}) =>
  sections
    .map((section) => ({
      ...section,
      items: filterSidebarItemsByAccess(section.items || [], adminProfile),
    }))
    .filter((section) => section.items.length > 0);

const NOTIFICATION_PAGE_SIZE = 5;

const readDismissedNotifications = () => {
  if (typeof window === 'undefined') {
    return { ride_requests: [], bookings: [], chats: [] };
  }

  try {
    const saved = window.localStorage.getItem(NOTIFICATION_DISMISS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};

    return {
      ride_requests: Array.isArray(parsed?.ride_requests) ? parsed.ride_requests : [],
      bookings: Array.isArray(parsed?.bookings) ? parsed.bookings : [],
      chats: Array.isArray(parsed?.chats) ? parsed.chats : [],
    };
  } catch {
    return { ride_requests: [], bookings: [], chats: [] };
  }
};

const getNotificationEntryId = (tab, item = {}) => {
  if (tab === 'ride_requests') {
    return String(item.id || item.requestId || '').trim();
  }

  if (tab === 'bookings') {
    return String(item._id || item.id || item.booking_reference || '').trim();
  }

  return String(item.id || '').trim();
};

// Short two-beep tone for live admin alerts (SOS, new chat). Silent where the browser blocks audio before a click.
const playAdminAlertTone = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // no sound is fine
  }
};

const dedupeAdminChatNotifications = (items = []) => {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(item.id || '').trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const formatRelativeAdminTime = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
};

const looksLikeCoordinateLabel = (value = '') =>
  /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(value || '').trim());

const formatAdminNotificationLocation = (value, fallback) => {
  const text = String(value || '').trim();

  if (!text || looksLikeCoordinateLabel(text)) {
    return fallback;
  }

  return text;
};

const resolvePageTitle = (pathname, sections, appName) => {
  const findLabel = (items = []) => {
    for (const item of items) {
      if (item.path && pathMatches(pathname, item.path)) return item.label;
      if (item.subItems) {
        const nested = findLabel(item.subItems);
        if (nested) return nested;
      }
    }
    return null;
  };

  const label = findLabel(flattenItems(sections));
  if (label) return label;
  if (pathname.includes('/owners')) return 'Owner Management';
  if (pathname.includes('/fleet')) return 'Fleet Management';
  if (pathname.includes('/settings')) return 'Settings';
  if (pathname.includes('/reports')) return 'Reports';
  return `${appName || 'App'} Admin`;
};

const normalizeHexColor = (value, fallback = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;

  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortHexMatch = withHash.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (/^#([0-9a-fA-F]{6})$/.test(withHash)) {
    return withHash.toUpperCase();
  }

  return fallback;
};

const getSidebarItemCount = (item, unreadCountsByPath = {}) => {
  if (item?.path) {
    return Math.max(0, Number(unreadCountsByPath[item.path] || 0));
  }

  if (Array.isArray(item?.subItems)) {
    return item.subItems.reduce((sum, child) => sum + getSidebarItemCount(child, unreadCountsByPath), 0);
  }

  return 0;
};

const SidebarBadge = ({ count, isActive = false }) => {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`ml-auto inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-black ${
        isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

// The sidebar highlights the page you just clicked immediately ("optimistic" active path) instead of waiting for
// the route (and its lazy chunk) to finish loading. Before, the OLD item stayed lit for a second after a click.
const SidebarNavContext = createContext({ activePath: '', onNavigate: () => {}, focusedGroupKey: null, setFocusedGroupKey: () => {} });

const normalizeSidebarPath = (value = '') => String(value || '').split('?')[0].replace(/\/+$/, '') || '/';
const isSidebarPathActive = (activePath, to) => normalizeSidebarPath(activePath) === normalizeSidebarPath(to);

const SidebarLink = ({ to, className, activeClassName, idleClassName, children }) => {
  const { activePath, onNavigate } = useContext(SidebarNavContext);
  const active = isSidebarPathActive(activePath, to);

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(to)}
      className={cn("outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]", className, active ? activeClassName : idleClassName)}
    >
      {children}
    </Link>
  );
};

const SidebarItem = ({ icon, label, path, isCollapsed, sidebarTextColor, unreadCount = 0 }) => (
  <SidebarLink
    to={path}
    className="group flex items-center gap-3 px-4 py-2.5 rounded-xl relative outline-none focus:outline-none focus-visible:outline-none"
    activeClassName="bg-white/10 text-white"
    idleClassName="text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
  >
    {React.createElement(icon, { size: 18, className: 'shrink-0' })}
    {!isCollapsed && <span className="min-w-0 flex-1 text-[14px] font-bold tracking-tight">{label}</span>}
    {!isCollapsed && (
      <SidebarBadge count={unreadCount} />
    )}
  </SidebarLink>
);

// After a sidebar group is opened, bring the whole group (heading + its rows) to the middle of the sidebar.
const centreGroupInSidebar = (el) => {
  if (!el) return;
  let nav = el.parentElement;
  while (nav && !(nav.scrollHeight > nav.clientHeight && /(auto|scroll)/.test(getComputedStyle(nav).overflowY))) {
    nav = nav.parentElement;
  }
  if (!nav) return;
  const navRect = nav.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const offsetTop = rect.top - navRect.top + nav.scrollTop;
  const top = rect.height >= navRect.height
    ? offsetTop - 8
    : offsetTop - (navRect.height - rect.height) / 2;
  const max = Math.max(0, nav.scrollHeight - nav.clientHeight);
  nav.scrollTo({ top: Math.max(0, Math.min(top, max)), behavior: 'smooth' });
};

const SidebarGroup = ({
  icon,
  label,
  subItems,
  isCollapsed,
  pathname,
  forceOpen = false,
  groupKey,
  expandedGroups,
  setExpandedGroups,
  sidebarTextColor,
  unreadCountsByPath,
}) => {
  const { focusedGroupKey, setFocusedGroupKey } = useContext(SidebarNavContext);
  // A group heading you just clicked takes the highlight; the page that was open stops looking selected.
  const isFocused = focusedGroupKey === groupKey;
  const isActive = focusedGroupKey ? isFocused : hasActiveChild(pathname, subItems);
  const isOpen = expandedGroups.includes(groupKey);
  const isExpanded = forceOpen || isOpen;
  const unreadCount = subItems.reduce((sum, item) => sum + getSidebarItemCount(item, unreadCountsByPath), 0);
  const groupRef = useRef(null);
  const toggleGroup = () => {
    setExpandedGroups((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    );
    setFocusedGroupKey(isOpen ? null : groupKey);
    if (!isOpen) requestAnimationFrame(() => requestAnimationFrame(() => centreGroupInSidebar(groupRef.current)));
  };

  return (
    <div ref={groupRef} className="space-y-1">
      <button
        type="button"
        onClick={toggleGroup}
        className={cn(
          "group w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors duration-100 outline-none focus:outline-none focus-visible:outline-none",
          isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200",
          isFocused ? "bg-white/10" : "hover:bg-white/5"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {React.createElement(icon, {
            size: 18,
            className: 'shrink-0',
          })}
          {!isCollapsed && <span className="truncate text-[14px] font-bold tracking-tight">{label}</span>}
        </div>
        {!isCollapsed && (
          <div className="ml-3 flex items-center gap-2">
            <SidebarBadge count={unreadCount} isActive={isActive} />
            <ChevronRight size={14} className={cn("transition-transform duration-300", isExpanded && "rotate-90")} />
          </div>
        )}
      </button>

      {!isCollapsed && isExpanded && (
        <div className="pl-6 pr-2 space-y-1">
          {subItems.map((item) =>
            item.subItems ? (
              <NestedGroup
                key={item.label}
                label={item.label}
                subItems={item.subItems}
                pathname={pathname}
                forceOpen={forceOpen}
                groupKey={`${groupKey}:${item.label}`}
                expandedGroups={expandedGroups}
                setExpandedGroups={setExpandedGroups}
                sidebarTextColor={sidebarTextColor}
                unreadCountsByPath={unreadCountsByPath}
              />
            ) : (
              <SidebarLink
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors duration-100"
                activeClassName="bg-white/10 text-white font-semibold"
                idleClassName="text-neutral-500 hover:text-neutral-200 hover:bg-white/5"
              >
                <div className="h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
                <span className="min-w-0 flex-1">{item.label}</span>
                <SidebarBadge count={getSidebarItemCount(item, unreadCountsByPath)} />
              </SidebarLink>
            )
          )}
        </div>
      )}
    </div>
  );
};

const NestedGroup = ({
  label,
  subItems,
  pathname,
  forceOpen = false,
  groupKey,
  expandedGroups,
  setExpandedGroups,
  sidebarTextColor,
  unreadCountsByPath,
}) => {
  const { focusedGroupKey, setFocusedGroupKey } = useContext(SidebarNavContext);
  // A group heading you just clicked takes the highlight; the page that was open stops looking selected.
  const isFocused = focusedGroupKey === groupKey;
  const isActive = focusedGroupKey ? isFocused : hasActiveChild(pathname, subItems);
  const isOpen = expandedGroups.includes(groupKey);
  const isExpanded = forceOpen || isOpen;
  const unreadCount = subItems.reduce((sum, item) => sum + getSidebarItemCount(item, unreadCountsByPath), 0);
  const groupRef = useRef(null);
  const toggleGroup = () => {
    setExpandedGroups((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    );
    setFocusedGroupKey(isOpen ? null : groupKey);
    if (!isOpen) requestAnimationFrame(() => requestAnimationFrame(() => centreGroupInSidebar(groupRef.current)));
  };

  return (
    <div ref={groupRef} className="space-y-1">
      <button
        type="button"
        onClick={toggleGroup}
        className={cn(
          "group w-full flex items-center justify-between px-3 py-1.5 rounded-xl transition-colors duration-100 outline-none focus:outline-none focus-visible:outline-none",
          isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200",
          isFocused ? "bg-white/10" : "hover:bg-white/5"
        )}
      >
        <span className="flex min-w-0 items-center gap-3 text-[12px] font-medium">
          <div className={cn("h-1 w-1 shrink-0 rounded-full", isActive ? "bg-white" : "bg-neutral-600")} />
          <span className="truncate">{label}</span>
        </span>
        <span className="ml-3 flex items-center gap-2">
          <SidebarBadge count={unreadCount} isActive={isActive} />
          <ChevronRight size={12} className={cn("transition-transform duration-300", isExpanded && "rotate-90")} />
        </span>
      </button>

      {isExpanded && (
        <div className="pl-4 space-y-1">
          {subItems.map((item) => (
            <SidebarLink
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors duration-100"
              activeClassName="bg-white/10 text-white font-semibold"
              idleClassName="text-neutral-500 hover:text-neutral-200 hover:bg-white/5"
            >
              <div className="h-0.5 w-0.5 shrink-0 rounded-full bg-neutral-700" />
              <span className="min-w-0 flex-1">{item.label}</span>
              <SidebarBadge count={getSidebarItemCount(item, unreadCountsByPath)} />
            </SidebarLink>
          ))}
        </div>
      )}
    </div>
  );
};

const ModeSwitcher = ({ mode, setMode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { id: ADMIN_MODE, label: 'Admin', subtitle: 'Core control panel' },
    { id: OWNER_MODE, label: 'Owner', subtitle: 'Owner management modules' },
  ];

  const active = options.find((option) => option.id === mode) || options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-2 shadow-sm transition-all hover:border-amber-400/30 hover:shadow-md active:scale-95"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
          <Briefcase size={16} />
        </div>
        <div className="text-left leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Panel Mode</p>
          <p className="text-[13px] font-extrabold text-neutral-900">{active.label}</p>
        </div>
        <ChevronDown size={14} className="text-neutral-300 transition-transform group-hover:text-amber-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-2 shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((option) => {
            const selected = option.id === mode;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setMode(option.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                  selected ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'hover:bg-neutral-50'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    selected ? 'bg-white' : 'bg-neutral-300'
                  }`}
                />
                <span className="flex-1">
                  <span className={`block text-[13px] font-bold ${selected ? 'text-white' : 'text-neutral-900'}`}>
                    {option.label}
                  </span>
                  <span className={`block text-[11px] ${selected ? 'text-amber-100' : 'text-neutral-500'}`}>
                    {option.subtitle}
                  </span>
                </span>
                {selected && <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AdminContentSkeleton = () => (
  <div className="w-full flex-1 min-h-[500px] space-y-6 animate-in fade-in duration-300">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/60 relative">
      <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-orange-400 via-indigo-500 to-emerald-400 animate-pulse" />
    </div>
    <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-lg bg-slate-200/80 animate-pulse" />
        <div className="h-4 w-72 rounded-lg bg-slate-100 animate-pulse" />
      </div>
      <div className="h-10 w-32 rounded-xl bg-slate-200/80 animate-pulse" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
          <div className="h-8 w-16 rounded-lg bg-slate-200/80 animate-pulse" />
        </div>
      ))}
    </div>
    <div className="min-h-[320px] rounded-3xl border border-slate-100 bg-white p-8 shadow-sm flex flex-col items-center justify-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Loader2 size={24} className="animate-spin text-indigo-600" />
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Section...</p>
    </div>
  </div>
);

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const adminThemeColor = normalizeHexColor(settings.customization?.admin_theme_color, '#405189');
  const sidebarTextColor = normalizeHexColor(settings.customization?.sidebar_text_color, '#CBD5E1');
  const [isSidebarOpen] = useState(true);
  const [isCollapsed, setCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState('ride_requests');
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [rideRequestFeed, setRideRequestFeed] = useState({
    results: [],
    paginator: { current_page: 1, last_page: 1, total: 0 },
  });
  const [bookingsFeed, setBookingsFeed] = useState([]);
  const [chatNotifications, setChatNotifications] = useState([]);
  const seenChatNotificationIdsRef = useRef(new Set());
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  // Things waiting for the admin (driver/owner sign-ups, open tickets, re-uploaded documents). They leave the
  // list once handled, so they are not dismissable like the activity feeds.
  const [pendingRequests, setPendingRequests] = useState({ results: [], total: 0 });
  const [rideRequestPage, setRideRequestPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState(() => readDismissedNotifications());
  const [pendingSidebarPath, setPendingSidebarPath] = useState(null);
  const [focusedGroupKey, setFocusedGroupKey] = useState(null);
  const [expandedSidebarGroups, setExpandedSidebarGroups] = useState(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const saved = window.localStorage.getItem(SIDEBAR_EXPANSION_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const userMenuRef = useRef(null);
  const notificationsMenuRef = useRef(null);
  const [adminProfile, setAdminProfile] = useState(() => readAdminProfile());
  // Which modules this admin may open (Food / Taxi / Global) — from the server-computed access, so a global
  // sub-admin with only some of them sees only those tabs.
  const moduleAccess = getModuleAccess(adminProfile);
  const showFoodTab = moduleAccess.food;
  const showTaxiTab = moduleAccess.taxi;
  const showGlobalTab = moduleAccess.global;

  const appName = settings.general?.app_name || 'App';

  useEffect(() => {
    if (showFoodTab) prefetchFoodAdmin();
  }, [showFoodTab]);

  const switchAdminModule = (path) => {
    const go = () => {
      startTransition(() => {
        navigate(path);
      });
    };

    // Wait for sibling chunks so the first Food ↔ Taxi switch has no blank flash.
    // Global lives in the Food admin shell, so it needs the same chunk warm-up.
    if (path.startsWith(FOOD_ADMIN_HOME) || path.startsWith(GLOBAL_ADMIN_HOME)) {
      Promise.resolve(prefetchFoodAdmin()).finally(go);
      return;
    }
    if (path === TAXI_ADMIN_HOME) {
      Promise.resolve(prefetchTaxiAdmin()).finally(go);
      return;
    }
    go();
  };

  // An admin without Taxi access (for example a Food-only sub admin) is sent to its own part of the panel.
  useEffect(() => {
    if (!moduleAccess.taxi) {
      navigate(getAdminHomePath(adminProfile), { replace: true });
    }
  }, [moduleAccess.taxi, adminProfile, navigate]);

  useEffect(() => {
    const syncAdminProfile = () => setAdminProfile(readAdminProfile());
    window.addEventListener('storage', syncAdminProfile);
    syncAdminProfile();
    return () => window.removeEventListener('storage', syncAdminProfile);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(NOTIFICATION_DISMISS_STORAGE_KEY, JSON.stringify(dismissedNotifications));
  }, [dismissedNotifications]);

  const dismissedRideRequestSet = useMemo(
    () => new Set((dismissedNotifications.ride_requests || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications],
  );

  const dismissedBookingSet = useMemo(
    () => new Set((dismissedNotifications.bookings || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications],
  );

  const dismissedChatSet = useMemo(
    () => new Set((dismissedNotifications.chats || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications],
  );

  const visibleRideRequestResults = useMemo(
    () => rideRequestFeed.results.filter((item) => !dismissedRideRequestSet.has(getNotificationEntryId('ride_requests', item))),
    [dismissedRideRequestSet, rideRequestFeed.results],
  );

  const visibleBookingsFeed = useMemo(
    () => bookingsFeed.filter((item) => !dismissedBookingSet.has(getNotificationEntryId('bookings', item))),
    [bookingsFeed, dismissedBookingSet],
  );

  const visibleChatNotifications = useMemo(
    () => chatNotifications.filter((item) => !dismissedChatSet.has(getNotificationEntryId('chats', item))),
    [chatNotifications, dismissedChatSet],
  );

  const dismissNotification = (tab, item) => {
    const id = getNotificationEntryId(tab, item);
    if (!id) return;

    setDismissedNotifications((current) => {
      const existingItems = Array.isArray(current?.[tab]) ? current[tab] : [];
      if (existingItems.includes(id)) {
        return current;
      }

      return {
        ...current,
        [tab]: [id, ...existingItems].slice(0, 500),
      };
    });
  };

  const dismissCurrentNotifications = () => {
    if (notificationTab === 'ride_requests') {
      visibleRideRequestResults.forEach((item) => dismissNotification('ride_requests', item));
      return;
    }

    if (notificationTab === 'bookings') {
      visibleBookingsFeed.forEach((item) => dismissNotification('bookings', item));
      return;
    }

    visibleChatNotifications.forEach((item) => dismissNotification('chats', item));
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_EXPANSION_STORAGE_KEY,
      JSON.stringify(expandedSidebarGroups)
    );
  }, [expandedSidebarGroups]);

  const adminSections = useMemo(
    () => [
      {
        title: 'Home',
        items: [
          { icon: Home, label: 'Dashboard', path: '/taxi/admin/dashboard', permission: 'dashboard.view' },
          { icon: IndianRupee, label: 'Admin Earnings', path: '/taxi/admin/earnings', permission: 'earnings.view' },
          { icon: MessageCircle, label: 'Chat', path: '/taxi/admin/chat', permission: 'chat.view' },
          { icon: Bell, label: 'Broadcast Notifications', path: '/taxi/admin/promotions/send-notification', permission: 'promotions.view' },
          {
            icon: TrendingUp,
            label: 'Promotions Management',
            subItems: [
              { label: 'Promo Code', path: '/taxi/admin/promotions/promo-codes', permission: 'promotions.view' },
              //{ label: 'Banner Image', path: '/taxi/admin/promotions/banner-image', permission: 'promotions.view' },
            ],
          },
          {
            icon: IndianRupee,
            label: 'Price Management',
            subItems: [
              { label: 'Service Location', path: '/taxi/admin/pricing/service-location', permission: 'service_locations.view' },
              { label: 'Zone', path: '/taxi/admin/pricing/zone', permission: 'zones.view' },
              { label: 'App Modules', path: '/taxi/admin/pricing/app-modules', permission: 'settings.view' },
              { label: 'Vehicle Type', path: '/taxi/admin/pricing/vehicle-type', permission: 'vehicle_types.view' },
              { label: 'Package Types', path: '/taxi/admin/pricing/package-types', permission: 'rental.view' },
              { label: 'Package Pricing', path: '/taxi/admin/pricing/package-pricing', permission: 'rental.view' },
              { label: 'Set Price', path: '/taxi/admin/pricing/set-price', permission: 'set_prices.view' },
              { label: 'Goods Types', path: '/taxi/admin/pricing/goods-types', permission: 'goods_types.view' },
            ],
          },
          {
            icon: Bus,
            label: 'Bus Service',
            subItems: [
              { label: 'Fleet Manager', path: '/taxi/admin/bus-service', permission: 'bus_service.view' },
              { label: 'Bus Commission', path: '/taxi/admin/bus-service/commission', permission: 'bus_service.view' },
              { label: 'Bus Bookings', path: '/taxi/admin/bus-service/bookings', permission: 'bus_service.view' },
            ],
          },
          ...(POOLING_ENABLED
            ? [
                {
                  icon: Share2,
                  label: 'Car Pooling',
                  subItems: [
                    { label: 'Pooling Vehicles', path: '/taxi/admin/pooling/vehicles', permission: 'pooling.view' },
                    { label: 'Pooling Commission', path: '/taxi/admin/pooling/commission', permission: 'pooling.view' },
                    { label: 'Routes & Stops', path: '/taxi/admin/pooling/routes', permission: 'pooling.view' },
                    { label: 'Pooling Bookings', path: '/taxi/admin/pooling/bookings', permission: 'pooling.view' },
                  ],
                },
              ]
            : []),
          {
            icon: MapPin,
            label: 'Geofencing',
            subItems: [
              { label: 'Heat Map', path: '/taxi/admin/geo/heatmap', permission: 'geofencing.view' },
              { label: "God's Eye", path: '/taxi/admin/geo/gods-eye', permission: 'geofencing.view' },
              { label: 'Peak Zone', path: '/taxi/admin/geo/peak-zone', permission: 'geofencing.view' },
            ],
          },
          { icon: Car, label: 'Trip Requests', path: '/taxi/admin/trips', permission: 'trips.view' },
          { icon: Ban, label: 'Cancellation Analytics', path: '/taxi/admin/cancellation-analytics', permission: 'dashboard.view' },
          { icon: Package, label: 'Delivery Requests', path: '/taxi/admin/deliveries', permission: 'deliveries.view' },
          { icon: Clock, label: 'Ongoing Requests', path: '/taxi/admin/ongoing', permission: 'ongoing.view' },
          { icon: ShieldCheck, label: 'User SOS', path: '/taxi/admin/safety/user', permission: 'ongoing.view' },
          { icon: ShieldCheck, label: 'Driver SOS', path: '/taxi/admin/safety/driver', permission: 'ongoing.view' },
        ],
      },
      {
        title: 'Users',
        items: [
          {
            icon: Users,
            label: 'Customer Management',
            subItems: [
              { label: 'User List', path: '/taxi/admin/users', permission: 'users.view' },
              { label: 'Subscription Management', path: '/taxi/admin/users/subscriptions', permission: 'users.view' },
              { label: 'User Bulk Upload', path: '/taxi/admin/users/bulk-upload', permission: 'users.view' },
            ],
          },
          { icon: Wallet, label: 'Wallet Payment', path: '/taxi/admin/wallet/payment', permission: 'wallet.view' },
          {
            icon: Car,
            label: 'Driver Management',
            subItems: [
              { label: 'Pending Drivers', path: '/taxi/admin/drivers/pending', permission: 'drivers.view' },
              { label: 'Approved Drivers', path: '/taxi/admin/drivers', permission: 'drivers.view' },
              { label: 'Active Drivers', path: '/taxi/admin/drivers/active', permission: 'drivers.view' },
              { label: 'Subscription', path: '/taxi/admin/drivers/subscription', permission: 'drivers.view' },
              { label: 'Drivers Ratings', path: '/taxi/admin/drivers/ratings', permission: 'drivers.view' },
              {
                label: 'Driver Wallet',
                subItems: [
                  { label: 'Withdrawal Requests', path: '/taxi/admin/drivers/wallet/withdrawals', permission: 'wallet.view' },
                  { label: 'Negative Balance Drivers', path: '/taxi/admin/drivers/wallet/negative', permission: 'wallet.view' },
                ],
              },
              { label: 'Delete Request Drivers', path: '/taxi/admin/drivers/delete-requests', permission: 'drivers.view' },
              { label: 'Driver Needed Documents', path: '/taxi/admin/drivers/documents', permission: 'drivers.view' },
              { label: 'Driver Bulk Upload', path: '/taxi/admin/drivers/bulk-upload', permission: 'drivers.view' },
              { label: 'Payment Methods', path: '/taxi/admin/drivers/payment-methods', permission: 'wallet.view' },
            ],
          },
          { icon: Briefcase, label: 'Owner Management', path: '/taxi/admin/owners/dashboard', permission: 'owners.view' },
          {
            icon: FileText,
            label: 'Report',
            subItems: [
              { label: 'User Report', path: '/taxi/admin/reports/user', permission: 'reports.view' },
              { label: 'Driver Report', path: '/taxi/admin/reports/driver', permission: 'reports.view' },
              { label: 'Driver Duty Report', path: '/taxi/admin/reports/driver-duty', permission: 'reports.view' },
              { label: 'Owner Report', path: '/taxi/admin/reports/owner', permission: 'reports.view' },
              { label: 'Finance Report', path: '/taxi/admin/reports/finance', permission: 'reports.view' },
              { label: 'Fleet Finance Report', path: '/taxi/admin/reports/fleet-finance', permission: 'reports.view' },
            ],
          },
          {
            icon: ShieldCheck,
            label: 'Support Management',
            subItems: [
              { label: 'Ticket Title', path: '/taxi/admin/support/ticket-title', permission: 'support.view' },
              { label: 'Support Tickets', path: '/taxi/admin/support/tickets', permission: 'support.view' },
            ],
          },
        ],
      },
      {
        title: 'Masters',
        items: [
          { icon: Globe, label: 'Language', path: '/taxi/admin/masters/languages', permission: 'settings.view' },
          { icon: Star, label: 'Vehicle Preferences', path: '/taxi/admin/masters/preferences', permission: 'settings.view' },
          // { icon: ShieldCheck, label: 'Roles', path: '/taxi/admin/masters/roles' },
        ],
      },
      {
        title: 'Settings',
        items: [
          {
            icon: Settings,
            label: 'Business Settings',
            permission: 'settings.view',
            subItems: [
              { label: 'General Settings', path: '/taxi/admin/settings/business/general', permission: 'settings.view' },
              { label: 'Customization Settings', path: '/taxi/admin/settings/business/customization', permission: 'settings.view' },
              { label: 'Transport Ride Settings', path: '/taxi/admin/settings/business/transport-ride', permission: 'settings.view' },
              { label: 'Bid Ride Settings', path: '/taxi/admin/settings/business/bid-ride', permission: 'settings.view' },
            ],
          },
          {
            icon: Smartphone,
            label: 'App Settings',
            permission: 'settings.view',
            subItems: [
              { label: 'Wallet Settings', path: '/taxi/admin/settings/app/wallet', permission: 'settings.view' },
              { label: 'Tip Settings', path: '/taxi/admin/settings/app/tip', permission: 'settings.view' },
              { label: 'Mobile App Landing/Onboard Screens Settings', path: '/taxi/admin/settings/app/onboard', permission: 'settings.view' },
            ],
          },
          // {
          //   icon: PlusCircle,
          //   label: 'Addons',
          //   subItems: [{ label: 'Dispatcher Addons', path: '/taxi/admin/settings/addons/dispatcher' }],
          // },
        ],
      },
    ],
    []
  );

  const ownerSections = useMemo(
    () => [
      {
        title: 'Owner Mode',
        items: [
          {
            icon: Briefcase,
            label: 'Owner Management',
            subItems: [
              { label: 'Owner Dashboard', path: '/taxi/admin/owners/dashboard', permission: 'owners.view' },
              { label: 'Pending Owners', path: '/taxi/admin/owners/pending', permission: 'owners.view' },
              { label: 'Manage Owners', path: '/taxi/admin/owners', permission: 'owners.view' },
              {
                label: 'Owner Wallet',
                subItems: [{ label: 'Withdrawal Requests', path: '/taxi/admin/owners/wallet/withdrawals', permission: 'wallet.view' }],
              },
              {
                label: 'Fleet Management',
                subItems: [
                  { label: 'Fleet Drivers', path: '/taxi/admin/fleet/drivers', permission: 'owners.view' },
                  { label: 'Pending Fleet Drivers', path: '/taxi/admin/fleet/blocked', permission: 'owners.view' },
                  { label: 'Fleet Needed Document', path: '/taxi/admin/fleet/documents', permission: 'owners.view' },
                  { label: 'Manage Fleet', path: '/taxi/admin/fleet/manage', permission: 'owners.view' },
                ],
              },
              { label: 'Owner Needed Document', path: '/taxi/admin/owners/documents', permission: 'owners.view' },
              { label: 'Deleted Owners', path: '/taxi/admin/owners/deleted', permission: 'owners.view' },
              { label: 'Bookings', path: '/taxi/admin/owners/bookings', permission: 'owners.view' },
            ],
          },
        ],
      },
    ],
    []
  );

  const isOwnerRoute = location.pathname.startsWith('/taxi/admin/owners') || location.pathname.startsWith('/taxi/admin/fleet');
  const isAdminChatRoute = pathMatches(location.pathname, '/taxi/admin/chat');
  const mode = isOwnerRoute ? OWNER_MODE : ADMIN_MODE;
  const sidebarSections = useMemo(
    () => filterSidebarSectionsByAccess(mode === OWNER_MODE ? ownerSections : organizeAdminSections(adminSections), adminProfile),
    [adminProfile, adminSections, mode, ownerSections],
  );
  const unreadCountsByPath = useMemo(
    () => ({
      '/taxi/admin/chat': chatUnreadCount,
    }),
    [chatUnreadCount],
  );
  useEffect(() => {
    const activeKeys = [];
    const traverse = (items, parentKey) => {
      items.forEach((item) => {
        if (item.subItems) {
          const currentKey = parentKey ? `${parentKey}:${item.label}` : item.label;
          if (hasActiveChild(location.pathname, item.subItems)) {
            activeKeys.push(currentKey);
          }
          traverse(item.subItems, currentKey);
        }
      });
    };

    sidebarSections.forEach((section) => {
      traverse(section.items, section.title);
    });

    if (activeKeys.length > 0) {
      setExpandedSidebarGroups((current) => {
        const next = [...current];
        let changed = false;
        activeKeys.forEach((key) => {
          if (!next.includes(key)) {
            next.push(key);
            changed = true;
          }
        });
        return changed ? next : current;
      });
    }
  }, [location.pathname, sidebarSections]);

  const visibleSidebarSections = useMemo(() => {
    const query = sidebarSearchQuery.toLowerCase().trim();
    if (!query) return sidebarSections;

    return sidebarSections
      .map((section) => ({
        ...section,
        items: filterSidebarItemsBySearch(section.items || [], query),
      }))
      .filter((section) => section.items.length > 0);
  }, [sidebarSearchQuery, sidebarSections]);

  // Load the admin pages in the background so sidebar clicks open instantly.
  useEffect(() => warmAdminPages(import.meta.glob('../pages/**/*.jsx')), []);

  // The real route caught up (or the click went nowhere): stop using the optimistic highlight.
  useEffect(() => {
    setPendingSidebarPath(null);
    setFocusedGroupKey(null);
  }, [location.pathname]);
  const activeSidebarPath = pendingSidebarPath || location.pathname;
  // When the admin clicks a menu item the menu must stay exactly where it is: only a page opened from somewhere
  // else (search, a link, first load) scrolls the menu to its item.
  const lastSidebarClickAtRef = useRef(0);
  const sidebarNavContextValue = useMemo(
    () => ({
      activePath: focusedGroupKey ? '' : activeSidebarPath,
      onNavigate: (to) => {
        lastSidebarClickAtRef.current = Date.now();
        setFocusedGroupKey(null);
        setPendingSidebarPath(isSidebarPathActive(location.pathname, to) ? null : to);
      },
      focusedGroupKey,
      setFocusedGroupKey,
    }),
    [activeSidebarPath, location.pathname, focusedGroupKey],
  );

  // Open the groups that contain the current page whenever the route changes (collapsing is left to the user).
  useEffect(() => {
    const keys = collectActiveGroupKeys(sidebarSections, activeSidebarPath);
    if (keys.length === 0) return;
    setExpandedSidebarGroups((current) => (keys.every((key) => current.includes(key)) ? current : [...current, ...keys]));
  }, [activeSidebarPath, sidebarSections]);

  // Keep the active page centred in the sidebar: instantly on first load, smoothly after navigation.
  // NavLink marks the current page with aria-current="page", so that is what we look for.
  const sidebarNavRef = useRef(null);
  const sidebarScrolledOnce = useRef(false);
  useLayoutEffect(() => {
    const nav = sidebarNavRef.current;
    if (!nav) return undefined;

    const centreActive = (behavior) => {
      if (Date.now() - lastSidebarClickAtRef.current < 2000) return;
      const active = nav.querySelector('a[aria-current="page"]');
      if (!active) return;
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const top = activeRect.top - navRect.top + nav.scrollTop - navRect.height / 2 + activeRect.height / 2;
      const max = Math.max(0, nav.scrollHeight - nav.clientHeight);
      nav.scrollTo({ top: Math.max(0, Math.min(top, max)), behavior });
    };

    const behavior = sidebarScrolledOnce.current ? 'smooth' : 'auto';
    // Wait a frame so a group that just opened for this route has its rows in the DOM.
    const frame = requestAnimationFrame(() => {
      centreActive(behavior);
      sidebarScrolledOnce.current = true;
    });
    const timer = window.setTimeout(() => centreActive(behavior), 200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [activeSidebarPath, mode]);

  const pageTitle = resolvePageTitle(location.pathname, sidebarSections, appName);
  const searchEntries = useMemo(() => flattenSearchEntries(flattenItems(sidebarSections)), [sidebarSections]);
  const filteredSearchEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return searchEntries.slice(0, 10);
    }

    return searchEntries
      .filter((entry) => entry.keywords.includes(query) || entry.path.toLowerCase().includes(query))
      .slice(0, 14);
  }, [searchEntries, searchTerm]);

  const pagedBookings = useMemo(() => {
    const total = visibleBookingsFeed.length;
    const lastPage = Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE));
    const currentPage = Math.min(bookingPage, lastPage);
    const start = (currentPage - 1) * NOTIFICATION_PAGE_SIZE;

    return {
      results: visibleBookingsFeed.slice(start, start + NOTIFICATION_PAGE_SIZE),
      paginator: {
        current_page: currentPage,
        last_page: lastPage,
        total,
      },
    };
  }, [bookingPage, visibleBookingsFeed]);

  const activeNotificationMeta =
    notificationTab === 'ride_requests'
      ? rideRequestFeed.paginator
      : notificationTab === 'bookings'
        ? pagedBookings.paginator
        : notificationTab === 'requests'
          ? { current_page: 1, last_page: 1, total: pendingRequests.results.length }
          : { current_page: 1, last_page: 1, total: chatNotifications.length };

  const totalNotificationItems =
    Math.max(0, Number(rideRequestFeed?.paginator?.total || 0) - dismissedRideRequestSet.size) +
    visibleBookingsFeed.length +
    visibleChatNotifications.length +
    Number(pendingRequests.total || 0);

  const currentNotificationCount =
    notificationTab === 'ride_requests'
      ? visibleRideRequestResults.length
      : notificationTab === 'bookings'
        ? pagedBookings.results.length
        : notificationTab === 'requests'
          ? 0
          : visibleChatNotifications.length;

  const loadPendingRequests = useCallback(async () => {
    try {
      const response = await adminService.getPendingRequests();
      const data = response?.data || response || {};
      setPendingRequests({
        results: Array.isArray(data.results) ? data.results : [],
        total: Number(data.total || 0),
      });
    } catch (error) {
      console.error('Failed to load admin pending requests:', error);
    }
  }, []);

  const setMode = (nextMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, nextMode);

    if (nextMode === OWNER_MODE && !isOwnerRoute) {
      navigate('/taxi/admin/owners/dashboard');
    }

    if (nextMode === ADMIN_MODE && isOwnerRoute) {
      navigate('/taxi/admin/dashboard');
    }
  };

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }

      if (!notificationsMenuRef.current?.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  useEffect(() => {
    setIsSearchOpen(false);
    setSearchTerm('');
    setIsNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const { token } = syncAdminSessionBridge();

    if (!token || mode !== ADMIN_MODE) {
      setChatUnreadCount(0);
      return undefined;
    }

    let active = true;

    const syncUnreadChats = async () => {
      try {
        const response = await getSupportConversations(token);
        const conversations = response?.data?.conversations || [];
        const unreadTotal = conversations.reduce(
          (sum, conversation) => sum + Math.max(0, Number(conversation?.unreadCount || 0)),
          0,
        );

        if (!active) {
          return;
        }

        if (isAdminChatRoute) {
          const unreadConversationKeys = conversations
            .filter((conversation) => Number(conversation?.unreadCount || 0) > 0)
            .map((conversation) => conversation.conversationKey)
            .filter(Boolean);

          if (unreadConversationKeys.length > 0) {
            await Promise.all(
              unreadConversationKeys.map((conversationKey) => markSupportMessagesRead(conversationKey, token)),
            );
          }

          if (!active) {
            return;
          }

          setChatNotifications([]);
          setChatUnreadCount(0);
          return;
        }

        setChatUnreadCount(unreadTotal);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('Failed to sync admin chat unread count:', error);
      }
    };

    syncUnreadChats();

    return () => {
      active = false;
    };
  }, [isAdminChatRoute, mode]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    let isMounted = true;

    const fetchNotifications = async () => {
      setNotificationsLoading(true);

      try {
        if (notificationTab === 'ride_requests') {
          const response = await adminService.getRideRequests({
            page: rideRequestPage,
            limit: NOTIFICATION_PAGE_SIZE,
            tab: 'all',
            search: '',
          });

          if (!isMounted) return;

          setRideRequestFeed({
            results: response?.data?.results || response?.results || [],
            paginator: response?.data?.paginator || response?.paginator || { current_page: 1, last_page: 1, total: 0 },
          });
          return;
        }

        if (notificationTab === 'chats') {
          return;
        }

        if (notificationTab === 'requests') {
          await loadPendingRequests();
          return;
        }

        // The bell only needs the latest bookings, so ask for one page of 50 instead of the whole table. It is
        // paged in the browser (5 per page), so flipping pages does not need another request.
        const response = await adminService.getOwnerBookings({ page: 1, limit: 50 });
        if (!isMounted) return;

        setBookingsFeed(response?.data?.results || response?.results || []);
      } catch (error) {
        console.error('Failed to load admin notifications:', error);

        if (!isMounted) return;

        if (notificationTab === 'ride_requests') {
          setRideRequestFeed({
            results: [],
            paginator: { current_page: 1, last_page: 1, total: 0 },
          });
        } else if (notificationTab === 'bookings') {
          setBookingsFeed([]);
        }
      } finally {
        if (isMounted) {
          setNotificationsLoading(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, [isNotificationsOpen, notificationTab, rideRequestPage, loadPendingRequests]);

  // The bell dot must show pending sign-ups/tickets even before the panel is opened.
  useEffect(() => {
    if (mode !== ADMIN_MODE) return undefined;
    const timer = setTimeout(loadPendingRequests, 1500);
    return () => clearTimeout(timer);
  }, [mode, loadPendingRequests]);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    const { token } = syncAdminSessionBridge();
    if (!token && !window.location.pathname.includes('/admin/login')) {
      navigate('/admin/login');
      return undefined;
    }

    if (!token) return undefined;

    socketService.connect({ role: 'admin', token });
    const seenChatNotificationIds = seenChatNotificationIdsRef.current;

    socketService.on('new_sos', (data = {}) => {
      const fromDriver = data.sourceApp === 'driver';
      const who = fromDriver ? (data.driverName || 'A driver') : (data.riderName || 'A passenger');
      toast.error(`${fromDriver ? 'DRIVER' : 'PASSENGER'} SOS: ${who} needs help${data.locationLabel ? ` - ${data.locationLabel}` : ''}`, {
        duration: 15000,
        id: `sos-${data.id || Date.now()}`,
        className: 'font-bold text-[13px] rounded-2xl shadow-xl',
        style: { background: '#dc2626', color: '#fff' },
      });
      playAdminAlertTone();
    });

    socketService.on('new_driver_registration', (data) => {
      console.log('New driver registration:', data);
    });

    const handleAdminRequest = (payload = {}) => {
      toast(`${payload.title || 'New request'}${payload.body ? ` — ${payload.body}` : ''}`, {
        duration: 6000,
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-amber-50 bg-white',
      });
      loadPendingRequests();
    };

    socketService.on('admin:request', handleAdminRequest);

    const handleSupportChatNotification = (payload = {}) => {
      const senderRole = String(payload.senderRole || payload.sender?.role || '').toLowerCase();
      const receiverRole = String(payload.receiverRole || payload.receiver?.role || '').toLowerCase();
      const messageBody = String(payload.message || payload.body || '').trim();

      if (!messageBody || senderRole === 'admin' || receiverRole !== 'admin') {
        return;
      }

      if (isAdminChatRoute) {
        if (payload.conversationKey) {
          markSupportMessagesRead(payload.conversationKey, token).catch((error) => {
            console.error('Failed to mark live admin chat message as read:', error);
          });
        }

        setChatNotifications([]);
        setChatUnreadCount(0);
        return;
      }

      const senderName =
        String(payload.sender?.name || '').trim() ||
        (senderRole === 'driver' ? 'Driver' : senderRole === 'user' ? 'User' : 'Support contact');

      const nextItem = {
        id: `support-chat:${payload.id || payload._id || payload.conversationKey || `${Date.now()}-${messageBody}`}`,
        title: `${senderName} sent a new chat`,
        body: messageBody,
        senderRole: senderRole || 'user',
        createdAt: payload.createdAt || new Date().toISOString(),
      };

      // (A state updater runs later, so "was it new?" cannot be read back from it: that is why admins never got the toast.)
      if (seenChatNotificationIds.has(nextItem.id)) {
        return;
      }
      seenChatNotificationIds.add(nextItem.id);

      setChatNotifications((current) => dedupeAdminChatNotifications([nextItem, ...current]).slice(0, 25));
      setChatUnreadCount((current) => current + 1);
      toast(`${senderName}: ${nextItem.body}`, {
        duration: 6000,
        icon: '💬',
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-sky-50 bg-white',
      });
      playAdminAlertTone();
    };

    socketService.on('chat:message', handleSupportChatNotification);

    return () => {
      socketService.off('new_sos');
      socketService.off('new_driver_registration');
      socketService.off('chat:message', handleSupportChatNotification);
      socketService.off('admin:request', handleAdminRequest);
    };
  }, [isAdminChatRoute, navigate, loadPendingRequests]);

  const handleLogout = () => {
    socketService.disconnect();
    clearUnifiedAdminSession();
    setIsUserMenuOpen(false);
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-200 font-sans text-gray-900">
      <style>{`
        .admin-sidebar-scroll::-webkit-scrollbar {
          width: 2px;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-track {
          background: rgba(17, 24, 39, 0.4);
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.35);
        }
        .admin-sidebar-scroll:hover::-webkit-scrollbar {
          width: 6px;
        }
        .admin-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.25) rgba(17, 24, 39, 0.4);
        }
      `}</style>
      <aside
        className={cn(
          "relative z-50 flex h-screen flex-col overflow-hidden transition-all duration-500 bg-neutral-950 border-r border-neutral-800/60",
          isCollapsed ? 'w-20' : 'w-80',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-3 py-3 border-b border-neutral-800/60 bg-neutral-900">
            <div className="relative flex items-center mb-3 min-h-[80px]">
              <img
                src={DEFAULT_BRAND_LOGO}
                alt="Hello Parth"
                className={isCollapsed ? "h-14 w-14 object-contain" : "h-20 w-20 object-contain"}
              />
              {!isCollapsed && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <h3 className="text-[15px] font-extrabold leading-tight text-white tracking-tight">
                    Hello Parth
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Taxi Admin
                    </span>
                  </div>
                </div>
              )}
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
                className="absolute -right-3 top-1/2 z-[60] hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-300 shadow-lg ring-4 ring-neutral-950 transition-all hover:bg-white hover:text-black hover:scale-110 active:scale-90 lg:flex group/collapse"
            >
              {isCollapsed ? (
                <ChevronRight size={12} strokeWidth={3.5} className="transition-transform group-hover/collapse:translate-x-0.5" />
              ) : (
                <ChevronLeft size={12} strokeWidth={3.5} className="transition-transform group-hover/collapse:-translate-x-0.5" />
              )}
            </button>
          </div>

          {!isCollapsed && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider text-left">
                Admin Panel
              </h2>
            </div>
          )}

          {/* Module Switcher Tabs */}
          {!isCollapsed && (showFoodTab || showTaxiTab) && (
              <div className="flex p-1 bg-neutral-800/40 backdrop-blur-sm rounded-xl mb-4 border border-white/5 shadow-inner">
                {showFoodTab && (
                  <button
                    type="button"
                    onClick={() => switchAdminModule(FOOD_ADMIN_HOME)}
                    onMouseEnter={prefetchFoodAdmin}
                    onFocus={prefetchFoodAdmin}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300",
                      "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                    )}
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 text-neutral-500" />
                    Food
                  </button>
                )}
                {showTaxiTab && (
                  <button
                    type="button"
                    onClick={() => switchAdminModule(TAXI_ADMIN_HOME)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300",
                      "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)] scale-[1.02]"
                    )}
                  >
                    <Truck className="w-3.5 h-3.5 text-black" />
                    Taxi
                  </button>
                )}
              </div>
          )}

          {/* Global (only for admins that were given Global access) */}
          {!isCollapsed && showGlobalTab && (
            <button
              type="button"
              onClick={() => switchAdminModule(GLOBAL_ADMIN_HOME)}
              onMouseEnter={prefetchFoodAdmin}
              onFocus={prefetchFoodAdmin}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 mb-4 -mt-2 text-xs font-bold rounded-lg border transition-all duration-300",
                "text-neutral-300 border-white/10 bg-neutral-800/40 hover:text-white hover:bg-white/5"
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              Global
            </button>
          )}

            {!isCollapsed && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4 z-10" />
                <input
                  type="text"
                  placeholder="Search Menu..."
                  value={sidebarSearchQuery}
                  onChange={(event) => setSidebarSearchQuery(event.target.value)}
                  className={cn(
                    "admin-sidebar-search w-full pl-9 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all duration-200 text-left",
                    sidebarSearchQuery ? "pr-9" : "pr-3"
                  )}
                />
                {sidebarSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSidebarSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-all z-10"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <SidebarNavContext.Provider value={sidebarNavContextValue}>
          <nav ref={sidebarNavRef} className="admin-sidebar-scroll mt-0 flex-1 min-h-0 space-y-8 overflow-y-auto overscroll-y-contain px-3 py-3">
            {visibleSidebarSections.length === 0 && sidebarSearchQuery.trim() ? (
              <div className="px-3 py-12 text-left">
                <p className="text-neutral-300 text-sm font-medium">No menu items found</p>
                <p className="text-neutral-500 text-sm mt-2">Try a different search term</p>
              </div>
            ) : (
              visibleSidebarSections.map((section) => (
              <div key={section.title} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-4 mb-4 flex items-center gap-2">
                    <div className="h-3 w-1 rounded-full bg-white" />
                    <span className="text-[12px] font-black uppercase tracking-widest text-white/90">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.items.map((item) =>
                  item.subItems ? (
                    <SidebarGroup
                      key={item.label}
                      {...item}
                      forceOpen={mode === OWNER_MODE || Boolean(sidebarSearchQuery.trim())}
                      isCollapsed={isCollapsed}
                      pathname={activeSidebarPath}
                      groupKey={`${section.title}:${item.label}`}
                      expandedGroups={expandedSidebarGroups}
                      setExpandedGroups={setExpandedSidebarGroups}
                      sidebarTextColor={sidebarTextColor}
                      unreadCountsByPath={unreadCountsByPath}
                    />
                  ) : (
                    <SidebarItem
                      key={item.path}
                      {...item}
                      isCollapsed={isCollapsed}
                      sidebarTextColor={sidebarTextColor}
                      unreadCount={getSidebarItemCount(item, unreadCountsByPath)}
                    />
                  )
                )}
              </div>
              ))
            )}
          </nav>
          </SidebarNavContext.Provider>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-6 w-1 rounded-full bg-amber-600" />
            <h2 className="text-[15px] font-bold tracking-tight text-neutral-800">{pageTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <ModeSwitcher mode={mode} setMode={setMode} />
            <AdminThemeToggle scope="taxi" />

            <div className="mr-1 flex items-center gap-1 border-r border-gray-100 pr-4 leading-none">
              <button
                type="button"
                onClick={() => setIsSearchOpen((current) => !current)}
                className="rounded-lg p-2 text-neutral-400 transition-all hover:bg-neutral-50 hover:text-amber-600"
              >
                <Search size={18} />
              </button>

              <div ref={notificationsMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((current) => !current)}
                  className="relative rounded-lg p-2 text-neutral-400 transition-all hover:bg-neutral-50 hover:text-amber-600"
                >
                  <Bell size={18} />
                  {totalNotificationItems > 0 ? (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                  ) : null}
                </button>

                <div
                  className={`absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl transition-all ${
                    isNotificationsOpen ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
                  }`}
                >
                  <div className="border-b border-slate-100 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">Notifications</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Ride requests, bookings, chats and approvals
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentNotificationCount > 0 ? (
                          <button
                            type="button"
                            onClick={dismissCurrentNotifications}
                            className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          >
                            Clear
                          </button>
                        ) : null}
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                          {totalNotificationItems}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationTab('ride_requests');
                          setRideRequestPage(1);
                        }}
                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                          notificationTab === 'ride_requests'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Rides
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationTab('bookings');
                          setBookingPage(1);
                        }}
                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                          notificationTab === 'bookings'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Bookings
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationTab('chats');
                        }}
                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                          notificationTab === 'chats'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Chats
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationTab('requests');
                        }}
                        className={`relative rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                          notificationTab === 'requests'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Requests
                        {pendingRequests.total > 0 ? (
                          <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2 rounded-full bg-rose-500" />
                        ) : null}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto p-3">
                    {notificationsLoading ? (
                      <div className="flex items-center justify-center px-4 py-12 text-sm font-semibold text-slate-500">
                        Loading notifications...
                      </div>
                    ) : notificationTab === 'ride_requests' ? (
                      visibleRideRequestResults.length === 0 ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                          <p className="text-sm font-bold text-slate-900">No ride requests found</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">New ride requests will show up here.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {visibleRideRequestResults.map((item) => (
                            <button
                              key={item.id || item.requestId}
                              type="button"
                              onClick={() => {
                                navigate('/taxi/admin/trips');
                                setIsNotificationsOpen(false);
                              }}
                              className="relative w-full rounded-2xl border border-slate-100 bg-white pl-4 pr-12 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-900">
                                    {item.requestId} · {item.userName}
                                  </p>
                                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                    Pickup: {formatAdminNotificationLocation(item.pickupLabel, 'Pickup location set')}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                  {item.tripStatus || 'Upcoming'}
                                </span>
                              </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
                              <span>
                                Destination: {formatAdminNotificationLocation(item.dropLabel, 'Destination set')}
                              </span>
                              <span>{formatRelativeAdminTime(item.date)}</span>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissNotification('ride_requests', item);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  dismissNotification('ride_requests', item);
                                }
                              }}
                              className="absolute right-3 top-3 inline-flex rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Delete notification"
                            >
                              <Trash2 size={14} />
                            </span>
                          </button>
                          ))}
                        </div>
                      )
                    ) : notificationTab === 'bookings' ? pagedBookings.results.length === 0 ? (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                        <p className="text-sm font-bold text-slate-900">No bookings found</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Recent bookings will show up here.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pagedBookings.results.map((item) => (
                          <button
                            key={item._id || item.id || item.booking_reference}
                            type="button"
                            onClick={() => {
                              navigate('/taxi/admin/owners/bookings');
                              setIsNotificationsOpen(false);
                            }}
                            className="relative w-full rounded-2xl border border-slate-100 bg-white pl-4 pr-12 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">
                                  {item.booking_reference || 'Booking'} · {item.customer_name || 'Customer'}
                                </p>
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                  {item.pickup_location || 'Pickup'} to {item.dropoff_location || 'Drop'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                {item.booking_status || 'Pending'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
                              <span>{item.owner_id?.name || item.owner_id?.company_name || 'Owner booking'}</span>
                              <span>{formatRelativeAdminTime(item.trip_date || item.createdAt)}</span>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissNotification('bookings', item);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  dismissNotification('bookings', item);
                                }
                              }}
                              className="absolute right-3 top-3 inline-flex rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Delete notification"
                            >
                              <Trash2 size={14} />
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : notificationTab === 'requests' ? pendingRequests.results.length === 0 ? (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                        <p className="text-sm font-bold text-slate-900">Nothing waiting for you</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          New driver/owner sign-ups, support tickets and re-uploaded documents will show up here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pendingRequests.results.map((item) => (
                          <button
                            key={`${item.type}:${item.id}`}
                            type="button"
                            onClick={() => {
                              if (item.link) navigate(item.link);
                              setIsNotificationsOpen(false);
                            }}
                            className="relative w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.body}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                {item.type === 'support_ticket'
                                  ? 'Ticket'
                                  : item.type === 'document_reverification'
                                    ? 'Document'
                                    : item.type === 'owner_registration'
                                      ? 'Owner'
                                      : item.type === 'bus_driver_registration'
                                        ? 'Bus'
                                        : item.type === 'pooling_registration'
                                          ? 'Pooling'
                                          : 'Driver'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-end text-[11px] font-semibold text-slate-400">
                              <span>{formatRelativeAdminTime(item.createdAt)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : visibleChatNotifications.length === 0 ? (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                        <p className="text-sm font-bold text-slate-900">No new chats found</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">New user and driver support messages will show up here.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleChatNotifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              navigate('/taxi/admin/chat');
                              setChatNotifications([]);
                              setIsNotificationsOpen(false);
                            }}
                            className="relative w-full rounded-2xl border border-slate-100 bg-white pl-4 pr-12 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.body}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                                {item.senderRole}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-end text-[11px] font-semibold text-slate-400">
                              <span>{formatRelativeAdminTime(item.createdAt)}</span>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissNotification('chats', item);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  dismissNotification('chats', item);
                                }
                              }}
                              className="absolute right-3 top-3 inline-flex rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Delete notification"
                            >
                              <Trash2 size={14} />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                    <button
                      type="button"
                      disabled={(activeNotificationMeta?.current_page || 1) <= 1}
                      onClick={() => {
                        if (notificationTab === 'ride_requests') {
                          setRideRequestPage((current) => Math.max(1, current - 1));
                        } else {
                          setBookingPage((current) => Math.max(1, current - 1));
                        }
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>

                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Page {activeNotificationMeta?.current_page || 1} of {activeNotificationMeta?.last_page || 1}
                    </span>

                    <button
                      type="button"
                      disabled={(activeNotificationMeta?.current_page || 1) >= (activeNotificationMeta?.last_page || 1)}
                      onClick={() => {
                        if (notificationTab === 'ride_requests') {
                          setRideRequestPage((current) => current + 1);
                        } else {
                          setBookingPage((current) => current + 1);
                        }
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                className="group flex cursor-pointer items-center gap-3 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 transition-all hover:bg-gray-100"
                onClick={() => setIsUserMenuOpen((current) => !current)}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition-all group-hover:bg-primary group-hover:text-white">
                  <Users size={14} />
                </div>
                <div className="text-left leading-tight">
                  <span className="block text-[11px] font-black text-gray-950">
                    {adminProfile?.name || 'Admin'}
                  </span>
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {adminProfile?.admin_type === 'subadmin' ? adminProfile?.role || 'Subadmin' : 'Superadmin'}
                  </span>
                </div>
                <ChevronDown size={14} className="text-gray-300" />
              </button>

              <div
                className={`absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl transition-all ${
                  isUserMenuOpen ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
                }`}
              >
                {/* One admin profile page serves the whole panel; it lives in the Food/Global shell. */}
                {showGlobalTab || showFoodTab ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsUserMenuOpen(false);
                      switchAdminModule(showGlobalTab ? `${GLOBAL_ADMIN_HOME}/profile` : '/admin/food/profile');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-slate-700 transition-all hover:bg-slate-50"
                  >
                    <Users size={16} />
                    <span className="text-[12px] font-bold">My Profile</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-red-600 transition-all hover:bg-red-50"
                >
                  <LogOut size={16} />
                  <span className="text-[12px] font-bold">Logout Session</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {isSearchOpen && (
          <div
            className="fixed inset-0 z-[70] bg-slate-900/10 backdrop-blur-[1px]"
            onClick={() => setIsSearchOpen(false)}
          >
            <div className="mx-auto mt-20 w-full max-w-2xl px-4">
              <div
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <Search size={18} className="text-neutral-400" />
                    <input
                      autoFocus
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search sidebar options..."
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setIsSearchOpen(false)}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-200/70"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto p-3">
                  {filteredSearchEntries.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                      <p className="text-sm font-bold text-slate-900">No sidebar option found</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Try searching for drivers, trips, pricing, reports, or settings.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSearchEntries.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          onClick={() => {
                            navigate(entry.path);
                            setIsSearchOpen(false);
                            setSearchTerm('');
                          }}
                          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{entry.label}</p>
                            <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                              {[...entry.trail, entry.path].join(' • ')}
                            </p>
                          </div>
                          <ChevronRight size={16} className="shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="taxi-admin-main no-scrollbar flex-1 overflow-y-auto bg-neutral-100 p-4 pb-10 lg:p-6 lg:pb-10">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
