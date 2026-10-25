// Player profile, coins, daily reward, daily missions, ball collection, event bus and
// analytics stub.
(() => {
  'use strict';
  const PT = (window.PT = window.PT || {});
  const KEY = 'putar.profile.v1'; // bump only with a migration

  // ---------- tiny event bus + analytics stub ----------
  const listeners = {};
  PT.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  PT.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));
  // Replace with Firebase/GameAnalytics later; every interesting moment already calls this.
  PT.track = (name, data) => { if (PT.debug) console.log('[track]', name, data || ''); };

  // ---------- dates (local day, YYYY-MM-DD) ----------
  const pad = (n) => String(n).padStart(2, '0');
  PT.today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  PT.dayDiff = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);

  // ---------- profile ----------
  const DEFAULT = {
    v: 1, coins: 0, games: 0, best: 0, totalSparks: 0, ball: 0, shields: 0, noAds: false, tutorialDone: false,
    settings: { sound: true, music: true, vibe: true },
    daily: { last: '', streak: 0 },
    missions: { day: '', list: [] },
  };
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === 1) {
        const p = Object.assign(structuredClone(DEFAULT), raw);
        p.settings = Object.assign(structuredClone(DEFAULT.settings), raw.settings);
        return p;
      }
    } catch (e) { /* storage blocked or corrupt */ }
    return structuredClone(DEFAULT);
  }
  PT.profile = load();
  PT.save = () => { try { localStorage.setItem(KEY, JSON.stringify(PT.profile)); } catch (e) { /* ignore */ } };

  PT.addCoins = (n, why) => {
    PT.profile.coins = Math.max(0, PT.profile.coins + n);
    PT.save();
    PT.track('coins', { n, why });
    PT.emit('coins', PT.profile.coins);
  };

  // ---------- daily reward with streak ----------
  PT.DAILY_REWARDS = [20, 30, 40, 50, 60, 80, 150];
  PT.dailyState = () => {
    const d = PT.profile.daily, t = PT.today();
    if (d.last === t) return { canClaim: false, day: (d.streak - 1) % 7 };
    const keep = d.last && PT.dayDiff(d.last, t) === 1;
    return { canClaim: true, day: keep ? d.streak % 7 : 0 };
  };
  PT.claimDaily = (mult) => {
    const st = PT.dailyState();
    if (!st.canClaim) return 0;
    const d = PT.profile.daily;
    d.streak = st.day + 1;
    d.last = PT.today();
    const n = PT.DAILY_REWARDS[st.day] * (mult || 1);
    PT.addCoins(n, 'daily');
    return n;
  };

  // ---------- ball collection: unlocks only go up, every run fills the bar ----------
  // Sparks needed (lifetime) for each ball. Colours: body, glow / trail.
  PT.BALLS = [
    { name: 'Kilat', need: 0, c: '#fff7e8', g: '#ffd23f' },
    { name: 'Jeruk', need: 150, c: '#ff9f43', g: '#ffd23f' },
    { name: 'Laut', need: 400, c: '#38bdf8', g: '#a5f3fc' },
    { name: 'Daun', need: 800, c: '#4ade80', g: '#bbf7d0' },
    { name: 'Anggur', need: 1300, c: '#a78bfa', g: '#ddd6fe' },
    { name: 'Mawar', need: 2000, c: '#fb7185', g: '#fecdd3' },
    { name: 'Malam', need: 3000, c: '#1e1b4b', g: '#818cf8' },
    { name: 'Emas', need: 4500, c: '#facc15', g: '#fff7ae' },
  ];
  PT.ballsUnlocked = (sparks = PT.profile.totalSparks) => PT.BALLS.filter((b) => sparks >= b.need).length;
  PT.nextBall = () => PT.BALLS[PT.ballsUnlocked()] || null;

  // ---------- shields ----------
  PT.SHIELD_PRICE = 80;
  PT.SHIELD_MAX = 5;

  // ---------- daily missions: 3 per day from the pool, picked with a date seed ----------
  PT.missions = () => {
    const m = PT.profile.missions, t = PT.today();
    if (m.day !== t) {
      const E = PT.Engine, rng = E.mulberry32(E.hashStr('misi' + t));
      const pool = E.MISSIONS.slice();
      m.day = t;
      m.list = [];
      for (let i = 0; i < 3; i++) {
        const def = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        m.list.push({ id: def.id, n: def.n, reward: def.reward, p: 0, claimed: false });
      }
      PT.save();
    }
    return m.list;
  };
  PT.missionText = (m) => PT.Engine.MISSIONS.find((d) => d.id === m.id).text.replace('{n}', m.n.toLocaleString('id-ID'));
  // Feeds one finished run into the missions. Returns the missions completed by it.
  PT.missionRun = (w) => {
    const done = [];
    for (const m of PT.missions()) {
      if (m.p >= m.n) continue;
      const add = { sparks: w.sparks, near: w.nears, games: 1, fever: w.fevers, coins: w.coins }[m.id];
      if (add !== undefined) m.p = Math.min(m.n, m.p + add);
      else if (m.id === 'combo') m.p = Math.max(m.p, Math.min(m.n, w.bestCombo));
      else if (m.id === 'score') m.p = Math.max(m.p, Math.min(m.n, w.score));
      if (m.p >= m.n) done.push(m);
    }
    PT.save();
    return done;
  };
  PT.claimMission = (i, mult) => {
    const m = PT.missions()[i];
    if (!m || m.claimed || m.p < m.n) return 0;
    m.claimed = true;
    const n = m.reward * (mult || 1);
    PT.addCoins(n, 'mission');
    PT.track('mission_claim', { id: m.id, n });
    return n;
  };
  PT.missionsClaimable = () => PT.missions().some((m) => !m.claimed && m.p >= m.n);
})();
