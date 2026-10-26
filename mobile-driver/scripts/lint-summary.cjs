// node scripts/lint-summary.cjs [rule ...] — reads lint-report.json (npx eslint src -f json -o lint-report.json)
// and prints the messages of the given rules (or a count per rule when no rule is given).
const path = require('path');
const report = require(path.resolve(__dirname, '..', 'lint-report.json'));
const rules = process.argv.slice(2);
const counts = {};
for (const file of report) {
  const rel = path.relative(path.resolve(__dirname, '..', 'src'), file.filePath);
  for (const m of file.messages) {
    const id = String(m.ruleId);
    counts[`${id} (${m.severity === 2 ? 'error' : 'warn'})`] = (counts[`${id} (${m.severity === 2 ? 'error' : 'warn'})`] || 0) + 1;
    if (rules.includes(id)) console.log(`${rel}:${m.line} ${id} ${m.message.slice(0, 120)}`);
  }
}
if (!rules.length) console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join('\n'));
