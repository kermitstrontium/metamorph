import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp } from '../util.js';
import { FONT, STAGE_COLORS, NAMES } from '../hud.js';
import { spritePixels } from './galaga.js';

// Title: the logo is a cloud of particles you can push around. Every few
// seconds it previews the seven forms, then on tap it flies off to become the
// lines of the first tic-tac-toe grid.
const ICONS = [
  (x, w, h) => { const s = h * 0.9, o = (w - s) / 2, y = (h - s) / 2; x.lineWidth = s * 0.09; x.lineCap = 'round'; x.beginPath(); for (const k of [1, 2]) { x.moveTo(o + (s * k) / 3, y); x.lineTo(o + (s * k) / 3, y + s); x.moveTo(o, y + (s * k) / 3); x.lineTo(o + s, y + (s * k) / 3); } x.stroke(); },
  (x, w, h) => { const r = h * 0.17; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(w / 2 + (i - 1.5) * r * 2.3, h / 2 + (1.5 - i) * r * 1.6, r, 0, TAU); x.fill(); } },
  (x, w, h) => { x.lineWidth = h * 0.16; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, px = w / 2 + (t - 0.5) * h * 2.4, py = h / 2 + Math.sin(t * TAU * 1.2) * h * 0.25; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.beginPath(); x.arc(w / 2 + h * 1.25, h / 2 + Math.sin(TAU * 1.2) * h * 0.25, h * 0.13, 0, TAU); x.fill(); },
  (x, w, h) => { x.lineWidth = h * 0.07; x.lineJoin = 'round'; x.beginPath(); const m = [1, 0.8, 1.05, 0.85, 1, 0.7, 0.95, 1.08, 0.82, 1]; m.forEach((k, i) => { const a = (i / m.length) * TAU, r = h * 0.42 * k; i ? x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r) : x.moveTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }); x.closePath(); x.stroke(); },
  (x, w, h) => { const p = h / 9; for (const px of spritePixels('fly', 0)) x.fillRect(w / 2 + px.x * p - p / 2, h / 2 + px.y * p - p / 2, p * 0.9, p * 0.9); },
  (x, w, h) => { const bw = h * 0.42, bh = h * 0.16; for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) x.fillRect(w / 2 + (c - 2.5) * bw * 1.08, h * 0.12 + r * bh * 1.35, bw, bh); x.fillRect(w / 2 - bw * 0.7, h * 0.86, bw * 1.4, bh * 0.7); x.beginPath(); x.arc(w / 2 + bw, h * 0.7, bh * 0.45, 0, TAU); x.fill(); },
  (x, w, h) => { const pw = h * 0.6, ph = h * 0.08; x.fillRect(w / 2 - pw * 1.2, h * 0.06, pw, ph); x.fillRect(w / 2 + pw * 0.2, h * 0.86, pw, ph); for (let i = 0; i < 9; i++) x.fillRect(w / 2 - h * 1.3 + i * h * 0.3, h / 2 - ph / 4, h * 0.16, ph / 2); x.beginPath(); x.arc(w / 2 + h * 0.3, h * 0.33, h * 0.07, 0, TAU); x.fill(); },
];

export class Title extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'title';
    this.parts = [];
    this.started = false;
    this.form = -1;
    G.gfx.setNebula([0.3, 0.12, 0.55], [0.05, 0.35, 0.6]);
    G.state = 'title';
  }

  layout() {
    const G = this.G;
    this.logo = this.sampleText('METAMORPH', G.W, G.H);
    this.shapes = ICONS.map((fn) => this.sampleIcon(fn));
    const old = this.parts;
    this.parts = this.logo.map((p, i) => {
      const o = old[i];
      return {
        hx: p.x, hy: p.y,
        x: o ? o.x : rand(G.W), y: o ? o.y : rand(G.H),
        vx: 0, vy: 0, ph: rand(TAU),
        color: mix(C.cyan, C.magenta, clamp((p.x - G.W * 0.1) / (G.W * 0.8), 0, 1)),
      };
    });
    this.form = -2;
  }

  canvasFor(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    return c;
  }

  samplePixels(c, ox, oy, step) {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const out = [];
    for (let y = 0; y < c.height; y += step)
      for (let x = 0; x < c.width; x += step)
        if (data[(Math.round(y) * c.width + Math.round(x)) * 4 + 3] > 140) out.push({ x: ox + x, y: oy + y });
    return out;
  }

  sampleText(text, W, H) {
    const maxW = Math.min(W * 0.9, 620);
    const probe = this.canvasFor(10, 10).getContext('2d');
    probe.font = `900 100px ${FONT}`;
    const size = Math.floor((100 * maxW) / probe.measureText(text).width);
    const c = this.canvasFor(maxW + 20, size * 1.3);
    const x = c.getContext('2d');
    x.font = `900 ${size}px ${FONT}`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    x.fillText(text, c.width / 2, c.height / 2);
    this.size = size;
    this.step = Math.max(2.5, size / 17);
    this.cy = H * 0.36;
    return this.samplePixels(c, (W - c.width) / 2, this.cy - c.height / 2, this.step);
  }

  sampleIcon(fn) {
    const G = this.G, h = Math.min(this.size * 1.9, 150), w = Math.min(G.W * 0.9, h * 3.2);
    const c = this.canvasFor(w, h);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    fn(x, w, h);
    return this.samplePixels(c, (G.W - w) / 2, this.cy - h / 2, this.step * 0.9);
  }

  onDown(p) { this.push = p; }
  onMove(p) { this.push = p; }
  onUp(p) {
    this.push = null;
    if (!p.tap || this.started) return;
    this.started = true;
    const G = this.G;
    G.audio.unlock();
    G.audio.setTrack(0, 0);
    G.audio.riser(1.2);
    G.shock(p.x, p.y, 1.2, 1.1, 1.4);
    G.begin(this);
  }

  update(dt) {
    const G = this.G;
    if (!this.musicSet && G.audio.ok) { this.musicSet = true; G.audio.setTrack('title'); }
    const t = this.t;
    // Showcase cycle: hold the logo, then preview each form in turn.
    const cyc = (t - 3.5) % 11;
    const form = t < 3.5 || cyc > 7 * 0.95 ? -1 : Math.floor(cyc / 0.95);
    if (form !== this.form) {
      this.form = form;
      const set = form >= 0 ? this.shapes[form] : this.logo;
      const n = set.length;
      this.parts.forEach((p, i) => {
        const q = set[Math.floor((i / this.parts.length) * n) % n];
        p.hx = q.x;
        p.hy = q.y;
      });
      if (form >= 0 && G.audio.ok) G.audio.note(form, { type: 'sine', vol: 0.05, d: 0.3 });
    }
    for (const p of this.parts) {
      p.ph += dt * 2;
      const tx = p.hx + Math.sin(p.ph + p.hy * 0.05) * 0.6;
      const ty = p.hy + Math.cos(p.ph * 0.8 + p.hx * 0.04) * 0.6;
      p.vx += (tx - p.x) * 90 * dt;
      p.vy += (ty - p.y) * 90 * dt;
      if (this.push) {
        const dx = p.x - this.push.x, dy = p.y - this.push.y, d2 = dx * dx + dy * dy;
        if (d2 < 6400) { const f = (1 - d2 / 6400) * 2600 * dt; const d = Math.sqrt(d2) || 1; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
      }
      const k = Math.exp(-9 * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    const G = this.G, t = this.t;
    const tint = this.form >= 0 ? STAGE_COLORS[this.form] : null;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const s = Math.max(1.6, this.step * 0.78);
    for (const p of this.parts) {
      const sp = Math.min(1, Math.hypot(p.vx, p.vy) / 300);
      const base = tint ? mix(p.color, tint, 0.75) : p.color;
      ctx.fillStyle = rgb(mix(base, C.white, 0.25 + sp * 0.5));
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
    const cy = this.cy + Math.max(this.size * 1.1, Math.min(this.size * 1.9, 150) / 2 + 22);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = '5px'; } catch {}
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = rgb(C.grid, 0.9);
    ctx.fillText('ONE GAME · SEVEN FORMS', G.W / 2, cy);
    const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.2));
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = rgb(mix(C.cyan, C.white, 0.5), a);
    ctx.fillText('TAP TO BEGIN', G.W / 2, G.H * 0.68);
    if (G.best > 0) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = rgb(C.yellow, 0.8);
      ctx.fillText(`BEST  ${G.best.toLocaleString()}`, G.W / 2, G.H * 0.68 + 30);
    }
    // The seven forms as pips; the one being previewed lights up.
    for (let i = 0; i < 7; i++) {
      const x = G.W / 2 + (i - 3) * 22, y = G.H * 0.8;
      const on = this.form === i;
      ctx.fillStyle = rgb(on ? STAGE_COLORS[i] : C.dim, on ? 1 : 0.6);
      ctx.beginPath(); ctx.arc(x, y, on ? 4.5 : 2.5, 0, TAU); ctx.fill();
    }
    if (this.form >= 0) {
      try { ctx.letterSpacing = '3px'; } catch {}
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = rgb(STAGE_COLORS[this.form], 0.9);
      ctx.fillText(NAMES[this.form], G.W / 2, G.H * 0.8 + 20);
    }
    ctx.restore();
  }
}
