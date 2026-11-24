// Prints the functions taking the most self time in a V8 .cpuprofile (node --cpu-prof).
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const self = new Map();
const dt = new Map();
for (let i = 0; i < p.samples.length; i++) dt.set(p.samples[i], (dt.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0));
for (const n of p.nodes) {
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dt.get(n.id) ?? 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${((100 * v) / total).toFixed(1).padStart(5)} %  ${k}`);
