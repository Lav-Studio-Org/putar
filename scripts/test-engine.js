// Pure-logic tests for js/engine.js. Runs in CI (test.yml). Exit code 1 on any failure.
// Pattern to keep: invariants over many seeded random runs, plus a few exact cases.
const E = require('../js/engine.js');
const { play } = require('./bot.js');
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; if (bad < 30) console.log('FAIL', msg); } };

// exact cases
{
  const w = E.createWorld(1);
  check(w.items.length > 0 && w.items.every((it) => it.type === 'spark' || it.type === 'coin'), 'opening has no spikes');
  check(w.lane === 1 && E.tap(w) && w.lane === 0, 'tap swaps lanes');
  E.step(w, 0.2);
  check(Math.abs(w.pr - E.LANES[0]) < 1e-9, 'swap finishes within SWITCH_T');
  // spike straight ahead on our lane kills, a shield absorbs it once
  for (const shield of [false, true]) {
    const s = E.createWorld(2, { shield });
    s.items = [{ id: 999, a: s.pa + 0.05, lane: s.lane, type: 'spike', st: 0 }];
    s.genA = s.pa + 99;
    E.step(s, 1 / 60);
    check(s.over === !shield, `spike ahead: over=${s.over} shield=${shield}`);
  }
  // combo of FEVER_AT sparks starts FEVER and turns spikes ahead into sparks
  const f = E.createWorld(3);
  f.combo = E.FEVER_AT - 1;
  f.items = [{ id: 1, a: f.pa + 0.02, lane: f.lane, type: 'spark', st: 0 }, { id: 2, a: f.pa + 2, lane: 0, type: 'spike', st: 0 }];
  f.genA = f.pa + 99;
  E.step(f, 1 / 60);
  check(f.feverLeft > 0 && f.fevers === 1 && f.items.every((it) => it.type !== 'spike'), 'FEVER starts and converts spikes');
}

// solvability: a perfect player never dies, on many seeds, for 4 minutes of play
let perfectDeaths = 0;
for (let seed = 1; seed <= 300; seed++) {
  let pairBad = 0;
  const w = play(seed, {
    maxT: 240,
    onStep: (w) => {
      // opposite-demand items are always at least minSep apart
      const its = w.items.filter((it) => !it.converted).sort((a, b) => a.a - b.a);
      for (let i = 0; i < its.length; i++) {
        for (let j = i + 1; j < its.length && its[j].a - its[i].a < its[i].sep; j++) {
          if (E.demand(its[i]) !== E.demand(its[j]) && its[j].a - its[i].a < Math.min(its[i].sep, its[j].sep) - 1e-9) pairBad++;
        }
      }
    },
  });
  check(pairBad === 0, `seed ${seed}: ${pairBad} item pairs closer than minSep`);
  if (w.over) { perfectDeaths++; check(false, `perfect bot died on seed ${seed} at t=${w.t.toFixed(1)} score ${w.score}`); }
  check(w.score >= w.sparks, 'score is at least the spark count');
  check(w.bestCombo >= w.combo, 'best combo tracks combo');
}

// revive clears the way
{
  const w = play(7, { lead: () => 0.05, maxT: 300 });
  check(w.over, 'a very slow player dies');
  E.revive(w);
  for (let i = 0; i < 30; i++) E.step(w, 1 / 60);
  check(!w.over, 'revive gives a safe restart');
}

console.log(bad ? `${bad} failures (perfect bot deaths ${perfectDeaths})` : 'engine OK');
process.exit(bad ? 1 : 0);
