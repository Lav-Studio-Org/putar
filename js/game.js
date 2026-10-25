// Game flow and UI: screens, canvas rendering, modals, pause/back handling, test hook.
(() => {
  'use strict';
  const PT = window.PT;
  const E = PT.Engine;
  const P = PT.profile;
  const $ = (id) => document.getElementById(id);
  const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const fmt = (n) => n.toLocaleString('id-ID');

  // ---------- State ----------
  // state: home | intro | ready | playing | paused | dead | result
  let state = 'home', pausedFrom = 'playing', world = null, revived = false, doubled = false, recordShown = false;
  let autoplay = false;
  const fx = [];      // particles and floating texts
  const trail = [];
  let shake = 0, flash = 0;

  function vibrate(ms) {
    if (!P.settings.vibe) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('hidden'), 2200);
  }
  PT.on('ad-unavailable', () => toast('Iklan belum tersedia, coba lagi sebentar lagi.'));
  PT.on('coins', (n) => ($('hud-coins').textContent = fmt(n)));

  // ---------- Modal ----------
  let modalName = null;
  function showModal(name, html) {
    modalName = name;
    $('card').innerHTML = html;
    $('modal').classList.remove('hidden');
  }
  function hideModal() { modalName = null; $('modal').classList.add('hidden'); }
  const closeBtn = '<button class="close-btn" data-act="close" aria-label="Tutup">' + ic('close') + '</button>';
  $('card').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    PT.Sfx.click();
    ACTIONS[b.dataset.act] && ACTIONS[b.dataset.act](b);
  });

  // ---------- Ball collection progress ----------
  function ballProgress(total = P.totalSparks) {
    const n = PT.ballsUnlocked(total), next = PT.BALLS[n];
    if (!next) return { done: true, pct: 100, text: 'Semua bola terbuka', num: '' };
    const prev = PT.BALLS[n - 1].need;
    return { done: false, pct: Math.round((100 * (total - prev)) / (next.need - prev)), text: `Bola baru: ${next.name}`, num: `${fmt(total - prev)}/${fmt(next.need - prev)} kilau`, next };
  }
  const ballDot = (b, size = 28) => `<i class="ball-dot" style="width:${size}px;height:${size}px;background:${b.c};box-shadow:0 0 0 3px ${b.g}66, 0 0 14px ${b.g}"></i>`;

  // ---------- Home ----------
  function renderHome() {
    $('hud-best').textContent = P.best ? fmt(P.best) : '-';
    $('hud-coins').textContent = fmt(P.coins);
    $('daily-dot').classList.toggle('hidden', !PT.dailyState().canClaim);
    $('missions-dot').classList.toggle('hidden', !PT.missionsClaimable());
    const bp = ballProgress();
    $('ballbar-text').textContent = bp.text;
    $('ballbar-num').textContent = bp.num;
    $('ballbar-fill').style.width = bp.pct + '%';
  }

  function goHome() {
    hideModal();
    state = 'home';
    world = null;
    document.body.classList.add('at-home');
    $('banner').classList.add('hidden');
    $('ready-bar').classList.add('hidden');
    PT.Music.bpm = 104;
    renderHome();
  }

  // ---------- Run ----------
  function startRun() {
    hideModal();
    world = E.createWorld(E.hashStr('run' + Date.now() + Math.random()));
    revived = false; doubled = false; recordShown = false;
    fx.length = 0; trail.length = 0;
    document.body.classList.remove('at-home');
    resize();
    PT.Music.bpm = 104;
    PT.Music.start();
    PT.track('round_start', { games: P.games });
    if (!P.tutorialDone) {
      state = 'intro';
      $('banner').classList.remove('hidden');
    } else enterReady();
  }
  function endIntro() {
    if (state !== 'intro') return;
    $('banner').classList.add('hidden');
    P.tutorialDone = true; PT.save();
    enterReady();
  }
  $('btn-start').addEventListener('click', () => { PT.Sfx.click(); endIntro(); });

  // waiting for the first tap: the ball holds still, so a run never starts by surprise
  function enterReady() {
    state = 'ready';
    renderReadyBar();
  }
  function renderReadyBar() {
    const bar = $('ready-bar');
    if (state !== 'ready' || revived) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    if (world.shield) bar.innerHTML = `<span class="chip on">${ic('shield')}Perisai aktif</span>`;
    else if (P.shields > 0) bar.innerHTML = `<button class="btn ghost" id="rb-shield">${ic('shield')}Pakai perisai (${P.shields})</button>`;
    else bar.innerHTML = `<button class="btn ad" id="rb-shield-ad">${ic('video')}Perisai gratis</button>`;
  }
  $('ready-bar').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || state !== 'ready') return;
    PT.Sfx.click();
    if (b.id === 'rb-shield' && P.shields > 0) {
      P.shields--; PT.save();
      world.shield = true;
    } else if (b.id === 'rb-shield-ad') {
      if (!(await PT.Ads.rewarded('shield_start'))) return;
      PT.Sfx.recover();
      world.shield = true;
    }
    PT.Sfx.coin();
    renderReadyBar();
  });

  function beginPlay() {
    state = 'playing';
    $('ready-bar').classList.add('hidden');
  }

  function onHit() {
    state = 'dead';
    setTimeout(() => { if (state === 'dead') offerRevive(); }, 700);
  }

  function offerRevive() {
    if (revived || world.score < 20) { showResults(); return; }
    const gap = P.best - world.score;
    const line = P.best && gap > 0 ? `Kurang ${fmt(gap)} lagi dari rekor!` : P.best ? 'Kamu sedang mencetak rekor baru!' : `Skor kamu ${fmt(world.score)}.`;
    showModal('revive', `<h2>Kena duri!</h2>
      <p>${line}<br>Mau lanjut dari sini?</p>
      <div class="actions">
        <button class="btn ad wide" data-act="revive" id="d-revive">${ic('video')}Hidupkan lagi</button>
        <button class="btn wide" data-act="results" id="d-results">Lihat hasil</button>
      </div>`);
  }

  function showResults() {
    state = 'result';
    const w = world;
    const prevBest = P.best, isBest = w.score > prevBest;
    if (isBest) P.best = w.score;
    const before = P.totalSparks, unlockedBefore = PT.ballsUnlocked(before);
    P.totalSparks += w.sparks;
    P.games++;
    PT.save();
    const doneMissions = PT.missionRun(w);
    PT.Ads.roundFinished();
    const coins = Math.floor(w.score / 50) + 5 * w.coins;
    PT.addCoins(coins, 'round');
    w.payout = coins;
    isBest ? PT.Sfx.win() : PT.Sfx.over();
    PT.track('round_end', { score: w.score, t: Math.round(w.t), sparks: w.sparks, combo: w.bestCombo });

    const title = isBest ? 'Rekor baru!' : prevBest && w.score >= prevBest * 0.85 ? 'Tipis banget!' : 'Ayo, sekali lagi!';
    const sub = isBest ? (prevBest ? `Rekor lama ${fmt(prevBest)}` : 'Rekor pertamamu') : `Terbaik ${fmt(prevBest)} · kurang ${fmt(prevBest - w.score)}`;
    const newBalls = PT.BALLS.slice(unlockedBefore, PT.ballsUnlocked());
    const bpFrom = ballProgress(before), bpTo = ballProgress();
    const from = newBalls.length ? 0 : bpFrom.pct;
    const ballHtml = newBalls.length
      ? `<div class="unlock">${ballDot(newBalls[newBalls.length - 1])}<span>Bola baru terbuka: <b>${newBalls.map((b) => b.name).join(', ')}</b></span></div>`
      : '';
    const missionHtml = doneMissions.map((m) => `<div class="mission-done">${ic('check')}Misi selesai: ${PT.missionText(m)}</div>`).join('');
    showModal('result', `<h2>${title}</h2>
      <div class="big-score">${fmt(w.score)}</div>
      <p class="sub">${sub}</p>
      <div class="run-stats">
        <span><b>${fmt(w.sparks)}</b>kilau</span><span><b>x${w.bestCombo}</b>combo</span><span><b>${w.nears}</b>tipis</span>
      </div>
      ${ballHtml}
      <div class="ballbar in-card">
        <span class="ballbar-top"><span>${bpTo.text}</span><b>${bpTo.num}</b></span>
        <span class="bar"><i id="r-ballfill" style="width:${from}%"></i></span>
      </div>
      ${missionHtml}
      <div class="coin-box">
        <span class="n">${ic('coin')}<span id="r-coins">+${fmt(coins)}</span></span>
        <button class="btn ad" data-act="double" id="r-double">${ic('video')}2x koin</button>
      </div>
      <div class="actions">
        <button class="btn primary wide" data-act="again" id="r-again">${ic('restart')}Main lagi</button>
        <button class="btn wide" data-act="menu" id="r-menu">${ic('home')}Menu</button>
      </div>`);
    // the bar fills in front of the player: progress is never lost
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = $('r-ballfill'); if (f) f.style.width = bpTo.pct + '%'; }));
    if (newBalls.length) setTimeout(() => PT.Sfx.record(), 400);
  }

  // ---------- Pause ----------
  function pause() {
    if (state !== 'playing' && state !== 'intro' && state !== 'ready') return;
    pausedFrom = state;
    state = 'paused';
    showModal('pause', `<h2>Jeda</h2>
      <p>Skor ${fmt(world.score)} · combo x${world.combo}</p>
      ${toggles()}
      <div class="actions">
        <button class="btn primary wide" data-act="resume" id="p-resume">${ic('play')}Lanjutkan</button>
        <button class="btn wide" data-act="menu">${ic('home')}Menu</button>
      </div>`);
  }
  function resume() {
    hideModal();
    // after a pause the ball waits for a tap again, so nobody dies while finding the screen
    state = pausedFrom === 'intro' ? 'intro' : 'ready';
    renderReadyBar();
  }
  PT.pause = pause;

  // ---------- Settings / daily / missions / collection / shop / help ----------
  function toggles() {
    const row = (key, icon, label) => `<div class="toggle"><span>${ic(icon)}${label}</span>
      <button class="switch" role="switch" aria-label="${label}" aria-checked="${P.settings[key]}" data-act="toggle" data-key="${key}"></button></div>`;
    return row('sound', 'sound', 'Suara') + row('music', 'music', 'Musik') + row('vibe', 'vibe', 'Getar');
  }
  function applySettings() { PT.Sfx.configure({ sound: P.settings.sound, music: P.settings.music }); }

  function showDaily() {
    const st = PT.dailyState();
    const days = PT.DAILY_REWARDS.map((n, i) => `<div class="day ${i < st.day || (!st.canClaim && i === st.day) ? 'done' : ''} ${st.canClaim && i === st.day ? 'today' : ''}">
      Hari ${i + 1}<b>${fmt(n)}</b></div>`).join('');
    showModal('daily', `${closeBtn}<h2>Hadiah harian</h2>
      <p>${st.canClaim ? 'Datang tiap hari, hadiahnya makin besar.' : 'Sudah diambil. Kembali besok!'}</p>
      <div class="days">${days}</div>
      ${st.canClaim ? `<div class="actions">
        <button class="btn primary wide" data-act="claim">Klaim ${fmt(PT.DAILY_REWARDS[st.day])}</button>
        <button class="btn ad wide" data-act="claim2">${ic('video')}Klaim 2x</button></div>` : ''}`);
  }

  function showMissions() {
    const rows = PT.missions().map((m, i) => {
      const pct = Math.round((100 * m.p) / m.n);
      const right = m.claimed ? `<span class="m-done">${ic('check')}Selesai</span>`
        : m.p >= m.n ? `<div class="m-btns"><button class="btn primary sm" data-act="mclaim" data-i="${i}">Klaim ${m.reward}</button><button class="btn ad sm" data-act="mclaim2" data-i="${i}" aria-label="Klaim 2x lewat iklan">${ic('video')}2x</button></div>`
          : `<span class="m-reward">${ic('coin')}${m.reward}</span>`;
      return `<div class="mission"><div class="m-main"><b>${PT.missionText(m)}</b>
        <span class="bar"><i style="width:${pct}%"></i></span><small>${fmt(m.p)} / ${fmt(m.n)}</small></div>${right}</div>`;
    }).join('');
    showModal('missions', `${closeBtn}<h2>Misi harian</h2><p>Misi baru setiap hari.</p>${rows}`);
  }

  function showBalls() {
    const n = PT.ballsUnlocked();
    const cells = PT.BALLS.map((b, i) => i < n
      ? `<button class="ball-cell" data-act="pickball" data-i="${i}" aria-pressed="${P.ball === i}">${ballDot(b, 34)}<span>${b.name}</span></button>`
      : `<div class="ball-cell locked">${ic('lock')}<span>${fmt(b.need)} kilau</span></div>`).join('');
    showModal('balls', `${closeBtn}<h2>Koleksi bola</h2><p>Kumpulkan kilau untuk membuka bola baru. Total ${fmt(P.totalSparks)} kilau.</p><div class="ball-grid">${cells}</div>`);
  }

  function showShop() {
    const full = P.shields >= PT.SHIELD_MAX, poor = P.coins < PT.SHIELD_PRICE;
    showModal('shop', `${closeBtn}<h2>Toko</h2>
      <div class="shop-item">${ic('shield')}<div><b>Perisai</b><small>Menahan satu tabrakan duri. Dipakai sebelum ronde dimulai.</small><small>Punya ${P.shields} / ${PT.SHIELD_MAX}</small></div></div>
      <div class="actions"><button class="btn primary wide" data-act="buyshield" ${full || poor ? 'disabled' : ''}>${ic('coin')}${full ? 'Sudah penuh' : 'Beli ' + PT.SHIELD_PRICE}</button></div>
      ${poor && !full ? '<p class="sub note">Koin belum cukup. Main lagi atau selesaikan misi.</p>' : ''}`);
  }

  function showHelp() {
    showModal('help', `${closeBtn}<h2>Cara main</h2><ol class="help-list">
      <li>Bola berputar sendiri. Ketuk di mana saja untuk pindah lintasan (dalam / luar).</li>
      <li>Hindari duri merah. Sapu kilau berturut-turut untuk combo, skor per kilau naik sampai 5x.</li>
      <li>Kilau yang terlewat memutus combo. Pindah tepat sebelum duri memberi bonus Tipis.</li>
      <li>Combo ${E.FEVER_AT} memicu FEVER: semua duri jadi kilau selama ${E.FEVER_T} detik.</li>
      <li>Setiap kilau mengisi bar bola baru, walaupun kamu kalah.</li></ol>
      <div class="actions"><button class="btn primary wide" data-act="close">Mengerti</button></div>`);
  }

  const ACTIONS = {
    close: () => { hideModal(); if (state === 'home') renderHome(); },
    resume,
    menu: async () => { hideModal(); if (state === 'result') await PT.Ads.maybeInterstitial('round_end'); goHome(); },
    again: async () => { hideModal(); await PT.Ads.maybeInterstitial('round_end'); startRun(); },
    results: () => showResults(),
    revive: async () => {
      if (!(await PT.Ads.rewarded('revive'))) return;
      PT.Sfx.recover();
      revived = true;
      E.revive(world);
      drainEvents();
      hideModal();
      enterReady();
    },
    double: async (b) => {
      if (doubled) return;
      if (!(await PT.Ads.rewarded('double_coins'))) return;
      doubled = true;
      PT.addCoins(world.payout, 'double_coins');
      PT.Sfx.coin();
      $('r-coins').textContent = '+' + fmt(world.payout * 2);
      b.disabled = true;
    },
    toggle: (b) => {
      const k = b.dataset.key;
      P.settings[k] = !P.settings[k];
      PT.save();
      b.setAttribute('aria-checked', P.settings[k]);
      applySettings();
    },
    claim: () => { const n = PT.claimDaily(1); PT.Sfx.coin(); toast(`+${fmt(n)} koin`); hideModal(); renderHome(); },
    claim2: async () => {
      if (!(await PT.Ads.rewarded('daily_double'))) return;
      const n = PT.claimDaily(2); PT.Sfx.coin(); toast(`+${fmt(n)} koin`); hideModal(); renderHome();
    },
    mclaim: (b) => { const n = PT.claimMission(+b.dataset.i, 1); if (n) { PT.Sfx.coin(); toast(`+${fmt(n)} koin`); } showMissions(); renderHome(); },
    mclaim2: async (b) => {
      if (!(await PT.Ads.rewarded('mission_double'))) return;
      const n = PT.claimMission(+b.dataset.i, 2); if (n) { PT.Sfx.coin(); toast(`+${fmt(n)} koin`); } showMissions(); renderHome();
    },
    pickball: (b) => { P.ball = +b.dataset.i; PT.save(); showBalls(); },
    buyshield: () => {
      if (P.coins < PT.SHIELD_PRICE || P.shields >= PT.SHIELD_MAX) return;
      PT.addCoins(-PT.SHIELD_PRICE, 'shield');
      P.shields++; PT.save();
      PT.Sfx.coin();
      showShop();
    },
    help: () => showHelp(),
  };

  $('btn-play').addEventListener('click', () => { PT.Sfx.click(); startRun(); });
  $('btn-pause').addEventListener('click', () => { PT.Sfx.click(); pause(); });
  $('btn-settings').addEventListener('click', () => {
    PT.Sfx.click();
    showModal('settings', `${closeBtn}<h2>Pengaturan</h2>${toggles()}<div class="actions"><button class="btn wide" data-act="help">${ic('help')}Cara main</button></div>`);
  });
  $('btn-daily').addEventListener('click', () => { PT.Sfx.click(); showDaily(); });
  $('btn-missions').addEventListener('click', () => { PT.Sfx.click(); showMissions(); });
  $('btn-balls').addEventListener('click', () => { PT.Sfx.click(); showBalls(); });
  $('btn-ballbar').addEventListener('click', () => { PT.Sfx.click(); showBalls(); });
  $('btn-shop').addEventListener('click', () => { PT.Sfx.click(); showShop(); });
  $('btn-help').addEventListener('click', () => { PT.Sfx.click(); showHelp(); });

  // ---------- Back button, keyboard, background ----------
  PT.handleBack = () => {
    if (document.querySelector('.ad-mock')) return true; // ads close themselves
    if (modalName === 'pause') { resume(); return true; }
    if (modalName === 'revive') { showResults(); return true; }
    if (modalName === 'result') { ACTIONS.menu(); return true; }
    if (modalName) { hideModal(); return true; }
    if (state === 'playing' || state === 'intro' || state === 'ready') { pause(); return true; }
    return false; // at home: let the app exit
  };
  if (!window.Capacitor) {
    try {
      history.pushState({ g: 1 }, '');
      window.addEventListener('popstate', () => { PT.handleBack(); history.pushState({ g: 1 }, ''); });
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p') PT.handleBack();
    else if ((e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') && !modalName) { e.preventDefault(); handleTap(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---------- Canvas ----------
  const cv = $('cv'), cx = cv.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    // fixed world, letterboxed: gameplay is identical on every screen
    const s = Math.min(r.width / E.W, r.height / E.H);
    view = { s, ox: (r.width - E.W * s) / 2, oy: (r.height - E.H * s) / 2, dpr };
  }
  window.addEventListener('resize', resize);
  // the whole stage is the button: thumbs do not have to aim
  $('stage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .banner')) return;
    handleTap();
  });
  function handleTap() {
    if (state === 'ready') { beginPlay(); return; }
    if (state !== 'playing') return;
    E.tap(world);
    drainEvents();
  }

  function burst(x, y, n, color, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      fx.push({ kind: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.45 + Math.random() * 0.2, color });
    }
  }
  const text = (x, y, s, color = '#ffd23f', size = 20) => fx.push({ kind: 'text', x, y, text: s, t: 0, life: 0.8, color, size });

  function drainEvents() {
    for (const ev of world.events) {
      if (ev.type === 'spark') {
        PT.Sfx.spark(ev.combo, ev.fever);
        burst(ev.x, ev.y, 5, ev.fever ? '#ffd23f' : '#fff7e8', 90);
        if (ev.combo % 10 === 0) { text(E.CX, E.CY + 215, `combo ${ev.combo}`, '#fff7e8', 22); vibrate(10); }
      } else if (ev.type === 'coin') {
        PT.Sfx.coin();
        burst(ev.x, ev.y, 8, '#ffd23f');
        text(ev.x, ev.y, '+5 koin');
      } else if (ev.type === 'near') {
        PT.Sfx.near();
        vibrate(12);
        text(ev.x, ev.y, `Tipis! +${ev.gain}`, '#7dd3fc', 20);
      } else if (ev.type === 'break') {
        if (ev.combo >= 5) { PT.Sfx.brk(); text(E.CX, E.CY + 215, 'combo putus', '#cfc3e6', 18); }
      } else if (ev.type === 'fever') {
        PT.Sfx.fever();
        PT.Music.bpm = 132;
        flash = 1; shake = 6; vibrate(30);
        text(E.CX, E.CY - 200, 'FEVER!', '#ffd23f', 40);
      } else if (ev.type === 'feverEnd') {
        PT.Music.bpm = 104;
      } else if (ev.type === 'shield') {
        PT.Sfx.shield();
        burst(ev.x, ev.y, 18, '#7dd3fc', 220);
        shake = 8; vibrate(40);
        text(ev.x, ev.y, 'Perisai!', '#7dd3fc', 22);
      } else if (ev.type === 'hit') {
        PT.Sfx.hit();
        burst(ev.x, ev.y, 30, '#ff4d6d', 260);
        shake = 14; flash = 0.6; vibrate(80);
        onHit();
      }
    }
    world.events.length = 0;
    if (!recordShown && P.best > 0 && world.score > P.best) {
      recordShown = true;
      PT.Sfx.record();
      toast('Rekor baru! Terus!');
      flash = 0.5;
    }
  }

  const ZONES = ['#ff6b81', '#38bdf8', '#a78bfa', '#4ade80', '#fb923c', '#f472b6'];
  function drawSpike(x, y, rot) {
    cx.save(); cx.translate(x, y); cx.rotate(rot);
    cx.beginPath();
    for (let k = 0; k < 16; k++) {
      const r = k % 2 ? 6.5 : E.SPIKE_R + 2, a = (k / 16) * Math.PI * 2;
      cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    cx.closePath();
    cx.fillStyle = '#ff4d6d'; cx.fill();
    cx.lineWidth = 2; cx.strokeStyle = '#4a0d1e'; cx.stroke();
    cx.fillStyle = '#ffd0d8'; cx.beginPath(); cx.arc(-2, -2, 2.4, 0, Math.PI * 2); cx.fill();
    cx.restore();
  }

  function draw(now) {
    const { s, ox, oy, dpr } = view;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, cv.width, cv.height);
    if (!world) return;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    cx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox + sx * s), dpr * (oy + sy * s));
    const w = world, fever = w.feverLeft > 0, T = now / 1000;
    const zone = ZONES[Math.floor(w.score / 300) % ZONES.length];
    const glow = fever ? '#ffd23f' : zone;

    // glow behind the rings
    const g = cx.createRadialGradient(E.CX, E.CY, 20, E.CX, E.CY, 240);
    g.addColorStop(0, glow + (fever ? '55' : '30'));
    g.addColorStop(1, glow + '00');
    cx.fillStyle = g;
    cx.fillRect(-E.W, -E.H, 3 * E.W, 3 * E.H);
    if (flash > 0) { cx.fillStyle = `rgba(255,247,232,${flash * 0.35})`; cx.fillRect(-E.W, -E.H, 3 * E.W, 3 * E.H); }

    // lanes
    for (let i = 0; i < 2; i++) {
      cx.beginPath(); cx.arc(E.CX, E.CY, E.LANES[i], 0, Math.PI * 2);
      cx.lineWidth = i === w.lane ? 4 : 2.5;
      cx.strokeStyle = fever ? `rgba(255,210,63,${i === w.lane ? 0.7 : 0.35})` : `rgba(255,255,255,${i === w.lane ? 0.34 : 0.13})`;
      cx.stroke();
    }

    // core with the score
    cx.beginPath(); cx.arc(E.CX, E.CY, 60, 0, Math.PI * 2);
    cx.fillStyle = 'rgba(10,6,30,.55)'; cx.fill();
    cx.lineWidth = 3; cx.strokeStyle = glow; cx.stroke();
    if (fever) {
      cx.beginPath(); cx.arc(E.CX, E.CY, 66, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (w.feverLeft / E.FEVER_T));
      cx.lineWidth = 5; cx.strokeStyle = '#ffd23f'; cx.stroke();
    } else if (w.combo > 0) {
      cx.beginPath(); cx.arc(E.CX, E.CY, 66, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, w.combo / E.FEVER_AT));
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(255,247,232,.5)'; cx.stroke();
    }
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = '#ffd23f';
    cx.font = `700 ${w.score >= 10000 ? 32 : 40}px Fredoka, sans-serif`;
    cx.fillText(fmt(w.score), E.CX, E.CY - 6);
    cx.font = '600 14px Fredoka, sans-serif';
    cx.fillStyle = fever ? '#ffd23f' : '#cfc3e6';
    const mult = Math.min(5, 1 + Math.floor(w.combo / 10)) * (fever ? 2 : 1);
    cx.fillText(fever ? `FEVER x${mult}` : w.combo ? `combo ${w.combo}${mult > 1 ? ' · x' + mult : ''}` : 'combo 0', E.CX, E.CY + 24);

    // items
    for (const it of w.items) {
      const da = it.a - w.pa;
      if (da > E.VIS) continue;
      let alpha = da > E.VIS - 0.7 ? (E.VIS - da) / 0.7 : 1;
      if (da < 0) alpha *= Math.max(0, 1 + da / 0.9) * 0.6;
      cx.globalAlpha = alpha;
      const [x, y] = E.itemPos(it);
      if (it.type === 'spike') drawSpike(x, y, T * 2 + it.id);
      else if (it.type === 'coin') {
        cx.fillStyle = '#ffb21f'; cx.beginPath(); cx.arc(x, y, E.COIN_R, 0, Math.PI * 2); cx.fill();
        cx.lineWidth = 2; cx.strokeStyle = '#c77800'; cx.stroke();
        cx.fillStyle = '#fff6c9'; cx.beginPath(); cx.arc(x, y, 3.5, 0, Math.PI * 2); cx.fill();
      } else {
        const r = E.SPARK_R * (1 + 0.15 * Math.sin(T * 8 + it.id));
        cx.fillStyle = it.converted || fever ? 'rgba(255,210,63,.3)' : 'rgba(255,247,232,.22)';
        cx.beginPath(); cx.arc(x, y, r * 1.9, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = it.converted || fever ? '#ffd23f' : '#fff7e8';
        cx.beginPath(); cx.moveTo(x, y - r); cx.lineTo(x + r * 0.75, y); cx.lineTo(x, y + r); cx.lineTo(x - r * 0.75, y); cx.closePath(); cx.fill();
      }
    }
    cx.globalAlpha = 1;

    // ball, trail, shield
    const ball = PT.BALLS[P.ball] || PT.BALLS[0];
    trail.forEach((p, k) => {
      const q = (k + 1) / trail.length;
      cx.globalAlpha = 0.35 * q;
      cx.fillStyle = ball.g;
      cx.beginPath(); cx.arc(p[0], p[1], E.BALL_R * q, 0, Math.PI * 2); cx.fill();
    });
    cx.globalAlpha = w.invuln > 0 && Math.floor(T * 12) % 2 ? 0.4 : 1;
    const [bx, by] = E.ballPos(w);
    if (state !== 'dead' && !(state === 'result' && w.over)) {
      cx.fillStyle = ball.c; cx.beginPath(); cx.arc(bx, by, E.BALL_R, 0, Math.PI * 2); cx.fill();
      cx.lineWidth = 3; cx.strokeStyle = ball.g; cx.stroke();
      if (w.shield) { cx.lineWidth = 2.5; cx.strokeStyle = '#7dd3fc'; cx.beginPath(); cx.arc(bx, by, E.BALL_R + 6, 0, Math.PI * 2); cx.stroke(); }
    }
    cx.globalAlpha = 1;

    for (const f of fx) {
      const k = f.t / f.life;
      cx.globalAlpha = 1 - k;
      if (f.kind === 'p') { cx.fillStyle = f.color; cx.beginPath(); cx.arc(f.x, f.y, 3.5 * (1 - k) + 0.5, 0, Math.PI * 2); cx.fill(); }
      else {
        cx.fillStyle = f.color; cx.font = `700 ${f.size}px Fredoka, sans-serif`;
        cx.lineWidth = 4; cx.strokeStyle = 'rgba(10,6,30,.6)';
        cx.strokeText(f.text, f.x, f.y - 16 - 30 * k);
        cx.fillText(f.text, f.x, f.y - 16 - 30 * k);
      }
    }
    cx.globalAlpha = 1;

    if (state === 'ready') {
      cx.globalAlpha = 0.65 + 0.35 * Math.sin(T * 5);
      cx.fillStyle = '#fff7e8'; cx.font = '700 24px Fredoka, sans-serif';
      cx.fillText(revived ? 'Ketuk untuk lanjut' : 'Ketuk untuk mulai', E.CX, E.CY + 200);
      cx.globalAlpha = 1;
    }
  }

  // test hook bot: swaps as soon as it is safe for the nearest item (scripts/bot.js logic)
  function autoStep() {
    const w = world;
    let next = null;
    for (const it of w.items) if (it.st === 0 && it.a >= w.pa - 0.02 && (!next || it.a < next.a)) next = it;
    if (!next || E.demand(next) === w.lane) return;
    const other = 1 - w.lane;
    if (!w.items.some((it) => it.st === 0 && it.type === 'spike' && it.lane === other && it.a > w.pa - 0.3 && it.a < w.pa + 0.05)) handleTap();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'playing' && world) {
      // fixed sub-steps keep collisions identical to the Node simulation
      let left = dt;
      while (left > 1e-6 && state === 'playing') {
        const h = Math.min(1 / 60, left);
        if (autoplay) autoStep();
        E.step(world, h);
        drainEvents();
        left -= h;
      }
      trail.push(E.ballPos(world));
      if (trail.length > 12) trail.shift();
    }
    for (const f of fx) { f.t += dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; } }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].life) fx.splice(i, 1);
    shake = Math.max(0, shake - dt * 30);
    flash = Math.max(0, flash - dt * 2.5);
    draw(now);
    requestAnimationFrame(frame);
  }

  applySettings();
  renderHome();
  requestAnimationFrame(frame);

  // ---------- Test hook (scripts/smoke.js, scripts/shots.js); not used by the UI ----------
  window.__putar = {
    get state() { return state; },
    get world() { return world; },
    profile: P,
    start: () => startRun(),
    skipIntro: () => endIntro(),
    tap: () => handleTap(),
    autoplay: (on = true) => { autoplay = on; },
    // put a spike right in front of the ball (forces a hit / shield)
    spikeAhead() { world.items.push({ id: 9999 + world.items.length, a: world.pa + 0.06, lane: world.lane, type: 'spike', st: 0, sep: 0 }); },
    setCombo: (n) => { world.combo = n; },
    goHome,
  };
})();
