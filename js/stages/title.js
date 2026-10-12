import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp } from '../util.js';
import { FONT } from '../hud.js';

// Title: the logo is a cloud of particles you can push around. On tap they
// fly off to become the lines of the first tic-tac-toe grid.
export class Title extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'title';
    this.parts = [];
    this.started = false;
    G.gfx.setNebula([0.3, 0.12, 0.55], [0.05, 0.35, 0.6]);
    G.state = 'title';
  }

  layout() {
    const G = this.G;
    const pts = this.sampleText('METAMORPH', G.W, G.H);
    const old = this.parts;
    this.parts = pts.map((p, i) => {
      const o = old[i];
      return {
        hx: p.x, hy: p.y,
        x: o ? o.x : rand(G.W), y: o ? o.y : rand(G.H),
        vx: 0, vy: 0, ph: rand(TAU),
        color: mix(C.cyan, C.magenta, clamp((p.x - G.W * 0.15) / (G.W * 0.7), 0, 1)),
      };
    });
  }

  sampleText(text, W, H) {
    const c = document.createElement('canvas');
    const w = Math.min(W * 0.92, 640), size = Math.floor(w / (text.length * 0.66));
    c.width = Math.ceil(w); c.height = Math.ceil(size * 1.3);
    const x = c.getContext('2d');
    x.font = `900 ${size}px ${FONT}`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    x.fillText(text, c.width / 2, c.height / 2);
    const data = x.getImageData(0, 0, c.width, c.height).data;
    const step = Math.max(2.5, size / 17);
    const out = [];
    const ox = (W - c.width) / 2, oy = H * 0.36 - c.height / 2;
    for (let y = 0; y < c.height; y += step)
      for (let xx = 0; xx < c.width; xx += step)
        if (data[(Math.round(y) * c.width + Math.round(xx)) * 4 + 3] > 140) out.push({ x: ox + xx, y: oy + y });
    this.size = size;
    this.step = step;
    return out;
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
      // Occasional glitch ripple across the logo.
      if (Math.sin(t * 0.9) > 0.995) p.vx += rand(-40, 40);
      const k = Math.exp(-9 * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    const G = this.G, t = this.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const s = Math.max(1.6, this.step * 0.78);
    for (const p of this.parts) {
      const sp = Math.min(1, Math.hypot(p.vx, p.vy) / 300);
      ctx.fillStyle = rgb(mix(p.color, C.white, 0.25 + sp * 0.5));
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
    const cy = G.H * 0.36 + this.size * 0.75;
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
    // The seven forms, as a row of tiny glyphs.
    const forms = ['#', '●', '~', '◇', '▲', '▬', '‖'];
    ctx.font = `700 13px ${FONT}`;
    forms.forEach((f, i) => {
      const x = G.W / 2 + (i - 3) * 26;
      const on = Math.floor(t * 1.5) % 7 === i;
      ctx.fillStyle = rgb(on ? C.white : C.dim, on ? 1 : 0.7);
      ctx.fillText(f, x, G.H * 0.8);
    });
    ctx.restore();
  }
}
