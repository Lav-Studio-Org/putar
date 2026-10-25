// Synthesized sound effects and background music (Web Audio, no asset files).
// The unlock/recover logic is the part every game must keep: it is what stops the
// "sound is gone after the screen turned off / after an ad" bug. See docs/04-audio.md.
(() => {
  'use strict';
  const PT = (window.PT = window.PT || {});
  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  const Sfx = {
    ac: null, sfxGain: null, musicGain: null,
    soundOn: true, musicOn: true, ducked: false,

    unlock() {
      if (!this.ac) this.build();
      if (!this.ac) return;
      // 'interrupted' is what iOS reports after a call or another app takes audio
      if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume().catch(() => {});
    },
    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      const comp = this.ac.createDynamicsCompressor();
      comp.connect(this.ac.destination);
      this.sfxGain = this.ac.createGain();
      this.musicGain = this.ac.createGain();
      this.sfxGain.connect(comp);
      this.musicGain.connect(comp);
      this.apply();
      Music.resync();
    },
    // Call when the page comes back from the background or from a full-screen ad.
    // Android WebView can leave the old context "running" but silent after another
    // activity held the audio output, so in the app we start a fresh context.
    recover() {
      if (!this.ac) return;
      if (isNative()) {
        const old = this.ac;
        this.ac = null;
        old.close().catch(() => {});
        this.build();
      }
      this.unlock();
    },
    configure({ sound, music }) { this.soundOn = sound; this.musicOn = music; this.apply(); },
    // mute everything while an ad is on screen
    duck(on) { this.ducked = on; this.apply(); },
    apply() {
      if (!this.ac) return;
      const t = this.ac.currentTime;
      this.sfxGain.gain.setTargetAtTime(this.soundOn && !this.ducked ? 0.6 : 0, t, 0.02);
      this.musicGain.gain.setTargetAtTime(this.musicOn && !this.ducked ? 0.5 : 0, t, 0.1);
    },

    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 1, delay = 0, attack = 0.005, out } = {}) {
      if (!this.ac) return;
      if (!out && !this.soundOn) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // never ramp to 0
      o.connect(g).connect(out || this.sfxGain);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
      if (!this.ac || !this.soundOn) return;
      const t = this.ac.currentTime + delay;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource();
      src.buffer = buf;
      const f = this.ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = this.ac.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.sfxGain);
      src.start(t);
    },

    // Every spark in a combo is the next note of a pentatonic run, so a streak sounds
    // like a rising melody; it climbs three octaves and then starts the climb again.
    spark(combo, fever) {
      const scale = [0, 2, 4, 7, 9];
      const k = (Math.max(1, combo) - 1) % 15;
      const f = 330 * Math.pow(2, (Math.floor(k / 5) * 12 + scale[k % 5]) / 12);
      this.tone(f, 0.13, { type: fever ? 'square' : 'sine', vol: fever ? 0.09 : 0.26, slide: 1.01 });
      this.tone(f * 2, 0.06, { type: 'triangle', vol: 0.05 });
    },
    swap() { this.tone(520, 0.05, { type: 'triangle', vol: 0.06, slide: 1.5 }); },
    near() { this.tone(1200, 0.07, { type: 'square', vol: 0.06 }); this.tone(1800, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
    brk() { this.tone(240, 0.16, { type: 'triangle', vol: 0.12, slide: 0.6 }); },
    fever() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.07, delay: i * 0.05 })); },
    shield() { this.noise(0.2, { vol: 0.25, freq: 900 }); this.tone(660, 0.25, { type: 'triangle', vol: 0.2, slide: 0.5 }); },
    hit() { this.noise(0.35, { vol: 0.45, freq: 500 }); this.tone(160, 0.5, { type: 'sawtooth', vol: 0.18, slide: 0.4 }); },
    record() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.16, delay: i * 0.07 })); },
    click() { this.tone(700, 0.05, { type: 'triangle', vol: 0.12 }); },
    coin() { this.tone(988, 0.08, { type: 'square', vol: 0.07 }); this.tone(1319, 0.18, { type: 'square', vol: 0.07, delay: 0.07 }); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.09 })); },
    over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.16, slide: 0.97 })); },
  };

  // Gentle generative loop: pentatonic plucks over a I-V-vi-IV bass line.
  const Music = {
    timer: 0, nextT: 0, step: 0, playing: false, bpm: 104,
    start() {
      if (this.playing || !Sfx.ac) return;
      this.playing = true;
      this.nextT = Sfx.ac.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 100);
    },
    stop() { this.playing = false; clearInterval(this.timer); },
    // keep the schedule in step with the (possibly new) audio clock
    resync() { if (Sfx.ac) this.nextT = Sfx.ac.currentTime + 0.1; },
    schedule() {
      const ac = Sfx.ac;
      if (!ac) return;
      const eighth = 60 / this.bpm / 2;
      // after a stall (timers throttled, context swapped) skip ahead instead of
      // firing every missed note at once
      if (this.nextT < ac.currentTime - 0.5 || this.nextT > ac.currentTime + 2) this.nextT = ac.currentTime + 0.05;
      const roots = [130.81, 196.0, 220.0, 174.61]; // C G A F
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
      while (this.nextT < ac.currentTime + 0.3) {
        const bar = Math.floor(this.step / 8) % 4;
        const delay = Math.max(0, this.nextT - ac.currentTime);
        if (this.step % 8 === 0 || this.step % 8 === 4) Sfx.tone(roots[bar], eighth * 3.5, { vol: 0.09, delay, attack: 0.02, out: Sfx.musicGain });
        if (Math.random() < (this.step % 2 ? 0.25 : 0.55)) {
          Sfx.tone(scale[Math.floor(Math.random() * scale.length)], eighth * 1.6, { type: 'triangle', vol: 0.045, delay, out: Sfx.musicGain });
        }
        this.nextT += eighth;
        this.step++;
      }
    },
  };

  PT.Sfx = Sfx;
  PT.Music = Music;

  // any touch anywhere can (re)start audio, and returning to the page restores it
  document.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Sfx.recover(); });
})();
