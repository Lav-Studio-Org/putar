// Simulated players shared by scripts/test-engine.js and scripts/balance.js.
// The bot looks at the nearest upcoming item and works out which lane it wants.
// A perfect bot swaps as soon as that is safe. A human bot waits until the item is
// `lead` seconds away (sampled per decision) and then swaps, so a small lead means a
// late swap: a near miss, or a hit. Spread grows with speed, like a real thumb.
const E = require('../js/engine.js');

function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const perfect = () => Infinity;
// `lapse` is the chance per decision of misreading the board entirely (swapping far too late)
const human = (mu, sigma, lapse = 0) => (rng, w) => (rng() < lapse ? 0.1 * rng() : mu + sigma * (E.omega(w.t) / E.omega(0)) * gauss(rng));

// Plays one run. Returns the finished world (w.over is false if maxT was reached).
function play(seed, { lead = perfect, maxT = 300, dt = 1 / 60, shield = false, onStep } = {}) {
  const w = E.createWorld(seed, { shield });
  const rng = E.mulberry32(seed ^ 0x5bd1e995);
  let plan = null; // { id, lead }
  while (!w.over && w.t < maxT) {
    let next = null;
    for (const it of w.items) if (it.st === 0 && it.a >= w.pa - 0.02 && (!next || it.a < next.a)) next = it;
    if (next && E.demand(next) !== w.lane) {
      if (!plan || plan.id !== next.id) plan = { id: next.id, lead: lead(rng, w) };
      const other = 1 - w.lane;
      const blocked = w.items.some((it) => it.st === 0 && it.type === 'spike' && it.lane === other && it.a > w.pa - 0.3 && it.a < w.pa + 0.05);
      const arrive = (next.a - w.pa) / E.omega(w.t);
      if (!blocked && arrive <= plan.lead) { E.tap(w); plan = null; }
    } else plan = null;
    E.step(w, dt);
    if (onStep) onStep(w);
    w.events.length = 0;
  }
  return w;
}

module.exports = { play, human, perfect, gauss };
