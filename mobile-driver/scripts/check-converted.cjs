#!/usr/bin/env node
// Fast per-file check for converted screens (no Metro needed):
//   node scripts/check-converted.cjs <file|dir> [...]
// 1. compiles the file with the project's Babel config (syntax / JSX errors)
// 2. checks every relative / aliased import resolves to a file in mobile-user/src (or a package in node_modules)
// 3. flags web-only code that cannot run in React Native (DOM elements, className, document.*, window.google ...)
// Exit code 1 when anything is wrong.
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const EXT = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
const ASSET = /\.(png|jpe?g|gif|webp|svg|mp3|wav|mp4|ttf|otf|json|lottie)$/i;
const ALIAS = [
  [/^@food\/api\/axios$/, 'services/api/axios.js'],
  [/^@food\/api\/config$/, 'services/api/config.js'],
  [/^@food\/api$/, 'services/api'],
  [/^@food\/(.+)/, 'modules/Food/$1'],
  [/^@\/assets\/(.+)/, 'modules/Taxi/assets/$1'],
  [/^@\/components\/(.+)/, 'modules/Taxi/components/$1'],
  [/^@\/(.+)/, '$1'],
];
const WEB_PACKAGES = new Set([
  'react-dom', 'react-router-dom', 'react-router', 'framer-motion', 'lucide-react', 'sonner', 'react-hot-toast', 'react-icons',
  '@react-google-maps/api', '@googlemaps/js-api-loader', 'leaflet', 'react-leaflet', '@mui/material', '@mui/icons-material',
  'canvas-confetti', 'gsap', 'jspdf', 'jspdf-autotable', 'html2canvas', 'file-saver', 'xlsx', 'react-easy-crop', 'lenis',
  'clsx', 'tailwind-merge', 'class-variance-authority', '@radix-ui/react-dialog', 'next-themes', 'recharts',
]);
const WEB_PATTERNS = [
  [/\bclassName\s*=/, 'className= (use style)'],
  [/<\s*(div|span|p|button|img|input|textarea|select|option|label|a|ul|li|ol|section|header|footer|main|nav|form|h[1-6]|svg|table|tr|td|th|iframe|video|audio|br|hr|strong|em|small)\b[\s>/]/, 'HTML element'],
  [/\bdocument\.(getElementById|querySelector|createElement|body|documentElement|head|cookie|activeElement)/, 'DOM access'],
  [/\bwindow\.(google|flutter_inappwebview|Razorpay|scrollY|pageYOffset|visualViewport)\b/, 'web-only window API'],
  [/\b(onClick|onMouseEnter|onMouseLeave|onKeyDown|onChange)\s*=\s*\{/, 'DOM event prop (onPress / onChangeText ...)'],
  [/\bimport\.meta\b/, 'import.meta (use globalThis.__ENV__)'],
  [/StyleSheet\.absoluteFillObject/, 'StyleSheet.absoluteFillObject (removed in RN 0.88: use StyleSheet.absoluteFill)'],
  [/\bnew\s+(FileReader|Image\(|IntersectionObserver|ResizeObserver|MutationObserver)/, 'browser-only class'],
  [/\b(requestAnimationFrame)\s*\(\s*\(\)\s*=>\s*\{[^}]*document/, 'rAF + DOM'],
];

const resolveSpec = (from, spec) => {
  let base = null;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else {
    for (const [re, to] of ALIAS) {
      if (re.test(spec)) {
        base = path.join(SRC, spec.replace(re, to));
        break;
      }
    }
  }
  if (!base) return { pkg: spec };
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return { file: p };
  }
  return { missing: base };
};

const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
const pkgExists = (spec) => {
  const name = pkgName(spec);
  if (WEB_PACKAGES.has(name)) return 'web';
  return fs.existsSync(path.join(ROOT, 'node_modules', name)) ? 'ok' : 'missing';
};

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f), out);
  else if (/\.(jsx?|tsx?)$/.test(p)) out.push(p);
  return out;
}

const targets = process.argv.slice(2).flatMap((a) => walk(path.resolve(a)));
let problems = 0;
for (const file of targets) {
  const rel = path.relative(ROOT, file);
  const code = fs.readFileSync(file, 'utf8');
  const issues = [];
  try {
    babel.transformSync(code, { filename: file, cwd: ROOT, babelrc: false, configFile: path.join(ROOT, 'babel.config.js'), presets: [], ast: false, code: false, caller: { name: 'metro', platform: 'android', bundler: 'metro' } });
  } catch (e) {
    issues.push(`syntax: ${String(e.message).split('\n')[0]}`);
  }
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const re = /(?:from\s*|import\s*\(\s*|import\s+|require\(\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(stripped))) {
    const spec = m[1];
    const r = resolveSpec(file, spec);
    if (r.missing) {
      if (ASSET.test(spec) || !fs.existsSync(path.dirname(r.missing))) issues.push(`missing import: ${spec}`);
      else issues.push(`missing import: ${spec}`);
    } else if (r.pkg) {
      const s = pkgExists(spec);
      if (s === 'web') issues.push(`web-only package: ${spec}`);
      else if (s === 'missing') issues.push(`package not installed: ${spec}`);
    }
  }
  if (/\.(jsx|tsx)$/.test(file) || /<[A-Z]/.test(stripped)) {
    for (const [pat, label] of WEB_PATTERNS) {
      const hit = stripped.match(pat);
      if (hit) issues.push(`${label}: "${hit[0].trim().slice(0, 40)}"`);
    }
  } else {
    for (const [pat, label] of WEB_PATTERNS.slice(2, 7)) {
      const hit = stripped.match(pat);
      if (hit) issues.push(`${label}: "${hit[0].trim().slice(0, 40)}"`);
    }
  }
  if (issues.length) {
    problems += issues.length;
    console.log(`✗ ${rel}`);
    issues.forEach((i) => console.log(`    ${i}`));
  } else if (targets.length <= 20) {
    console.log(`✓ ${rel}`);
  }
}
console.log(`\n${targets.length} file(s), ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
