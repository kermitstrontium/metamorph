import { C, rgb, clamp } from './util.js';
import { Gfx } from './gfx.js';
import { Particles, Floaters, Stars, Shake } from './fx.js';
import { Audio } from './audio.js';
import { Input, haptic } from './input.js';
import { Hud, NAMES, STAGE_COLORS } from './hud.js';
import { Title } from './stages/title.js';
import { TicTacToe } from './stages/ttt.js';
import { Connect4 } from './stages/c4.js';
import { Snake } from './stages/snake.js';
import { Asteroids } from './stages/asteroids.js';
import { Galaga } from './stages/galaga.js';
import { Breakout } from './stages/breakout.js';
import { Pong } from './stages/pong.js';

const STAGES = [TicTacToe, Connect4, Snake, Asteroids, Galaga, Breakout, Pong];

const glCanvas = document.getElementById('gl');
const scene = document.createElement('canvas');
const ctx = scene.getContext('2d');

const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('metamorph.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('metamorph.' + k, JSON.stringify(v)); } catch {} },
};

const G = (window.G = {
  W: 0, H: 0, dpr: 1, safe: { t: 0, r: 0, b: 0, l: 0 }, field: { x: 0, y: 0, w: 0, h: 0 },
  time: 0, timeScale: 1, slow: null,
  score: 0, lives: 3, loop: 0, stageIndex: -1, state: 'title', paused: false,
  best: store.get('best', 0),
  stats: { stages: 0, loops: 0 },
  particles: new Particles(), floaters: new Floaters(), stars: new Stars(), shake: new Shake(),
  audio: new Audio(),
  ctx, store, haptic,
  stage: null,
});
G.gfx = new Gfx(glCanvas, scene);
G.hud = new Hud(G);
G.input = new Input(glCanvas, G);
G.audio.musicOn = store.get('music', true);
G.audio.sfxOn = store.get('sfx', true);
G.gfx.crt = store.get('crt', false);
G.maxDpr = store.get('dpr', 2);
if (!G.gfx.ok) {
  // No WebGL: show the 2D canvas directly.
  glCanvas.replaceWith(scene);
  scene.id = 'gl';
  G.input = new Input(scene, G);
  document.body.style.background = 'radial-gradient(circle at 50% 40%, #1a1040, #05030d)';
}

// ---------- game API used by stages ----------
G.dispatch = (name, ...args) => {
  if (G.paused || G.state === 'over') return;
  G.stage?.[name]?.(...args);
};
G.addScore = (n, x, y, color = C.yellow, size) => {
  n = Math.round(n * (1 + G.loop * 0.5));
  G.score += n;
  if (x !== undefined) G.floaters.add(x, y, '+' + n, color, size ?? (n >= 500 ? 22 : 15));
};
G.slowmo = (scale, dur) => { G.slow = { scale, dur, t: 0 }; };
G.shock = (x, y, amp = 1, dur = 0.9, size = 1) => G.gfx.shock(x, y, amp, dur, size);
G.flash = (color = C.white, a = 0.3) => { G.gfx.flash.c = color.map((v) => v / 255); G.gfx.flash.a = Math.max(G.gfx.flash.a, a); };
G.aberr = (a) => { G.gfx.aberr = Math.max(G.gfx.aberr, a); };
G.burst = (x, y, o) => G.particles.burst(x, y, o);
G.card = (...a) => G.hud.showCard(...a);
G.diff = () => G.loop;

G.startStage = (i, prev) => {
  G.stageIndex = i;
  G.stage = new STAGES[i](G, prev);
  G.stage.layout?.();
  G.audio.setTrack(i, G.loop);
};

G.advance = () => {
  const prev = G.stage;
  let i = G.stageIndex + 1;
  G.stats.stages++;
  if (i >= STAGES.length) {
    i = 0;
    G.loop++;
    G.stats.loops++;
    G.lives = Math.min(G.lives + 1, 6);
    G.hud.lifePulse = 1;
  }
  G.audio.riser(1.4);
  G.startStage(i, prev);
};

// Returns true if the run is over.
G.die = (respawn) => {
  G.lives--;
  G.hud.lifePulse = 0.6;
  G.audio.lose();
  G.shake.add(0.7);
  G.flash(C.red, 0.35);
  G.aberr(1);
  haptic(2);
  if (G.lives <= 0) {
    G.slowmo(0.25, 1.4);
    setTimeout(() => gameOver(), 1400);
    return true;
  }
  G.stage.after(1.3, respawn);
  return false;
};

function gameOver() {
  G.state = 'over';
  const isBest = G.score > G.best;
  if (isBest) { G.best = G.score; store.set('best', G.best); }
  const el = document.getElementById('over');
  el.querySelector('.final').textContent = G.score.toLocaleString();
  el.querySelector('.best').textContent = isBest ? 'NEW BEST' : `BEST ${G.best.toLocaleString()}`;
  el.querySelector('.reached').textContent = `Reached ${NAMES[G.stageIndex]}${G.loop ? ` on loop ${G.loop + 1}` : ''} · ${G.stats.stages} forms cleared`;
  el.classList.remove('hidden');
}

function newRun(prev) {
  G.score = 0; G.hud.shown = 0; G.lives = 3; G.loop = 0;
  G.stats = { stages: 0, loops: 0 };
  G.state = 'play';
  G.timeScale = 1; G.slow = null;
  G.startStage(Number(params.get('stage') ?? 0) % STAGES.length, prev);
}
G.begin = (fromTitle) => { newRun(fromTitle); };

// ---------- layout ----------
function readSafe() {
  const probe = document.getElementById('safe');
  const cs = getComputedStyle(probe);
  return {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
  };
}

function resize() {
  G.W = window.innerWidth;
  G.H = window.innerHeight;
  G.dpr = Math.min(window.devicePixelRatio || 1, G.maxDpr);
  G.safe = readSafe();
  const hudH = 52;
  G.field = {
    x: G.safe.l + 10,
    y: G.safe.t + hudH,
    w: G.W - G.safe.l - G.safe.r - 20,
    h: G.H - G.safe.t - hudH - Math.max(G.safe.b, 12) - 8,
  };
  const pw = Math.round(G.W * G.dpr), ph = Math.round(G.H * G.dpr);
  scene.width = pw; scene.height = ph;
  const c = document.getElementById('gl');
  c.width = pw; c.height = ph;
  G.gfx.resize(pw, ph);
  G.stage?.layout?.();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- menus ----------
const menu = document.getElementById('menu');
function setToggle(id, on) { document.getElementById(id).classList.toggle('on', on); }
function pause(on) {
  if (G.state !== 'play') return;
  G.paused = on;
  menu.classList.toggle('hidden', !on);
  if (G.audio.ctx) on ? G.audio.ctx.suspend() : G.audio.ctx.resume();
}
document.getElementById('pauseBtn').addEventListener('click', () => pause(!G.paused));
document.getElementById('resume').addEventListener('click', () => pause(false));
document.getElementById('restart').addEventListener('click', () => { pause(false); newRun(null); });
document.getElementById('tMusic').addEventListener('click', () => { G.audio.musicOn = !G.audio.musicOn; G.audio.setMusic(G.audio.musicOn); store.set('music', G.audio.musicOn); setToggle('tMusic', G.audio.musicOn); });
document.getElementById('tSfx').addEventListener('click', () => { G.audio.sfxOn = !G.audio.sfxOn; G.audio.setSfx(G.audio.sfxOn); store.set('sfx', G.audio.sfxOn); setToggle('tSfx', G.audio.sfxOn); });
document.getElementById('tCrt').addEventListener('click', () => { G.gfx.crt = !G.gfx.crt; store.set('crt', G.gfx.crt); setToggle('tCrt', G.gfx.crt); });
setToggle('tMusic', G.audio.musicOn); setToggle('tSfx', G.audio.sfxOn); setToggle('tCrt', G.gfx.crt);
document.getElementById('again').addEventListener('click', () => {
  document.getElementById('over').classList.add('hidden');
  G.audio.unlock();
  newRun(G.stage);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
G.onKey = (code) => {
  if (code === 'Escape' || code === 'KeyP') pause(!G.paused);
  if (code === 'KeyN' && params.has('debug')) G.stage?.forceWin?.();
  G.dispatch('onKey', code);
};

// ---------- main loop ----------
let last = performance.now();
let perf = { acc: 0, n: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) rdt = 0;

  // Adaptive resolution: if we can't hold ~45fps, drop the render scale.
  if (rdt > 0) {
    perf.acc += rdt; perf.n++;
    if (perf.n >= 120) {
      const avg = perf.acc / perf.n;
      if (avg > 1 / 42 && G.maxDpr > 1) { G.maxDpr = Math.max(1, G.maxDpr - 0.5); resize(); }
      perf = { acc: 0, n: 0 };
    }
  }

  if (G.slow) {
    G.slow.t += rdt;
    const k = G.slow.t / G.slow.dur;
    G.timeScale = k >= 1 ? 1 : G.slow.scale + (1 - G.slow.scale) * Math.pow(k, 3);
    if (k >= 1) G.slow = null;
  }
  const dt = rdt * G.timeScale;
  G.time += dt;
  G.realDt = rdt;

  document.body.classList.toggle('title', G.state === 'title');
  G.stage?.tick(dt);
  G.particles.update(dt);
  G.floaters.update(dt);
  G.stars.update(dt, G.W, G.H);
  G.shake.update(rdt);
  G.hud.update(rdt);
  G.gfx.update(rdt);

  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.clearRect(0, 0, G.W, G.H);
  ctx.save();
  ctx.translate(G.shake.x, G.shake.y);
  G.stars.draw(ctx);
  G.stage?.draw(ctx);
  G.particles.draw(ctx);
  G.floaters.draw(ctx);
  ctx.restore();
  G.hud.draw(ctx);
  G.gfx.render(G.time, G.W, G.H);
}

resize();
G.stage = new Title(G, null);
G.stage.layout();
if (params.has('stage')) { G.audio.musicOn = G.audio.musicOn; newRun(null); }
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
