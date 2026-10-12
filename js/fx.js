import { TAU, rand, rgb, mix, C, clamp, lerp } from './util.js';

const MAX = 2600;

// Pooled particles. Types: spark (velocity streak), dot, px (square pixel), ring.
export class Particles {
  constructor() {
    this.list = [];
    this.cap = MAX;
  }
  add(p) {
    if (this.list.length >= this.cap) this.list.shift();
    p.t = 0;
    p.drag ??= 2;
    p.g ??= 0;
    p.size ??= 2;
    p.type ??= 'spark';
    p.life ??= 0.6;
    p.a ??= 1;
    p.rot ??= 0;
    p.vr ??= 0;
    this.list.push(p);
    return p;
  }
  burst(x, y, o = {}) {
    const n = o.n ?? 20;
    const sp = o.speed ?? 220;
    const spread = o.spread ?? TAU;
    const ang = o.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const s = sp * (0.25 + Math.random() * 0.9);
      const color = Array.isArray(o.color?.[0]) ? o.color[(Math.random() * o.color.length) | 0] : (o.color ?? C.white);
      this.add({
        x: x + (o.jitter ? rand(-o.jitter, o.jitter) : 0),
        y: y + (o.jitter ? rand(-o.jitter, o.jitter) : 0),
        vx: Math.cos(a) * s + (o.vx ?? 0), vy: Math.sin(a) * s + (o.vy ?? 0),
        life: (o.life ?? 0.6) * (0.5 + Math.random() * 0.8),
        size: (o.size ?? 2) * (0.6 + Math.random() * 0.8),
        color, type: o.type ?? 'spark', drag: o.drag ?? 2.5, g: o.g ?? 0,
        vr: o.type === 'px' ? rand(-8, 8) : 0,
      });
    }
  }
  ring(x, y, color, r0 = 4, r1 = 60, life = 0.5, width = 3) {
    this.add({ x, y, vx: 0, vy: 0, type: 'ring', color, r0, r1, life, size: width, drag: 0 });
  }
  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      L[w++] = p;
    }
    L.length = w;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      const a = p.a * k;
      if (p.type === 'spark') {
        ctx.strokeStyle = rgb(mix(p.color, C.white, k * 0.5), a);
        ctx.lineWidth = p.size;
        const len = 0.045;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len);
        ctx.stroke();
      } else if (p.type === 'dot') {
        ctx.fillStyle = rgb(p.color, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU);
        ctx.fill();
      } else if (p.type === 'px') {
        ctx.fillStyle = rgb(p.color, Math.min(1, a * 1.6));
        const s = p.size;
        if (p.rot) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        } else ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'ring') {
        const e = 1 - Math.pow(1 - p.t / p.life, 3);
        ctx.strokeStyle = rgb(p.color, a);
        ctx.lineWidth = p.size * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lerp(p.r0, p.r1, e), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// Floating score text.
export class Floaters {
  constructor() { this.list = []; }
  add(x, y, text, color = C.white, size = 16) {
    this.list.push({ x, y, text, color, size, t: 0, life: 1.1 });
  }
  update(dt) {
    for (const f of this.list) { f.t += dt; f.y -= 40 * dt; }
    this.list = this.list.filter((f) => f.t < f.life);
  }
  draw(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.list) {
      const k = f.t / f.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      ctx.font = `800 ${f.size * pop}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.fillStyle = rgb(f.color, 1 - k * k);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}

// Starfield. Empty until the snake grid lifts off and becomes stars.
export class Stars {
  constructor() {
    this.list = [];
    this.scroll = 0;       // px/s downward at depth 1
    this.scrollTarget = 0;
    this.streak = 0;       // 0..1 warp streak amount
    this.streakTarget = 0;
    this.drift = 1;        // random drift multiplier
    this.alpha = 1;
  }
  add(x, y, o = {}) {
    this.list.push({
      x, y, z: o.z ?? rand(0.2, 1), tw: rand(TAU), ts: rand(1, 4),
      vx: o.vx ?? rand(-4, 4), vy: o.vy ?? rand(-4, 4), b: o.b ?? rand(0.4, 1), fade: o.fade ?? 0,
      color: o.color ?? (Math.random() < 0.15 ? C.cyan : Math.random() < 0.1 ? C.magenta : C.white),
    });
  }
  fill(W, H, n) { for (let i = 0; i < n; i++) this.add(rand(W), rand(H)); }
  update(dt, W, H) {
    const k = 1 - Math.exp(-dt * 2);
    this.scroll += (this.scrollTarget - this.scroll) * k;
    this.streak += (this.streakTarget - this.streak) * k;
    for (const s of this.list) {
      s.tw += dt * s.ts;
      s.fade = Math.min(1, s.fade + dt * 0.8);
      s.x += s.vx * this.drift * s.z * dt;
      s.y += (s.vy * this.drift + this.scroll) * s.z * dt;
      if (s.x < -10) s.x += W + 20; else if (s.x > W + 10) s.x -= W + 20;
      if (s.y < -40) s.y += H + 80; else if (s.y > H + 40) s.y -= H + 80;
    }
  }
  draw(ctx) {
    if (!this.list.length || this.alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.list) {
      const a = this.alpha * s.b * s.fade * (0.55 + 0.45 * Math.sin(s.tw)) * (0.4 + s.z * 0.6);
      const r = 0.5 + s.z * 1.3;
      const len = this.streak * this.scroll * s.z * 0.06;
      if (len > 1.5) {
        ctx.strokeStyle = rgb(s.color, a);
        ctx.lineWidth = r * 1.2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y - len);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgb(s.color, a);
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }
}

// Trauma-based screen shake.
export class Shake {
  constructor() { this.trauma = 0; this.x = 0; this.y = 0; this.t = 0; }
  add(v) { this.trauma = clamp(this.trauma + v, 0, 1); }
  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 14;
    this.x = s * (Math.sin(this.t * 71.3) * 0.6 + Math.sin(this.t * 37.1) * 0.4);
    this.y = s * (Math.sin(this.t * 63.7 + 1) * 0.6 + Math.sin(this.t * 29.3 + 2) * 0.4);
  }
}
