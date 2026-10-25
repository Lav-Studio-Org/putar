// Headless smoke test: plays real runs on phone, small phone and desktop viewports,
// fails on any page error, and saves screenshots.
// Usage: python3 -m http.server 8123 & node scripts/smoke.js [url] [out-dir]
const { chromium } = require('playwright');
const fs = require('fs');
const [url = 'http://localhost:8123/', out = 'shots'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const run = async (name, viewport, fn) => {
    const mobile = viewport.width < 700;
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await p.addInitScript(() => { window.PT = { fastAds: true }; });
    await p.goto(url);
    await p.waitForTimeout(500);
    await fn(p, name);
    await ctx.close();
  };
  const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
  const st = (p) => p.evaluate(() => window.__putar.state);
  const ad = async (p) => { await p.waitForSelector('.ad-close:not([disabled])'); await p.click('.ad-close'); await p.waitForTimeout(400); };
  const expect = async (p, want, msg) => { const s = await st(p); if (s !== want) errors.push(`${msg} (state ${s})`); };
  const tapStage = async (p) => { const r = await p.evaluate(() => { const c = document.getElementById('cv').getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height * 0.25]; }); await p.mouse.click(r[0], r[1]); };

  await run('phone', { width: 390, height: 844 }, async (p, n) => {
    await shot(p, `${n}-home`);
    await p.click('#btn-play');
    await p.waitForTimeout(300);
    await shot(p, `${n}-intro`);
    await expect(p, 'intro', 'first run should show the rules banner');
    await p.click('#btn-start');
    await p.waitForTimeout(300);
    await expect(p, 'ready', 'banner should lead to the ready state');
    // free shield through the mock rewarded ad
    await p.click('#rb-shield-ad'); await ad(p);
    if (!(await p.evaluate(() => window.__putar.world.shield))) errors.push('shield ad did not give a shield');
    await shot(p, `${n}-ready`);
    await tapStage(p);
    await p.waitForTimeout(100);
    await expect(p, 'playing', 'a real tap should start the run');
    // a real tap swaps lanes
    const lane = await p.evaluate(() => window.__putar.world.lane);
    await tapStage(p); await p.waitForTimeout(50);
    if (await p.evaluate(() => window.__putar.world.lane) === lane) errors.push('tap did not swap lanes');
    await p.evaluate(() => window.__putar.autoplay(true));
    await p.waitForTimeout(3500);
    if (await p.evaluate(() => window.__putar.world.score) <= 0) errors.push('autoplay did not score');
    await shot(p, `${n}-play`);
    await p.evaluate(() => window.__putar.setCombo(39));
    await p.waitForTimeout(1200);
    if (await p.evaluate(() => window.__putar.world.fevers) < 1) errors.push('combo 40 did not start FEVER');
    await shot(p, `${n}-fever`);
    // pause and resume (resume waits for a tap)
    await p.click('#btn-pause'); await p.waitForTimeout(200);
    await shot(p, `${n}-pause`);
    await p.click('#p-resume');
    await expect(p, 'ready', 'resume should wait for a tap');
    await tapStage(p); await p.waitForTimeout(100);
    // shield absorbs one spike
    await p.evaluate(() => { window.__putar.autoplay(false); window.__putar.spikeAhead(); });
    await p.waitForTimeout(300);
    await expect(p, 'playing', 'shield should absorb the spike');
    await p.waitForTimeout(1200); // invulnerability ends
    await p.evaluate(() => window.__putar.spikeAhead());
    await p.waitForSelector('#d-revive', { timeout: 3000 }).catch(() => errors.push('no revive offer after a hit'));
    await shot(p, `${n}-revive`);
    await p.click('#d-revive'); await ad(p);
    await expect(p, 'ready', 'revive should wait for a tap');
    await tapStage(p);
    await p.evaluate(() => window.__putar.autoplay(true));
    await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__putar.autoplay(false); window.__putar.spikeAhead(); });
    await p.waitForSelector('#r-again', { timeout: 3000 });
    await p.waitForTimeout(1000);
    await shot(p, `${n}-result`);
    const before = await p.evaluate(() => window.__putar.profile.coins);
    await p.click('#r-double'); await ad(p);
    if (await p.evaluate(() => window.__putar.profile.coins) <= before && before > 0) errors.push('2x coins did not pay');
    await p.click('#r-again'); await p.waitForTimeout(300);
    await expect(p, 'ready', 'Main lagi should go straight to ready');
    await p.evaluate(() => window.__putar.goHome());
    await p.waitForTimeout(300);
    await shot(p, `${n}-home2`);
    await p.click('#btn-missions'); await p.waitForTimeout(200); await shot(p, `${n}-missions`); await p.click('[data-act="close"]');
    await p.click('#btn-balls'); await p.waitForTimeout(200); await shot(p, `${n}-balls`); await p.click('[data-act="close"]');
    await p.click('#btn-shop'); await p.waitForTimeout(200); await shot(p, `${n}-shop`); await p.click('[data-act="close"]');
    await p.click('#btn-daily'); await p.waitForTimeout(200); await p.click('[data-act="claim"]'); await p.waitForTimeout(200);
    await p.click('#btn-settings'); await p.waitForTimeout(200); await shot(p, `${n}-settings`); await p.click('[data-act="close"]');
  });

  for (const [name, viewport] of [['small', { width: 360, height: 640 }], ['desktop', { width: 1366, height: 768 }]]) {
    await run(name, viewport, async (p, n) => {
      await shot(p, `${n}-home`);
      await p.evaluate(() => { window.__putar.start(); window.__putar.skipIntro(); window.__putar.tap(); window.__putar.autoplay(true); });
      await p.waitForTimeout(2500);
      await shot(p, `${n}-play`);
      const geo = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
      if (geo[0] < 0 || geo[1] > geo[4] || geo[2] < 0 || geo[3] > geo[5]) errors.push(`${n}: canvas overflows ${geo}`);
      const home = await p.evaluate(() => { window.__putar.goHome(); const r = document.getElementById('home').getBoundingClientRect(); return [r.bottom, innerHeight, document.getElementById('home').scrollHeight, r.height]; });
      if (home[2] > home[3] + 2) errors.push(`${n}: home content overflows ${home}`);
    });
  }
  await b.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'smoke OK');
  process.exit(errors.length ? 1 : 0);
})();
