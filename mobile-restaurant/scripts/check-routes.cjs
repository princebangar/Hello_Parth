#!/usr/bin/env node
// Route coverage, A to Z: every <Route path> of the web's Frontend/src/modules/Food/components/restaurant/RestaurantRouter.jsx
// (mounted at /food/restaurant/*) plus the restaurant auth paths of modules/Food/routes.jsx must have a route file in
// src/app/food/restaurant/**. Also lists every web file under pages/restaurant/** (except desktop/) and
// components/restaurant/** and whether the app has it (or why it needs none).
//   node scripts/check-routes.cjs [--md]   (--md prints Markdown tables for CONVERSION_CHECKLIST.md)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FE = path.resolve(ROOT, '..', 'Frontend', 'src');
const FOOD = path.join(FE, 'modules', 'Food');
const APP = path.join(ROOT, 'src', 'app');
const md = process.argv.includes('--md');

const router = fs.readFileSync(path.join(FOOD, 'components', 'restaurant', 'RestaurantRouter.jsx'), 'utf8');
const foodRoutes = fs.readFileSync(path.join(FOOD, 'routes.jsx'), 'utf8');

function routes() {
  const out = [];
  const re = /<Route\s+path="([^"]*)"\s+element=\{([\s\S]*?)\}\s*\/>/g;
  let m;
  while ((m = re.exec(router))) {
    // phone layout: the `mobile=` element of <Responsive>
    const mobile = /mobile=\{<(\w+)/.exec(m[2]);
    const nav = /mobile=\{<Navigate to="([^"]+)"/.exec(m[2]);
    const names = mobile
      ? [nav ? `Navigate ${nav[1]}` : mobile[1]]
      : [...m[2].matchAll(/<(\w+)/g)].map((x) => x[1]).filter((n) => !['AuthRedirect', 'ProtectedRoute', 'Responsive'].includes(n));
    out.push({ path: m[1], element: names.join(' > ') || '?' });
  }
  // auth paths the Food router knows (RestaurantGlobalNotificationListener list)
  for (const a of foodRoutes.matchAll(/"\/food\/restaurant\/([^"]+)"/g)) {
    if (!out.some((r) => r.path === a[1])) out.push({ path: a[1], element: '(Food routes auth path)' });
  }
  return out;
}

// Expo Router file for a web path: segments, ":x" -> "[x]", "*" -> "[...rest]", index files; matched case-insensitively
// like lib/router (Share-Feedback -> share-feedback)
function routeFileExists(url) {
  const segs = url.split('/').filter(Boolean).map((s) => s.toLowerCase());
  const parts = segs.map((s) => (s === '*' ? '[...rest]' : s.startsWith(':') ? `[${s.slice(1)}]` : s));
  const candidates = [path.join(APP, ...parts) + '.jsx', path.join(APP, ...parts, 'index.jsx')];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

const rows = [];
for (const route of routes()) {
  const url = `/food/restaurant${route.path ? `/${route.path}` : ''}`;
  const file = routeFileExists(url);
  rows.push({ url, element: route.element, file: file ? path.relative(ROOT, file).split(path.sep).join('/') : null });
}
const missing = rows.filter((r) => !r.file);

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'desktop') walk(p, out);
    } else if (/\.(jsx?|tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}
// web files nothing routes to (dead code on the web), or that the app does differently
const NOT_NEEDED = {
  'pages/restaurant/OrdersPage.jsx': 'dead code on the web (no route)',
  'pages/restaurant/AddZone.jsx': 'dead code on the web (no route)',
  'pages/restaurant/auth/SignIn.jsx': 'dead code on the web (no route)',
  'pages/restaurant/auth/OTP.jsx': 'dead code (/otp renders Login; the lazy import is unused)',
  'components/restaurant/BottomNavbar.jsx': 'only used by the dead OrdersPage',
  'components/restaurant/MenuOverlay.jsx': 'only used by the dead OrdersPage',
  'components/restaurant/StorePanelWording.jsx': 'done in the shared Text (src/native/ui/storeWording.js)',
  'components/restaurant/RestaurantRouter.jsx': 'route table -> src/app/food/restaurant/** + restaurantRoutes.jsx',
  'components/restaurant/restaurantTheme.css': 'colours -> restaurantTheme in src/theme + per-screen styles',
};
const comps = walk(path.join(FOOD, 'pages', 'restaurant'))
  .concat(walk(path.join(FOOD, 'components', 'restaurant')))
  .map((p) => {
    const rel = path.relative(FE, p).split(path.sep).join('/');
    const short = rel.replace('modules/Food/', '');
    const native = path.join(ROOT, 'src', rel);
    return { rel, short, converted: fs.existsSync(native), note: NOT_NEEDED[short] };
  });
const notConverted = comps.filter((c) => !c.converted && !c.note);

if (md) {
  console.log('| Web path | Web element (phone) | App route file |\n|---|---|---|');
  rows.forEach((r) => console.log(`| \`${r.url}\` | ${r.element} | ${r.file ? `\`${r.file}\`` : '**MISSING**'} |`));
  console.log('\n| Web file (modules/Food/...) | In the app |\n|---|---|');
  comps.forEach((c) => console.log(`| \`${c.short}\` | ${c.converted ? 'yes (same path)' : c.note ? `not needed: ${c.note}` : '**NO**'} |`));
} else {
  rows.forEach((r) => console.log(`${r.file ? 'ok ' : 'XX '} ${r.url.padEnd(48)} ${r.element.padEnd(30)} ${r.file || ''}`));
  console.log(`\nweb components: ${comps.length}, not in the app: ${notConverted.length}`);
  notConverted.forEach((c) => console.log(`  NOT CONVERTED ${c.rel}`));
}
console.log(`\nroutes: ${rows.length}, missing: ${missing.length}`);
process.exit(missing.length || notConverted.length ? 1 : 0);
