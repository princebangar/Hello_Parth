#!/usr/bin/env node
// Route coverage, A to Z: every <Route path> inside the `driver` and `owner` blocks of the web's
// Frontend/src/modules/Taxi/TaxiApp.jsx (plus the partner auth paths) must have a route file in src/app/taxi/**.
// Also lists every web component under modules/Taxi/modules/driver/** and whether the app has it.
//   node scripts/check-routes.cjs [--md]   (--md prints Markdown tables for CONVERSION_CHECKLIST.md)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FE = path.resolve(ROOT, '..', 'Frontend', 'src');
const APP = path.join(ROOT, 'src', 'app');
const md = process.argv.includes('--md');

const taxiApp = fs.readFileSync(path.join(FE, 'modules', 'Taxi', 'TaxiApp.jsx'), 'utf8');

// the text of <Route path="driver" ...> ... </Route> (nested Routes have no children here, so the first </Route> at the
// block's own indentation closes it)
function block(name) {
  const start = taxiApp.indexOf(`<Route path="${name}" element={<DriverLayout />}>`);
  if (start < 0) throw new Error(`no ${name} block in TaxiApp.jsx`);
  const indent = taxiApp.lastIndexOf('\n', start);
  const pad = taxiApp.slice(indent + 1, start);
  const end = taxiApp.indexOf(`\n${pad}</Route>`, start);
  return taxiApp.slice(start, end);
}

function routesOf(name) {
  const full = block(name);
  const text = full.slice(full.indexOf('\n')); // drop the block's own opening line
  const out = [];
  const re = /<Route\s+([\s\S]*?)\/>/g;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const p = /path="([^"]*)"/.exec(attrs);
    const element = (/element=\{<(\w+)/.exec(attrs) || [])[1] || '?';
    if (/\bindex\b/.test(attrs) && !p) out.push({ path: '', element });
    else if (p) out.push({ path: p[1], element });
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
for (const portal of ['driver', 'owner']) {
  for (const r of routesOf(portal)) {
    const url = `/taxi/${portal}${r.path ? `/${r.path}` : ''}`;
    const file = routeFileExists(url.replace(/\/\*$/, '/*'));
    // a splat route "x/*" also needs the bare "x" (React Router matches "x" too)
    const bare = url.endsWith('/*') ? routeFileExists(url.slice(0, -2)) : true;
    rows.push({ url, element: r.element, file: file && bare ? path.relative(ROOT, file).split(path.sep).join('/') : null });
  }
}
// PARTNER_AUTH_PATH = /^\/taxi\/(driver|owner)\/(login|reg-phone|otp-verify|select-role)\/?$/
const authPaths = /PARTNER_AUTH_PATH = \/\^\\\/taxi\\\/\(driver\|owner\)\\\/\(([^)]+)\)/.exec(taxiApp);
const authNames = authPaths ? authPaths[1].split('|') : ['login', 'reg-phone', 'otp-verify', 'select-role'];
for (const portal of ['driver', 'owner']) {
  for (const n of authNames) {
    const url = `/taxi/${portal}/${n}`;
    if (rows.some((r) => r.url === url)) continue;
    const file = routeFileExists(url);
    // the web has no owner/select-role route (the catch-all sends it home); the app's +not-found does the same
    rows.push({ url, element: 'PARTNER_AUTH_PATH', file: file ? path.relative(ROOT, file).split(path.sep).join('/') : null, optional: true });
  }
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
const driverDir = path.join(FE, 'modules', 'Taxi', 'modules', 'driver');
const comps = walk(driverDir).map((p) => {
  const rel = path.relative(FE, p).split(path.sep).join('/');
  const native = path.join(ROOT, 'src', rel);
  return { rel, converted: fs.existsSync(native) };
});
const notConverted = comps.filter((c) => !c.converted);

if (md) {
  console.log('| Web path | Web element | App route file |\n|---|---|---|');
  rows.forEach((r) => console.log(`| \`${r.url}\` | ${r.element} | ${r.file ? `\`${r.file}\`` : r.optional ? '— (web has none either)' : '**MISSING**'} |`));
  console.log('\n| Web file (modules/Taxi/modules/driver/**) | In the app |\n|---|---|');
  comps.forEach((c) => console.log(`| \`${c.rel.replace('modules/Taxi/modules/driver/', '')}\` | ${c.converted ? 'yes' : '**NO**'} |`));
} else {
  rows.forEach((r) => console.log(`${r.file ? 'ok ' : r.optional ? '-- ' : 'XX '} ${r.url.padEnd(48)} ${r.element.padEnd(26)} ${r.file || ''}`));
  console.log(`\nweb components: ${comps.length}, not in the app: ${notConverted.length}`);
  notConverted.forEach((c) => console.log(`  NOT CONVERTED ${c.rel}`));
}
console.log(`\nroutes: ${rows.length}, missing: ${missing.length}`);
process.exit(missing.length || notConverted.length ? 1 : 0);
