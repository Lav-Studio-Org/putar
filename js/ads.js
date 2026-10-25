// Ad layer. Every ad in the game goes through PT.Ads, so a real SDK (AdMob through
// Capacitor, see js/native.js) only has to set PT.nativeAdProvider = { showRewarded, showInterstitial }.
//
// Placements (keep this list and the README in sync):
//   rewarded:      revive, double_coins, daily_double, shield_start, mission_double
//   interstitial:  round_end (only between rounds, frequency-capped)
(() => {
  'use strict';
  const PT = (window.PT = window.PT || {});

  const POLICY = {
    firstInterstitialAfterGames: 3, // new players never see one in their first 3 games
    gamesBetweenInterstitials: 2,   // at most every 2nd finished round
    minSecondsBetweenAds: 90,       // and never within 90s of any other ad (incl. rewarded)
  };
  const state = { lastAdAt: 0, sinceInterstitial: 0 };

  // Mock provider: a fake full-screen ad so every flow can be tried on the website.
  function mockAd(kind, placement) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-mock';
      const secs = kind === 'rewarded' ? 5 : 3;
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-tag">IKLAN CONTOH</div>
          <div class="ad-title">${kind === 'rewarded' ? 'Iklan berhadiah' : 'Iklan'}</div>
          <div class="ad-sub">placement: <b>${placement}</b></div>
          <div class="ad-ring"><span>${secs}</span></div>
          <p class="ad-note">Di versi aplikasi, di sini tampil iklan asli.</p>
          <button class="btn ad-close" disabled>${kind === 'rewarded' ? 'Tunggu...' : 'Lewati dalam ' + secs}</button>
        </div>`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      const btn = el.querySelector('.ad-close');
      const num = el.querySelector('.ad-ring span');
      let left = secs;
      const iv = setInterval(() => {
        left--;
        num.textContent = Math.max(0, left);
        if (left > 0) { if (kind !== 'rewarded') btn.textContent = 'Lewati dalam ' + left; return; }
        clearInterval(iv);
        btn.disabled = false;
        btn.textContent = kind === 'rewarded' ? 'Ambil hadiah' : 'Tutup';
      }, PT.fastAds ? 40 : 1000);
      btn.addEventListener('click', () => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 200);
        resolve(true);
      });
    });
  }

  // Promise<boolean>: true when the ad was shown (and for rewarded: fully watched).
  function provider() {
    return PT.nativeAdProvider || {
      showRewarded: (p) => mockAd('rewarded', p),
      showInterstitial: (p) => mockAd('interstitial', p),
    };
  }

  async function run(kind, placement) {
    PT.track('ad_request', { kind, placement });
    PT.Sfx && PT.Sfx.duck(true);
    let ok = false;
    try {
      ok = kind === 'rewarded' ? await provider().showRewarded(placement) : await provider().showInterstitial(placement);
    } catch (e) { ok = false; }
    PT.Sfx && (PT.Sfx.recover(), PT.Sfx.duck(false));
    state.lastAdAt = Date.now();
    PT.track(ok ? 'ad_complete' : 'ad_failed', { kind, placement });
    if (!ok && kind === 'rewarded') PT.emit('ad-unavailable', placement);
    return ok;
  }

  PT.Ads = {
    POLICY,
    rewarded: (placement) => run('rewarded', placement),
    // call once per finished round
    roundFinished() { state.sinceInterstitial++; },
    canInterstitial() {
      const p = PT.profile;
      if (p.noAds) return false;
      if (p.games < POLICY.firstInterstitialAfterGames) return false;
      if (state.sinceInterstitial < POLICY.gamesBetweenInterstitials) return false;
      if (Date.now() - state.lastAdAt < POLICY.minSecondsBetweenAds * 1000) return false;
      return true;
    },
    async maybeInterstitial(placement) {
      if (!this.canInterstitial()) return false;
      state.sinceInterstitial = 0;
      return run('interstitial', placement);
    },
  };
})();
