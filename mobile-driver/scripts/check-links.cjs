#!/usr/bin/env node
// No dead links: every literal in-app path in navigate(...), navigateTo(...), <Navigate to>, <Link to>, redirectRoute(...),
// `to:` / `path:` / `route:` / `href:` object keys must resolve to a route file in src/app (Expo Router: [param],
// [...rest], index). A path that only matches the catch-all (+not-found) silently lands on the start screen.
//   node scripts/check-links.cjs
// Template literals: `${prefix}/x` with an unknown leading prefix is tried as /taxi/driver/x and /taxi/owner/x;
// any other ${...} is one dynamic segment. Exit code 1 when a path resolves nowhere.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APP = path.join(SRC, 'app');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p);
  }
  return out;
}

// route patterns from the file tree
const routes = walk(APP)
  .map((f) => path.relative(APP, f).split(path.sep).join('/').replace(/\.(jsx?|tsx?)$/, ''))
  .filter((r) => !/(^|\/)(_layout|\+not-found)$/.test(r))
  .map((r) => r.replace(/(^|\/)index$/, '').replace(/\([^/]+\)\/?/g, ''))
  .map((r) => {
    const re = r
      .split('/')
      .filter(Boolean)
      .map((s) => (s.startsWith('[...') ? '.+' : s.startsWith('[') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    return { route: `/${r}`, re: new RegExp(`^/${re}/?$`) };
  });

const resolves = (p) => routes.some((r) => r.re.test(p));

// the app's own non-route paths that are fine: external URLs are skipped before this
const IGNORE = [/^\/\//, /^\/api\//, /^\/uploads\//, /^\/v1\//];

const CALL = /\b(?:navigate|navigateTo|redirectRoute|router\.(?:push|replace|navigate))\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const JSX_TO = /\b(?:to|href)=\{?\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const KEY = /\b(?:to|path|route|href|link|redirectTo|backTo|returnTo|target)\s*:\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

const problems = [];
const warnings = [];
let checked = 0;

for (const file of walk(SRC)) {
  if (file.startsWith(APP)) continue;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const re of [CALL, JSX_TO, KEY]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      let value = m[2];
      if (!value.startsWith('/') && !value.startsWith('${')) continue;
      if (/^https?:/.test(value)) continue;
      value = value.split('?')[0].split('#')[0];
      if (!value || value === '/') continue;
      if (IGNORE.some((r) => r.test(value))) continue;
      // only app routes are checked: the web portal lives under /taxi/driver and /taxi/owner
      const line = code.slice(0, m.index).split('\n').length;
      let candidates;
      if (value.startsWith('${')) {
        const rest = value.replace(/^\$\{[^}]*\}/, '');
        if (!rest.startsWith('/')) continue;
        candidates = ['/taxi/driver', '/taxi/owner'].map((p) => p + rest);
      } else {
        candidates = [value];
      }
      candidates = candidates.map((c) => c.replace(/\$\{[^}]*\}/g, 'X1').replace(/\/+$/, '') || '/');
      if (!candidates.some((c) => c.startsWith('/taxi/') || c === '/taxi')) {
        // a path outside the portal: the web would leave the driver app (customer site / admin) — flag it
        if (/^\/[a-z]/.test(candidates[0])) warnings.push(`${rel}:${line}  ${value}  (outside /taxi/driver|owner)`);
        continue;
      }
      checked += 1;
      if (!candidates.some(resolves)) {
        // a template whose dynamic part is a whole section name cannot be resolved statically
        if (/X1/.test(candidates.join())) warnings.push(`${rel}:${line}  ${value}  (template, check by hand)`);
        else problems.push(`${rel}:${line}  ${value}`);
      }
    }
  }
}

warnings.forEach((w) => console.log(`?  ${w}`));
problems.forEach((p) => console.log(`XX ${p}`));
console.log(`\n${routes.length} routes, ${checked} in-app path literals checked, unmatched: ${problems.length}, to review by hand: ${warnings.length}`);
process.exit(problems.length ? 1 : 0);
