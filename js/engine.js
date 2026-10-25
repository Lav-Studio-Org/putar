// Core simulation. Pure logic, no DOM, so it runs in the browser and in Node
// (scripts/test-engine.js and scripts/balance.js use it headlessly).
//
// PUTAR!: a ball circles a core on one of two lanes (inner / outer). One tap swaps
// lanes. Spikes kill, sparks ("kilau") score and build a combo, coins pay coins.
// A combo of FEVER_AT starts FEVER: spikes ahead turn into sparks for a few seconds,
// then the combo resets so the next FEVER has to be earned again.
// The run is endless; speed and pattern density rise with time.
//
// Solvability (docs/07-testing.md): every item "demands" a lane (a spark its own lane,
// a spike the other one). The generator keeps any two items with different demands at
// least `minSep` apart, which leaves time to clear one and finish the swap before the
// next. scripts/test-engine.js proves it with a perfect bot on hundreds of seeds.
(function (root) {
  'use strict';

  const W = 360, H = 640, CX = 180, CY = 330;
  const LANES = [92, 148];
  const BALL_R = 11, SPIKE_R = 12, SPARK_R = 7, COIN_R = 10;
  const HIT_D = (BALL_R + SPIKE_R) * 0.85;   // forgiving spike hitbox
  const GRAB_D = BALL_R + SPARK_R + 9;       // generous pickup radius
  const COLL_ANG = 0.23;                     // spike hit half-width in radians on the inner lane
  const SWITCH_T = 0.12;                     // seconds to move between lanes
  const W0 = 1.8, W_ACC = 0.024, W_MAX = 3.6; // angular speed in rad/s
  const LOOKAHEAD = Math.PI * 1.3;           // generate until items exist this far ahead
  // At high speed a chunk can reach past a full lap. Items further ahead than VIS are
  // not on the ring yet (not drawn, cannot collide), so nothing overlaps the ball's past.
  const VIS = Math.PI * 1.35;
  const BEHIND = 0.9;                        // passed items stay visible this long (rad)
  const FEVER_AT = 40, FEVER_T = 5;
  const NEAR_T = 0.24;                       // swap this close before a spike = near miss
  const NEAR_BONUS = 3;

  // Daily mission pool. Targets come from scripts/balance.js (simulated players), so
  // an average player finishes each one in a few runs.
  const MISSIONS = [
    { id: 'sparks', text: 'Kumpulkan {n} kilau', n: 480, reward: 40 },
    { id: 'combo', text: 'Capai combo {n}', n: 70, reward: 50 },
    { id: 'near', text: 'Lolos tipis {n} kali', n: 5, reward: 50 },
    { id: 'score', text: 'Skor {n} dalam satu ronde', n: 810, reward: 60 },
    { id: 'games', text: 'Main {n} kali', n: 6, reward: 30 },
    { id: 'fever', text: 'Masuk FEVER {n} kali', n: 4, reward: 60 },
    { id: 'coins', text: 'Ambil {n} koin di lintasan', n: 12, reward: 40 },
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const omega = (t) => Math.min(W_MAX, W0 + W_ACC * t);
  const diff = (t) => Math.min(1, t / 80);
  const lerp = (a, b, k) => a + (b - a) * k;
  const demand = (it) => (it.type === 'spike' ? 1 - it.lane : it.lane);

  function createWorld(seed, opts = {}) {
    const w = {
      rng: mulberry32(seed >>> 0), t: 0,
      pa: -Math.PI / 2, lane: 1, pr: LANES[1], switchT: -9, lastFrom: 1,
      items: [], nextId: 1, genA: -Math.PI / 2 + 1.4, lastDemand: [-99, -99],
      score: 0, sparks: 0, coins: 0, combo: 0, bestCombo: 0, nears: 0, fevers: 0, switches: 0,
      feverLeft: 0, invuln: 0, shield: !!opts.shield,
      over: false, events: [],
    };
    while (w.genA < w.pa + LOOKAHEAD) gen(w);
    return w;
  }

  function put(w, a, lane, type, sep) {
    w.items.push({ id: w.nextId++, a, lane, type, st: 0, sep });
  }

  // Appends one pattern ("chunk") of items after w.genA.
  function gen(w) {
    const r = w.rng, gt = w.t + (w.genA - w.pa) / omega(w.t); // rough arrival time
    const d = diff(gt), om = omega(gt + 1);
    const sec = (s) => s * om;
    const minSep = 2 * COLL_ANG + sec(lerp(0.5, 0.3, d));
    const SP = sec(0.1);
    const L = r() < 0.5 ? 0 : 1, O = 1 - L;
    const fever = w.feverLeft > (w.genA - w.pa) / omega(w.t) + 0.2;
    const rel = [];   // [da, lane, type]
    const row = (from, lane, n) => { for (let i = 0; i < n; i++) rel.push([from + i * SP, lane, 'spark']); return from + (n - 1) * SP; };

    if (fever) {
      row(0, L, 6);
    } else if (gt < 3) {
      row(0, L, 4 + Math.floor(r() * 3));
    } else {
      const P = [
        ['row', 2.6 - 1.6 * d], ['block', 2], ['zig', 0.8 + 3 * d], ['tunnel', 0.6 + 1.2 * d],
        ['bait', 0.4 + 2 * d], ['coin', 0.55],
      ];
      let x = r() * P.reduce((s, p) => s + p[1], 0), kind = 'row';
      for (const [k, wt] of P) { if ((x -= wt) <= 0) { kind = k; break; } }
      if (gt < 8 && kind !== 'row' && kind !== 'coin') kind = 'block';
      if (kind === 'row') row(0, L, 4 + Math.floor(r() * 4));
      else if (kind === 'block') {
        row(0, O, 3);
        rel.push([SP, L, 'spike']);
      } else if (kind === 'zig') {
        const m = 2 + Math.floor(r() * (1 + 3 * d));
        for (let k = 0; k < m; k++) {
          const lane = k % 2 ? O : L;
          rel.push([k * minSep, lane, 'spike']);
          rel.push([k * minSep, 1 - lane, 'spark']);
        }
      } else if (kind === 'tunnel') {
        const n = 3 + Math.floor(r() * (2 + 3 * d)), g = sec(0.07);
        for (let k = 0; k < n; k++) {
          rel.push([k * g, L, 'spike']);
          if (k % 2 === 0) rel.push([k * g, O, 'spark']);
        }
      } else if (kind === 'bait') {
        // sparks lead straight into a spike: leave at the last moment for a near miss
        const end = row(0, L, 3 + Math.floor(r() * 3));
        rel.push([end + minSep, L, 'spike']);
        rel.push([end + minSep, O, 'spark']);
      } else {
        row(0, L, 2);
        rel.push([2 * SP, L, 'coin']);
        row(3 * SP, L, 2);
      }
    }
    if (!fever && rel.some((e) => e[2] === 'spark') && r() < 0.06 + 0.04 * d) {
      const sparks = rel.filter((e) => e[2] === 'spark');
      sparks[Math.floor(r() * sparks.length)][2] = 'coin';
    }

    // earliest start that keeps every opposite-demand pair minSep apart
    let a0 = w.genA;
    for (const [da, lane, type] of rel) {
      const dm = type === 'spike' ? 1 - lane : lane;
      a0 = Math.max(a0, w.lastDemand[1 - dm] + minSep - da);
    }
    let end = a0;
    for (const [da, lane, type] of rel) {
      const a = a0 + da;
      put(w, a, lane, type, minSep);
      const dm = type === 'spike' ? 1 - lane : lane;
      w.lastDemand[dm] = Math.max(w.lastDemand[dm], a);
      end = Math.max(end, a);
    }
    w.genA = end + sec(lerp(0.45, 0.16, d));
  }

  function ballPos(w) { return [CX + Math.cos(w.pa) * w.pr, CY + Math.sin(w.pa) * w.pr]; }
  function itemPos(it) { const R = LANES[it.lane]; return [CX + Math.cos(it.a) * R, CY + Math.sin(it.a) * R]; }

  // Swap lanes. Returns false when the round is over.
  function tap(w) {
    if (w.over) return false;
    w.lastFrom = w.lane;
    w.lane = 1 - w.lane;
    w.switchT = w.t;
    w.switches++;
    w.events.push({ type: 'switch', lane: w.lane });
    return true;
  }

  function startFever(w) {
    w.feverLeft = FEVER_T;
    w.fevers++;
    for (const it of w.items) {
      if (it.st === 0 && it.type === 'spike' && it.a > w.pa + 0.3) { it.type = 'spark'; it.converted = true; }
    }
    w.events.push({ type: 'fever' });
  }

  function collect(w, it) {
    it.st = 2;
    const [x, y] = itemPos(it);
    if (it.type === 'coin') {
      w.coins++;
      w.events.push({ type: 'coin', x, y });
      return;
    }
    w.combo++;
    w.sparks++;
    w.bestCombo = Math.max(w.bestCombo, w.combo);
    const gain = Math.min(5, 1 + Math.floor(w.combo / 10)) * (w.feverLeft > 0 ? 2 : 1);
    w.score += gain;
    w.events.push({ type: 'spark', x, y, combo: w.combo, gain, fever: w.feverLeft > 0 });
    if (w.combo === FEVER_AT && w.feverLeft <= 0) startFever(w);
  }

  function step(w, dt) {
    if (w.over) return;
    w.t += dt;
    w.pa += omega(w.t) * dt;
    const target = LANES[w.lane], v = ((LANES[1] - LANES[0]) / SWITCH_T) * dt;
    w.pr = w.pr < target ? Math.min(target, w.pr + v) : Math.max(target, w.pr - v);
    if (w.feverLeft > 0) { w.feverLeft -= dt; if (w.feverLeft <= 0) { w.feverLeft = 0; w.combo = 0; w.events.push({ type: 'feverEnd' }); } }
    if (w.invuln > 0) w.invuln = Math.max(0, w.invuln - dt);
    while (w.genA < w.pa + LOOKAHEAD) gen(w);

    const [bx, by] = ballPos(w);
    for (const it of w.items) {
      if (it.st !== 0 || it.a - w.pa > 1) continue;
      const [ix, iy] = itemPos(it);
      const dist = Math.hypot(ix - bx, iy - by);
      if (it.type === 'spike') {
        if (dist < HIT_D) {
          if (w.invuln > 0) continue;
          if (w.shield) {
            w.shield = false; w.invuln = 1; it.st = 2;
            w.events.push({ type: 'shield', x: ix, y: iy });
            continue;
          }
          w.over = true;
          w.events.push({ type: 'hit', x: ix, y: iy });
          return;
        }
        if (!it.crossed && w.pa >= it.a) {
          it.crossed = true;
          if (w.lastFrom === it.lane && w.lane !== it.lane && w.t - w.switchT < NEAR_T) {
            w.nears++;
            w.score += NEAR_BONUS;
            w.events.push({ type: 'near', x: ix, y: iy, gain: NEAR_BONUS });
          }
        }
        if (w.pa > it.a + 0.35) it.st = 1;
      } else if (dist < GRAB_D) {
        collect(w, it);
      } else if (w.pa > it.a + 0.3) {
        it.st = 1;
        // in FEVER sparks cover both lanes, so a missed one does not cost the combo
        if (it.type === 'spark' && w.feverLeft <= 0 && w.combo > 0) {
          w.events.push({ type: 'break', combo: w.combo });
          w.combo = 0;
        }
      }
    }
    w.items = w.items.filter((it) => it.st !== 2 && w.pa < it.a + BEHIND);
  }

  // Continue after a hit (rewarded ad): clears the spikes close ahead, short grace time.
  function revive(w) {
    w.over = false;
    w.invuln = 1.5;
    w.items = w.items.filter((it) => !(it.type === 'spike' && it.a > w.pa - 0.6 && it.a < w.pa + 2.2));
    w.events.push({ type: 'revive' });
  }

  const Engine = {
    W, H, CX, CY, LANES, BALL_R, SPIKE_R, SPARK_R, COIN_R, COLL_ANG, SWITCH_T, VIS, FEVER_AT, FEVER_T, MISSIONS,
    mulberry32, hashStr, omega, diff, demand, createWorld, tap, step, revive, ballPos, itemPos,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else (root.PT = root.PT || {}).Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
