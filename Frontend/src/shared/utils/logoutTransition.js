// Smooth hand-over from any signed-in screen (Food or Taxi) to the login page.
//
// Signing out tears the page down before the login screen is on screen: Food's profile empties the moment the
// session is cleared, and the login chunk may still be loading. Without help the user sees an empty / white frame
// in between. So a dim "Logging out..." cover (same look as the log-out popup) is put straight onto <body> - outside
// React, so it survives the page being replaced - and is faded out once the login screen is really showing.
import { preloadAuthApp } from './preloadLogin.js';

const COVER_ID = 'logout-transition-cover';
const FADE_MS = 220;
const MAX_COVER_MS = 4000;

export function showLogoutCover() {
  if (typeof document === 'undefined' || document.getElementById(COVER_ID)) return;

  const dark = document.documentElement.dataset.theme === 'dark';
  const cover = document.createElement('div');
  cover.id = COVER_ID;
  cover.setAttribute('role', 'status');
  cover.setAttribute('aria-live', 'polite');
  cover.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:100000', 'display:flex', 'align-items:center', 'justify-content:center',
    'padding:16px', 'background:rgba(0,0,0,0.6)', 'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
    `transition:opacity ${FADE_MS}ms ease`, 'opacity:1',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:100%', 'max-width:384px', 'box-sizing:border-box', 'border-radius:16px', 'padding:24px', 'text-align:center',
    'box-shadow:0 25px 50px -12px rgba(0,0,0,0.25)', 'backdrop-filter:blur(12px)', '-webkit-backdrop-filter:blur(12px)',
    dark ? 'background:rgba(26,26,26,0.94)' : 'background:rgba(255,255,255,0.94)',
    dark ? 'border:1px solid rgba(255,255,255,0.1)' : 'border:1px solid rgba(255,255,255,0.2)',
    dark ? 'color:#ffffff' : 'color:#111827',
    'font-family:inherit',
  ].join(';');
  // Inline SVG spinner (SMIL) so no stylesheet is needed.
  card.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 50 50" style="display:block;margin:0 auto 12px" aria-hidden="true">
      <circle cx="25" cy="25" r="20" fill="none" stroke="${dark ? '#ffffff' : '#111827'}" stroke-opacity="0.15" stroke-width="5"></circle>
      <path d="M25 5 a20 20 0 0 1 20 20" fill="none" stroke="${dark ? '#ffffff' : '#111827'}" stroke-width="5" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"></animateTransform>
      </path>
    </svg>
    <div style="font-size:16px;font-weight:700">Logging out...</div>`;

  cover.appendChild(card);
  document.body.appendChild(cover);

  // Never leave a full-screen cover behind, whatever happens.
  window.setTimeout(hideLogoutCover, MAX_COVER_MS);
}

export function hideLogoutCover() {
  const cover = typeof document !== 'undefined' ? document.getElementById(COVER_ID) : null;
  if (!cover) return;
  cover.style.opacity = '0';
  cover.style.pointerEvents = 'none';
  window.setTimeout(() => cover.remove(), FADE_MS + 30);
}

/** Fades the cover out once the login form is really on screen (not while it is still a spinner / blank). */
export function hideLogoutCoverWhenLoginShown() {
  if (typeof document === 'undefined') return;
  const started = Date.now();
  const check = () => {
    const onLogin = window.location.pathname.startsWith('/login');
    const formShown = onLogin && Boolean(document.querySelector('input'));
    if (formShown || Date.now() - started > MAX_COVER_MS - 500) {
      // one more frame so the login page has painted under the cover before it fades
      window.requestAnimationFrame(() => window.requestAnimationFrame(hideLogoutCover));
      return;
    }
    window.requestAnimationFrame(check);
  };
  window.requestAnimationFrame(check);
}

/**
 * Logs out with no blank frame: cover on, sign out (and make sure the login screen is loaded) in parallel, go to
 * the login page, cover off once it shows. `signOut` may be async; a failing sign-out still ends on the login page,
 * because the local session is what matters to the user.
 */
export async function logoutWithTransition({ signOut, navigate, loginPath = '/login' }) {
  showLogoutCover();
  try {
    await Promise.all([Promise.resolve().then(signOut), preloadAuthApp()]);
  } catch {
    await preloadAuthApp();
  }
  navigate(loginPath, { replace: true });
  hideLogoutCoverWhenLoginShown();
}
