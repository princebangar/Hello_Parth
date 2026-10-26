#!/usr/bin/env node
// Also: every horizontal ScrollView / FlatList must have style flexGrow: 0 (RN 0.88 lets it fill the screen otherwise).
// Text placed directly inside a View (not inside <Text>) crashes the screen in React Native. Parses every .jsx file with
// Babel and flags, inside View-like elements (View, Pressable, ScrollView, Animated.View, LinearGradient, ...):
//   - JSX text that is not only whitespace
//   - {'string'} / {`template`} / {number} children
//   - {cond && <X/>} where cond can be a number or a string (x.length, count, a ?? or || chain, a .toString()):
//     React Native renders a 0 / '' as raw text. Flagged as "risky" (exit code 1 too: write `cond ? <X/> : null`).
//   - {a ? 'text' : <X/>}: a string branch of a ternary.
//   node scripts/check-raw-text.cjs [files|dirs]   (default: src)
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const targets = args.length ? args : [path.join(ROOT, 'src')];

const VIEW_LIKE = new Set([
  'View', 'Pressable', 'ScrollView', 'SafeAreaView', 'KeyboardAvoidingView', 'TouchableOpacity', 'TouchableHighlight',
  'TouchableWithoutFeedback', 'LinearGradient', 'BlurView', 'Animated.View', 'Animated.ScrollView', 'Reanimated.View',
  'Screen', 'Sheet', 'Dialog', 'Overlay', 'Modal', 'AppMap', 'MapView', 'Marker', 'GestureDetector',
]);

function walkFiles(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walkFiles(path.join(p, f), out);
  else if (/\.(jsx|tsx)$/.test(p)) out.push(p);
  return out;
}

const nameOf = (n) => {
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${nameOf(n.object)}.${nameOf(n.property)}`;
  return '';
};

// can this expression evaluate to a number or a non-empty / empty string?
function maybeNumberOrString(e) {
  if (!e) return false;
  switch (e.type) {
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'TemplateLiteral':
      return true;
    case 'MemberExpression':
      return !e.computed && e.property.name === 'length';
    case 'OptionalMemberExpression':
      return !e.computed && e.property.name === 'length';
    case 'LogicalExpression':
      return e.operator === '&&' ? maybeNumberOrString(e.right) : maybeNumberOrString(e.left) || maybeNumberOrString(e.right);
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '%'].includes(e.operator);
    case 'CallExpression':
    case 'OptionalCallExpression': {
      const callee = e.callee.property?.name || e.callee.name || '';
      return /^(toString|toFixed|trim|join|String|Number|parseInt|parseFloat|Math\.)/.test(callee);
    }
    default:
      return false;
  }
}

const problems = [];
let files = 0;
for (const file of targets.flatMap((t) => walkFiles(path.resolve(t)))) {
  files += 1;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    problems.push(`${rel}: parse error ${e.message}`);
    continue;
  }
  const visit = (node, parentName) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, parentName));
      return;
    }
    if (node.type === 'JSXElement') {
      const name = nameOf(node.openingElement.name);
      // a horizontal ScrollView / FlatList grows to the screen height on RN 0.88 unless its style has flexGrow: 0
      if (/(^|\.)(ScrollView|FlatList|SectionList)$/.test(name)) {
        const attrs = node.openingElement.attributes;
        const horizontal = attrs.find((a) => a.type === 'JSXAttribute' && a.name.name === 'horizontal');
        const isHorizontal = horizontal && (!horizontal.value || horizontal.value.expression?.value !== false);
        if (isHorizontal) {
          const style = attrs.find((a) => a.type === 'JSXAttribute' && a.name.name === 'style');
          const styleSrc = style ? source.slice(style.start, style.end) : '';
          let ok = /flexGrow\s*:\s*0/.test(styleSrc);
          if (!ok) {
            // style={styles.row} / [styles.row, ...]: look at that style's definition
            for (const m of styleSrc.matchAll(/\b(?:styles|s)\.(\w+)/g)) {
              const def = new RegExp(`\\b${m[1]}\\s*:\\s*\\{[^}]*flexGrow\\s*:\\s*0`).test(source);
              if (def) ok = true;
            }
          }
          if (!ok) problems.push(`${rel}:${node.loc.start.line}  horizontal <${name}> without style flexGrow: 0`);
        }
      }
      if (VIEW_LIKE.has(name)) {
        for (const child of node.children) {
          const line = child.loc?.start.line;
          if (child.type === 'JSXText' && child.value.trim()) {
            problems.push(`${rel}:${line}  raw text in <${name}>: "${child.value.trim().slice(0, 40)}"`);
          } else if (child.type === 'JSXExpressionContainer') {
            const e = child.expression;
            if (['StringLiteral', 'TemplateLiteral', 'NumericLiteral'].includes(e.type)) {
              problems.push(`${rel}:${line}  string/number child in <${name}>`);
            } else if (e.type === 'LogicalExpression' && e.operator === '&&' && maybeNumberOrString(e.left)) {
              problems.push(`${rel}:${line}  risky {x && ...} in <${name}> (x can be 0 / '')`);
            } else if (e.type === 'ConditionalExpression' && (['StringLiteral', 'TemplateLiteral'].includes(e.consequent.type) || ['StringLiteral', 'TemplateLiteral'].includes(e.alternate.type))) {
              problems.push(`${rel}:${line}  string branch of a ternary in <${name}>`);
            }
          }
        }
      }
      visit(node.openingElement.attributes, name);
      visit(node.children, name);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue;
      const v = node[key];
      if (v && typeof v === 'object') visit(v, parentName);
    }
  };
  visit(ast.program, '');
}

problems.forEach((p) => console.log(p));
console.log(`\n${files} file(s), ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
