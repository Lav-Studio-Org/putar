// Balancing by simulation (docs/06-level-balancing.md): simulated players of three skill
// levels play many runs. Prints run length / score distributions and suggests daily
// mission targets so an average player finishes each mission in a few runs.
// With --write it updates the `n:` values of MISSIONS in js/engine.js.
// Usage: node scripts/balance.js [runs=400] [--write]
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const { play, human } = require('./bot.js');
const N = +process.argv[2] || 400;

// how far ahead (seconds) the player swaps for an item: mean / spread at start speed / lapse chance
const SKILLS = { pemula: [0.42, 0.12, 0.06], rata: [0.4, 0.09, 0.025], jago: [0.36, 0.06, 0.008] };

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = {};
for (const [name, [mu, sg, lapse]] of Object.entries(SKILLS)) {
  const runs = Array.from({ length: N }, (_, i) => play(5000 + i, { lead: human(mu, sg, lapse), maxT: 600 }));
  const col = (k) => runs.map((w) => w[k]);
  stats[name] = { t: col('t'), score: col('score'), sparks: col('sparks'), combo: col('bestCombo'), nears: col('nears'), fevers: col('fevers'), coins: col('coins') };
  const s = stats[name];
  console.log(`${name.padEnd(7)} run ${q(s.t, 0.25).toFixed(0)}/${q(s.t, 0.5).toFixed(0)}/${q(s.t, 0.75).toFixed(0)}s  score ${q(s.score, 0.25)}/${q(s.score, 0.5)}/${q(s.score, 0.75)}  ` +
    `sparks med ${q(s.sparks, 0.5)}  combo med ${q(s.combo, 0.5)}  near med ${q(s.nears, 0.5)}  fever/run ${(s.fevers.reduce((a, b) => a + b, 0) / N).toFixed(2)}  coins med ${q(s.coins, 0.5)}`);
}

// Mission targets come from the beginner bot (most players who see missions are new):
// sums over ~3 runs, single-run goals at the 60th percentile.
const r = stats.pemula, mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const round = (n, k) => Math.max(k, Math.round(n / k) * k);
const target = {
  sparks: round(3 * mean(r.sparks), 10),
  combo: round(q(r.combo, 0.6), 5),
  near: round(3 * mean(r.nears), 1),
  score: round(q(r.score, 0.6), 10),
  games: 6,
  fever: Math.max(1, Math.round(2 * mean(r.fevers))),
  coins: round(3 * mean(r.coins), 1),
};
console.log('mission targets', JSON.stringify(target));
if (process.argv.includes('--write')) {
  const file = path.join(__dirname, '../js/engine.js');
  let src = fs.readFileSync(file, 'utf8');
  for (const [id, n] of Object.entries(target)) src = src.replace(new RegExp(`(id: '${id}',[^\\n]*n: )\\d+`), `$1${n}`);
  fs.writeFileSync(file, src);
  console.log('js/engine.js updated');
}
