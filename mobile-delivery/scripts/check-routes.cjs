#!/usr/bin/env node
// Route coverage, A to Z: every <Route path> of the web's Frontend/src/modules/DeliveryV2/DeliveryV2Router.jsx
// (mounted at /food/delivery/*) must have a route file in src/app/food/delivery/**.
// Also lists every web file under modules/DeliveryV2/** and whether the app has it (or why it needs none).
//   node scripts/check-routes.cjs [--md]   (--md prints Markdown tables for CONVERSION_CHECKLIST.md)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FE = path.resolve(ROOT, '..', 'Frontend', 'src');
const APP = path.join(ROOT, 'src', 'app');
const md = process.argv.includes('--md');

const router = fs.readFileSync(path.join(FE, 'modules', 'DeliveryV2', 'DeliveryV2Router.jsx'), 'utf8');

function routes() {
  const out = [];
  const re = /<Route\s+path="([^"]*)"\s+element=\{([\s\S]*?)\}\s*\/>/g;
  let m;
  while ((m = re.exec(router))) {
    const names = [...m[2].matchAll(/<(\w+)/g)].map((x) => x[1]).filter((n) => !['AuthRedirect', 'ProtectedRoute'].includes(n));
    out.push({ path: m[1], element: names.join(' > ') || '?' });
  }
  return out;
}

// Expo Router file for a web path: segments, ":x" -> "[x]", "*" -> "[...rest]", index files
function routeFileExists(url) {
  const segs = url.split('/').filter(Boolean);
  const candidates = [];
  const build = (parts) => parts.map((s) => (s === '*' ? '[...rest]' : s.startsWith(':') ? `[${s.slice(1)}]` : s));
  const parts = build(segs);
  candidates.push(path.join(APP, ...parts) + '.jsx', path.join(APP, ...parts, 'index.jsx'));
  return candidates.find((c) => fs.existsSync(c)) || null;
}

const rows = [];
for (const route of routes()) {
  const url = route.path === '*' ? '/food/delivery/*' : `/food/delivery${route.path ? `/${route.path}` : ''}`;
  const file = routeFileExists(url);
  rows.push({ url, element: route.element, file: file ? path.relative(ROOT, file).split(path.sep).join('/') : null });
}

const missing = rows.filter((r) => !r.file && !r.optional);

// web components of the driver module
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p);
  }
  return out;
}
// web files nothing imports (dead code on the web), or that the app does differently
const NOT_NEEDED = {
  'components/AvailableCashLimit.jsx': 'dead code on the web (not imported)',
  'components/BottomNavigation.jsx': 'dead code on the web (not imported)',
  'components/BottomPopup.example.jsx': 'example file, not imported',
  'components/DeliveryLayout.jsx': 'dead code (old router)',
  'components/DeliveryRouter.jsx': 'dead code (old router, not mounted)',
  'components/DepositPopup.jsx': 'dead code on the web (not imported)',
  'components/FeedNavbar.jsx': 'dead code on the web (not imported)',
  'components/GoogleMapsTracking.jsx': 'dead code on the web (not imported)',
  'components/map/RiderMarker.jsx': 'dead code on the web (not imported)',
  'components/ui/GlassCard.jsx': 'dead code on the web (not imported)',
  'components/ui/PremiumButton.jsx': 'dead code on the web (not imported)',
  'pages/auth/Signup.jsx': 'dead code (/signup redirects to /login)',
  'pages/auth/OTP.jsx': 'dead code (/otp renders SignIn; the lazy import is unused)',
  'DeliveryV2Router.jsx': 'route table -> src/app/food/delivery/** + routes.jsx',
  'index.jsx': 'theme root -> DeliveryApp.jsx',
  'deliveryTheme.css': 'styles -> deliveryTheme in src/theme + per-screen styles',
};
const dvDir = path.join(FE, 'modules', 'DeliveryV2');
const comps = walk(dvDir).concat([path.join(FE, 'modules', 'DeliveryV2', 'deliveryTheme.css')]).map((p) => {
  const rel = path.relative(FE, p).split(path.sep).join('/');
  const short = rel.replace('modules/DeliveryV2/', '');
  const native = path.join(ROOT, 'src', rel);
  return { rel, short, converted: fs.existsSync(native), note: NOT_NEEDED[short] };
});
const notConverted = comps.filter((c) => !c.converted && !c.note);

if (md) {
  console.log('| Web path | Web element | App route file |\n|---|---|---|');
  rows.forEach((r) => console.log(`| \`${r.url}\` | ${r.element} | ${r.file ? `\`${r.file}\`` : r.optional ? '— (web has none either)' : '**MISSING**'} |`));
  console.log('\n| Web file (modules/DeliveryV2/**) | In the app |\n|---|---|');
  comps.forEach((c) => console.log(`| \`${c.short}\` | ${c.converted ? 'yes (same path)' : c.note ? `not needed: ${c.note}` : '**NO**'} |`));
} else {
  rows.forEach((r) => console.log(`${r.file ? 'ok ' : r.optional ? '-- ' : 'XX '} ${r.url.padEnd(48)} ${r.element.padEnd(26)} ${r.file || ''}`));
  console.log(`\nweb components: ${comps.length}, not in the app: ${notConverted.length}`);
  notConverted.forEach((c) => console.log(`  NOT CONVERTED ${c.rel}`));
}
console.log(`\nroutes: ${rows.length}, missing: ${missing.length}`);
process.exit(missing.length || notConverted.length ? 1 : 0);
