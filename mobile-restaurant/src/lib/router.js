// react-router-dom style navigation on top of Expo Router, so converted screens keep the web's navigation logic:
// same paths (/food/user/cart, /taxi/user/ride/select-vehicle ...), navigate(path, { replace, state }), navigate(-1),
// useLocation().state, useParams(), useSearchParams().
//
// Route state is kept in memory and referenced from the URL by a "__st" query param, which useParams / useSearchParams
// / location.search never show to the screen.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';
import { router, useGlobalSearchParams, useLocalSearchParams, usePathname, useNavigation } from 'expo-router';
import { setCompatNavigate, setCompatRoute } from './webCompat';

const STATE_PARAM = '__st';
const stateStore = new Map();
let stateSeq = 0;
let lastNavigationType = 'POP';

const toQueryString = (params = {}) => {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (k === STATE_PARAM || v == null) return;
    (Array.isArray(v) ? v : [v]).forEach((item) => usp.append(k, String(item)));
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
};

// The web's app/routes.jsx sent the old short Food addresses to /food/... (RedirectToFood); Food screens still use
// them (/user/orders/:id after placing an order, /user/restaurants/:slug, /user ...). Without the same mapping they
// hit the catch-all and landed on the home screen. /user/terms|privacy|support are real pages of their own.
const ROOT_USER_PAGES = /^\/user\/(terms|privacy|support)(\/|\?|$)/;
export function legacyFoodPath(path) {
  // RestaurantRouter also serves the "Share-Feedback" spelling (route files are matched in lower case here)
  if (/^\/(food\/)?restaurant\/Share-Feedback(\/|\?|$)/.test(path)) return path.replace(/^\/(food\/)?restaurant\/Share-Feedback/, '/food/restaurant/share-feedback');
  if (ROOT_USER_PAGES.test(path)) return path;
  if (/^\/cart(\/|\?|$)/.test(path)) return '/food/user/cart';
  if (/^\/restaurants\//.test(path)) return `/food/user${path}`;
  if (/^\/(user|restaurant|delivery|usermain|profile|orders)(\/|\?|$)/.test(path)) return `/food${path}`;
  return path;
}

/** "/a/b?x=1" | { pathname, search } -> "/a/b?x=1" (relative paths resolved against the current one). */
export function resolveTo(to, fromPathname = '/') {
  let path = typeof to === 'string' ? to : `${to?.pathname || fromPathname}${to?.search || ''}${to?.hash || ''}`;
  path = path.replace(/#.*$/, '');
  if (!path) return fromPathname;
  if (path.startsWith('/')) return legacyFoodPath(path);
  const [rel, query = ''] = path.split('?');
  const parts = fromPathname.split('/').filter(Boolean);
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return `/${parts.join('/')}${query ? `?${query}` : ''}`;
}

const withState = (href, state) => {
  if (state === undefined) return href;
  const id = `s${++stateSeq}`;
  stateStore.set(id, state);
  if (stateStore.size > 200) stateStore.delete(stateStore.keys().next().value);
  return `${href}${href.includes('?') ? '&' : '?'}${STATE_PARAM}=${id}`;
};

/** Imperative navigate usable outside React (event handlers in utils, interceptors). */
export function navigateTo(to, options = {}) {
  if (typeof to === 'number') {
    lastNavigationType = 'POP';
    if (to < 0) {
      for (let i = 0; i < -to; i += 1) {
        if (router.canGoBack()) router.back();
      }
    }
    return;
  }
  const href = withState(resolveTo(to, currentPathname), options.state);
  // "Go to the page right below this one" (the web's Back / Save buttons navigate(backTarget) to a path): go back to
  // it instead of pushing a second copy — otherwise the stack grew and Android Back walked through stale pages.
  // Only for a plain path (no route state, no query), so nothing the target needs is lost.
  if (!options.replace && options.state === undefined && !href.includes('?') && navHistory.length >= 2) {
    if (navHistory[navHistory.length - 2] === href && router.canGoBack()) {
      lastNavigationType = 'POP';
      router.back();
      return;
    }
  }
  lastNavigationType = options.replace ? 'REPLACE' : 'PUSH';
  // Taxi and Food are two tabs that both stay mounted (app/(main)/_layout.jsx). Going from one to the other is a tab
  // switch: push / replace would act on the root stack and build a second copy of both apps.
  const fromVertical = verticalOf(currentPathname);
  const toVertical = verticalOf(href);
  if (toVertical && fromVertical && toVertical !== fromVertical) router.navigate(href);
  else if (options.replace) router.replace(href);
  else router.push(href);
}

const verticalOf = (path = '') => {
  const m = /^\/(taxi|food)(\/|\?|$)/.exec(String(path));
  return m ? m[1] : null;
};

let currentPathname = '/';
// Paths of the stack as this app walked it (kept by RouteSync): the last entry is the screen on top.
const navHistory = [];
setCompatNavigate((to, opts) => navigateTo(to, opts));

export function useNavigate() {
  return useCallback((to, options) => navigateTo(to, options), []);
}

export function useNavigationType() {
  return lastNavigationType;
}

// The Taxi and Food layouts each give their tree a scope (/taxi, /food). When the URL leaves that scope (the Taxi /
// Food switch fades one into the other), the leaving tree keeps seeing its last location: otherwise it reacts to the new
// URL during the fade (its tab layer hides and an older screen of its stack shows for a moment).
const RouteScopeContext = createContext(null);

export function RouteScope({ prefix, children }) {
  return <RouteScopeContext.Provider value={prefix}>{children}</RouteScopeContext.Provider>;
}

// A kept-alive tab layer that stays on screen for a moment while a page opens on top of it is frozen the same way:
// its screens keep the location they were drawn for instead of reacting to the new page's URL.
const FrozenLocationContext = createContext(false);

export function FreezeLocation({ frozen, children }) {
  return <FrozenLocationContext.Provider value={Boolean(frozen)}>{children}</FrozenLocationContext.Provider>;
}

const inScope = (pathname, prefix) => !prefix || pathname === prefix || pathname.startsWith(`${prefix}/`);

// One location object for the whole app, written by <RouteSync> (rendered before every screen in the root layout,
// so a screen mounting in the same render already reads the new route). Screens subscribe through
// useSyncExternalStore: one that is frozen or out of its scope keeps returning the same object and is NOT re-rendered
// at all. With Expo Router's own hooks in ~80 screens every navigation re-rendered all of them (0.3-0.5 s per tap).
const routeStore = {
  location: { pathname: '/', search: '', hash: '', state: null, key: '/' },
  listeners: new Set(),
};
const subscribeRoute = (fn) => {
  routeStore.listeners.add(fn);
  return () => routeStore.listeners.delete(fn);
};

/**
 * useLocation for the few always-mounted layers that must change in the same render as the navigation itself (the
 * Taxi / Food tab layers: a page popped by Back and the tab under it have to swap in one frame). Reads the router
 * directly, so it re-renders on every navigation; everything else uses useLocation.
 */
export function useLocationNow() {
  const scope = useContext(RouteScopeContext);
  const frozen = useContext(FrozenLocationContext);
  const lastInScopeRef = useRef(null);
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const stateId = params?.[STATE_PARAM];
  const search = toQueryString(params);
  const location = useMemo(
    () => ({
      pathname,
      search,
      hash: '',
      state: stateId ? (stateStore.get(String(stateId)) ?? null) : null,
      key: String(stateId || pathname),
    }),
    [pathname, search, stateId],
  );
  if (frozen && lastInScopeRef.current) return lastInScopeRef.current;
  if (inScope(pathname, scope) || !lastInScopeRef.current) lastInScopeRef.current = location;
  return lastInScopeRef.current;
}

export function useLocation() {
  const scope = useContext(RouteScopeContext);
  const frozen = useContext(FrozenLocationContext);
  const lastInScopeRef = useRef(null);
  const getSnapshot = () => {
    const location = routeStore.location;
    if (frozen && lastInScopeRef.current) return lastInScopeRef.current;
    if (inScope(location.pathname, scope) || !lastInScopeRef.current) lastInScopeRef.current = location;
    return lastInScopeRef.current;
  };
  return useSyncExternalStore(subscribeRoute, getSnapshot);
}

/** Path params (and query params, like Expo Router) of the current screen, without the internal state id. */
export function useParams() {
  const params = useLocalSearchParams();
  return useMemo(() => {
    const out = { ...params };
    delete out[STATE_PARAM];
    Object.keys(out).forEach((k) => {
      if (Array.isArray(out[k])) out[k] = out[k].join('/');
    });
    return out;
  }, [params]);
}

export function useSearchParams() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const search = toQueryString(params);
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const setSearchParams = useCallback(
    (next, options = {}) => {
      const value = typeof next === 'function' ? next(new URLSearchParams(search)) : next;
      const usp = value instanceof URLSearchParams ? value : new URLSearchParams(value || {});
      const q = usp.toString();
      if (`?${q}` === search || (!q && !search)) return; // nothing changes
      // Same screen, new query: update its params in place. router.replace() built a NEW screen for the same route;
      // a page that writes its query to the URL from an effect (Food search) then remounted and wrote again, for ever
      // (keyboard opening / closing, then "Maximum update depth exceeded").
      if (!options.state) {
        const nextParams = Object.fromEntries(usp.entries());
        Object.keys(params || {}).forEach((k) => {
          if (k !== STATE_PARAM && !(k in nextParams)) nextParams[k] = undefined;
        });
        router.setParams(nextParams);
        return;
      }
      navigateTo(`${pathname}${q ? `?${q}` : ''}`, { replace: options.replace !== false, state: options.state });
    },
    [pathname, search, params],
  );
  return [searchParams, setSearchParams];
}

/** Keeps window.location (webCompat) in sync with the current route. Rendered once in the root layout. */
export function RouteSync() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const search = toQueryString(params);
  const stateId = params?.[STATE_PARAM];
  currentPathname = pathname;
  setCompatRoute(pathname, search);
  const prev = routeStore.location;
  if (prev.pathname !== pathname || prev.search !== search || prev.key !== String(stateId || pathname)) {
    // written during render on purpose (see routeStore); subscribers are told after the commit
    routeStore.location = {
      pathname,
      search,
      hash: '',
      state: stateId ? (stateStore.get(String(stateId)) ?? null) : null,
      key: String(stateId || pathname),
    };
  }
  const location = routeStore.location;
  useLayoutEffect(() => {
    routeStore.listeners.forEach((fn) => fn());
  }, [location]);
  useEffect(() => {
    // back (button, gesture or router.back) = the path below; a replace swaps the top; anything else is a new screen
    if (navHistory.length >= 2 && navHistory[navHistory.length - 2] === pathname) navHistory.pop();
    else if (lastNavigationType === 'REPLACE' && navHistory.length) navHistory[navHistory.length - 1] = pathname;
    else if (navHistory[navHistory.length - 1] !== pathname) navHistory.push(pathname);
    if (navHistory.length > 50) navHistory.splice(0, navHistory.length - 50);
  }, [pathname]);
  useEffect(() => {
    globalThis.dispatchEvent?.(new CustomEvent('app:routechange', { detail: { pathname, search } }));
  }, [pathname, search]);
  return null;
}

/** <Navigate to="/x" replace /> */
export function Navigate({ to, replace = false, state }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // after mount, so the navigator is ready
    const t = setTimeout(() => navigateTo(to, { replace, state }), 0);
    return () => clearTimeout(t);
  }, [to, replace, state]);
  return null;
}

/** <Link to="/x" state={...} replace style={...}>children</Link> — a Pressable that navigates. */
export function Link({ to, replace, state, onPress, onClick, children, style, disabled, ...rest }) {
  const handle = (e) => {
    onPress?.(e);
    onClick?.(e);
    if (e?.defaultPrevented) return;
    navigateTo(to, { replace, state });
  };
  return (
    <Pressable accessibilityRole="link" onPress={handle} style={style} disabled={disabled} {...rest}>
      {children}
    </Pressable>
  );
}

/** Minimal matchPath("/food/user/orders/:id", pathname) -> { params } | null */
export function matchPath(pattern, pathname) {
  const pat = typeof pattern === 'string' ? pattern : pattern?.path;
  const end = typeof pattern === 'object' ? pattern.end !== false : true;
  if (!pat) return null;
  const keys = [];
  const re = new RegExp(
    `^${pat
      .replace(/\/\*$/, '(?:/(?<__splat>.*))?')
      .replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      })}${end ? '/?$' : '(?:/|$)'}`,
  );
  const m = re.exec(pathname || '');
  if (!m) return null;
  const params = {};
  keys.forEach((k, i) => {
    params[k] = decodeURIComponent(m[i + 1]);
  });
  if (m.groups?.__splat !== undefined) params['*'] = m.groups.__splat;
  return { params, pathname: m[0], pattern: pat };
}

export function useMatch(pattern) {
  const pathname = usePathname();
  return matchPath(pattern, pathname);
}

/**
 * Runs `handler` when the Android back button / back gesture would leave this screen.
 * Return true from the handler to stay (e.g. close an open sheet first), like the web's popstate guards.
 */
export function useBeforeLeave(handler, enabled = true) {
  const navigation = useNavigation();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    return navigation.addListener('beforeRemove', (e) => {
      if (e.data?.action?.type !== 'GO_BACK' && e.data?.action?.type !== 'POP') return;
      if (ref.current?.() === true) e.preventDefault();
    });
  }, [navigation, enabled]);
}

export { router };
