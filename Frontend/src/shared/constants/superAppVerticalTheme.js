/**
 * Hello Parth super-app vertical colours
 * - Food active tab: bright red (pops on #D91F3A header)
 * - Inactive tabs: navy (same on Food & Taxi home)
 */
export const HELLO_PARTH_LOGO_COLORS = {
  food: '#D91F3A',
  taxi: '#1E4A8C',
};

const INACTIVE_TAB_BG = 'bg-[#050C16]/90';

export const SUPER_APP_VERTICAL_THEME = {
  food: {
    accent: '#FF6B7A',
    activeTab: '#FF5C72',
    theme: '#D91F3A',
    inactiveTab: '#050C16',
    stickyBackdrop: 'rgba(217, 31, 58, 0.92)',
    accentSoft: '#FFF0F2',
    accentSoftHover: '#FFE0E5',
    themeBg: 'bg-[#D91F3A]',
    activeTabBg: 'bg-[#FF5C72]',
    inactiveTabBg: INACTIVE_TAB_BG,
  },
  taxi: {
    accent: '#5B9BD5',
    activeTab: '#2563EB',
    theme: '#0B172A',
    inactiveTab: '#050C16',
    stickyBackdrop: 'rgba(11, 23, 42, 0.96)',
    accentSoft: '#E8EEF7',
    accentSoftHover: '#D4E2F4',
    themeBg: 'bg-[#0B172A]',
    activeTabBg: 'bg-[#2563EB]',
    inactiveTabBg: INACTIVE_TAB_BG,
  },
};

export function getVerticalTheme(verticalId) {
  return SUPER_APP_VERTICAL_THEME[verticalId] || SUPER_APP_VERTICAL_THEME.food;
}
