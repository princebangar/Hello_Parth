// Web: components/restaurant/LiveDishNotice.jsx — tells an approved restaurant why customers do not see it yet (no
// approved, in-stock item): LiveDishBanner (Orders tab card) and LiveDishPopup (once per login session). My Store
// partners never see it. Same texts, same rules.
// Native: menuItemsFromResponse came from the desktop dashboard's desktopData.js (not part of the app) — the same
// function is kept here. The popup is a bottom Sheet (web: fixed inset-0 bottom sheet on phones).
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PackagePlus, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Sheet, Text } from '@/native/ui';
import { colors, restaurantTheme, sp } from '@/theme';
import { restaurantAPI } from '@food/api';
import { isMyStorePartner } from '@food/utils/auth';

// web: pages/restaurant/desktop/desktopData.js menuItemsFromResponse
function menuItemsFromResponse(res) {
  const sections = res?.data?.data?.menu?.sections || [];
  const out = [];
  sections.forEach((s) => {
    const push = (item, category) =>
      out.push({
        id: String(item.id),
        name: item.name || 'Unnamed item',
        image: item.image || '',
        price: Number(item.price) || 0,
        foodType: item.foodType || '',
        category: category || s.name || 'Uncategorised',
        isAvailable: item.isAvailable !== false,
        approvalStatus: String(item.approvalStatus || 'approved').toLowerCase(),
      });
    (s.items || []).forEach((i) => push(i, s.name));
    (s.subsections || []).forEach((sub) => (sub.items || []).forEach((i) => push(i, s.name)));
  });
  return out;
}

const POPUP_SEEN_KEY = 'hp_live_dish_popup_seen';
// Only shared between the banner and the popup that mount together; a fresh visit always re-reads the menu,
// so adding an item makes the notice disappear straight away.
const CACHE_MS = 3 * 1000;
let cached = { at: 0, value: null };

const classify = (items) => {
  if (!items.length) return 'none';
  const live = items.filter((i) => i.approvalStatus === 'approved' && i.isAvailable !== false);
  if (live.length) return 'ok';
  if (items.some((i) => i.approvalStatus === 'pending')) return 'pending';
  if (items.some((i) => i.approvalStatus === 'approved')) return 'unavailable';
  return 'none';
};

const COPY = {
  none: {
    title: 'Your restaurant is approved',
    body: 'Customers will see it in the app only after you add at least one item to your menu. Add your first item to go live.',
    action: 'Add items',
    to: 'new',
  },
  pending: {
    title: 'Your items are waiting for approval',
    body: 'Your restaurant is approved. Customers will see it as soon as one of your items is approved by the admin.',
    action: 'View items',
    to: 'list',
  },
  unavailable: {
    title: 'All your items are out of stock',
    body: "Customers can't see your restaurant while every item is switched off. Turn on at least one item to show up in the app.",
    action: 'Open items',
    to: 'list',
  },
};

/**
 * `reloadKey` (native): the Orders tab stays mounted, so it passes a value that changes each time the tab is opened
 * again — the web re-read the menu on every visit (the screen was mounted again).
 */
export function useLiveDishStatus(reloadKey) {
  const [state, setState] = useState(() => (isMyStorePartner() ? 'ok' : cached.value || 'loading'));

  const load = useCallback(async () => {
    if (isMyStorePartner()) return;
    if (cached.value && Date.now() - cached.at < CACHE_MS) {
      setState(cached.value);
      return;
    }
    try {
      const next = classify(menuItemsFromResponse(await restaurantAPI.getMenu()));
      cached = { at: Date.now(), value: next };
      setState(next);
    } catch {
      // If the menu cannot be read, say nothing rather than show a wrong warning.
      setState((current) => (current === 'loading' ? 'ok' : current));
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, reloadKey]);

  return state;
}

// An empty menu goes straight to the add-item page; otherwise to the item list (to approve / switch items on).
const useActionTarget = (copy) => {
  const { pathname } = useLocation();
  const base = pathname.includes('/food/restaurant') ? '/food/restaurant' : '/restaurant';
  if (copy?.to === 'new') return { path: `${base}/hub-menu/item/new`, state: { backTo: pathname } };
  return { path: `${base}/inventory`, state: undefined };
};

function BrandButton({ onPress, label, style, textStyle }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { transform: [{ scale: 0.95 }] }]}>
      <LinearGradient
        colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 9999 }]}
      />
      <Text style={[styles.brandText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

/** Inline card for the Orders tab. Renders nothing once the restaurant has a live item. */
export function LiveDishBanner({ style, reloadKey }) {
  const status = useLiveDishStatus(reloadKey);
  const navigate = useNavigate();
  const copy = COPY[status];
  const target = useActionTarget(copy);
  if (!copy) return null;

  return (
    <View accessibilityRole="summary" style={[styles.banner, style]}>
      <View style={styles.bannerIcon}>
        <PackagePlus size={20} color={restaurantTheme.brand} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.bannerTitle}>{copy.title}</Text>
        <Text style={styles.bannerBody}>{copy.body}</Text>
        <BrandButton
          onPress={() => navigate(target.path, { state: target.state })}
          label={copy.action}
          style={styles.bannerBtn}
          textStyle={styles.bannerBtnText}
        />
      </View>
    </View>
  );
}

/** Popup for the Dashboard: shown once per login session while the restaurant has no live item. */
export function LiveDishPopup() {
  const status = useLiveDishStatus();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const copy = COPY[status];
  const target = useActionTarget(copy);

  useEffect(() => {
    if (!copy) return;
    try {
      if (sessionStorage.getItem(POPUP_SEEN_KEY) === '1') return;
    } catch {
      // storage blocked: still show it, once per page load
    }
    setOpen(true);
  }, [copy]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(POPUP_SEEN_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <Sheet open={open && Boolean(copy)} onClose={close} style={styles.sheet}>
      {copy ? (
        <View style={styles.sheetBody}>
          <Pressable onPress={close} accessibilityLabel="Close" style={styles.closeBtn}>
            <X size={16} color={colors.slate[500]} />
          </Pressable>
          <View style={styles.popupIcon}>
            <PackagePlus size={24} color={restaurantTheme.brand} />
          </View>
          <Text style={styles.popupTitle}>{copy.title}</Text>
          <Text style={styles.popupBody}>{copy.body}</Text>
          <View style={styles.popupRow}>
            <Pressable onPress={close} style={styles.laterBtn}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            <BrandButton
              onPress={() => {
                close();
                navigate(target.path, { state: target.state });
              }}
              label={copy.action}
              style={styles.popupAction}
              textStyle={styles.popupActionText}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(3),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ead6e3',
    backgroundColor: '#f9f0f7',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
  },
  bannerIcon: {
    marginTop: 2,
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: 14, lineHeight: 17, fontWeight: '700', color: colors.slate[900] },
  bannerBody: { marginTop: 2, fontSize: 12.5, lineHeight: 17, fontWeight: '500', color: colors.slate[600] },
  bannerBtn: {
    marginTop: sp(2),
    alignSelf: 'flex-start',
    borderRadius: 9999,
    overflow: 'hidden',
    paddingHorizontal: sp(4),
    paddingVertical: 6,
  },
  bannerBtnText: { fontSize: 12, lineHeight: 16 },
  brandText: { color: colors.white, fontWeight: '600', textAlign: 'center' },
  sheet: { backgroundColor: colors.white },
  sheetBody: { padding: sp(6), paddingBottom: sp(6) },
  closeBtn: {
    position: 'absolute',
    right: sp(4),
    top: sp(4),
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  popupIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#f9f0f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupTitle: { marginTop: sp(4), fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.slate[900] },
  popupBody: { marginTop: 6, fontSize: 14, lineHeight: 23, color: colors.slate[600] },
  popupRow: { marginTop: sp(5), flexDirection: 'row', gap: sp(2) },
  laterBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: sp(4),
    paddingVertical: 10,
    alignItems: 'center',
  },
  laterText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[600] },
  popupAction: { flex: 1, borderRadius: 9999, overflow: 'hidden', paddingHorizontal: sp(4), paddingVertical: 10 },
  popupActionText: { fontSize: 14, lineHeight: 20 },
});
