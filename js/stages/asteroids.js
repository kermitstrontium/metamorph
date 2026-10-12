import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, lerpAngle, pick } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';

const SHIP = [[15, 0], [-10, 10], [-5, 0], [-10, -10]];

export function makeRock(x, y, size, scale, o = {}) {
  const n = 11;
  const verts = [];
  for (let i = 0; i < n; i++) verts.push(rand(0.7, 1.12));
  const craters = [];
  for (let i = 0; i < size; i++) craters.push({ a: rand(TAU), d: rand(0.15, 0.5), r: rand(0.12, 0.22) });
  return {
    x, y, size, r: [0, 15, 27, 46][size] * scale, vx: o.vx ?? 0, vy: o.vy ?? 0,
    ang: rand(TAU), spin: rand(-1.2, 1.2) / size, verts, craters, flash: 0, grow: o.grow ?? 1, r0: o.r0 ?? 0,
  };
}

export function drawRock(ctx, k, color = C.orange, extraAlpha = 1) {
  const r = lerp(k.r0, k.r, k.grow);
  const n = k.verts.length;
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.rotate(k.ang);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const m = lerp(1, k.verts[i], k.grow);
    const x = Math.cos(a) * r * m, y = Math.sin(a) * r * m;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = extraAlpha;
  ctx.fillStyle = 'rgba(28,10,6,0.92)';
  ctx.fill();
  const col = k.flash > 0 ? mix(color, C.white, k.flash) : color;
  ctx.strokeStyle = rgb(col);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = rgb(mix(col, C.white, 0.6), 0.7);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = rgb(col, 0.35);
  ctx.lineWidth = 1;
  for (const c of k.craters) {
    ctx.beginPath();
    ctx.arc(Math.cos(c.a) * c.d * r, Math.sin(c.a) * c.d * r, c.r * r * k.grow, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawShip(ctx, x, y, a, scale, morph = 1, r0 = 10, color = C.cyan, flame = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (flame > 0.05) {
    const fl = (8 + flame * 14 * (0.7 + Math.random() * 0.6)) * scale;
    ctx.fillStyle = rgb(C.orange, 0.9);
    ctx.beginPath(); ctx.moveTo(-6 * scale, 5 * scale); ctx.lineTo(-6 * scale - fl, 0); ctx.lineTo(-6 * scale, -5 * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(C.yellow, 0.9);
    ctx.beginPath(); ctx.moveTo(-6 * scale, 2.5 * scale); ctx.lineTo(-6 * scale - fl * 0.55, 0); ctx.lineTo(-6 * scale, -2.5 * scale); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath();
  SHIP.forEach(([vx, vy], i) => {
    const th = Math.atan2(vy, vx);
    const x1 = lerp(Math.cos(th) * r0, vx * scale, morph), y1 = lerp(Math.sin(th) * r0, vy * scale, morph);
    i ? ctx.lineTo(x1, y1) : ctx.moveTo(x1, y1);
  });
  ctx.closePath();
  ctx.fillStyle = rgb(mix(color, [0, 0, 0], 0.8));
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.strokeStyle = rgb(mix(color, C.white, 0.7));
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

export class Asteroids extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'asteroids';
    this.scale = clamp(Math.min(G.W, G.H) / 420, 0.85, 1.5);
    this.rocks = [];
    this.bullets = [];
    this.killed = 0;
    this.goal = 32 + G.loop * 6;
    this.sticks = { L: null, R: null };
    this.fireT = 0;
    this.phase = 'intro';
    this.hintT = 0;
    this.usedL = false; this.usedR = false;
    this.ship = { x: G.W / 2, y: G.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, r: 10 * this.scale, inv: 3, alive: true, thrust: 0, morph: 1, r0: 10 };
    G.gfx.setNebula([0.55, 0.18, 0.08], [0.25, 0.05, 0.4]);
    G.stars.scrollTarget = 0; G.stars.streakTarget = 0;
    if (prev?.kind === 'snake') this.fromSnake(prev);
    else {
      if (!G.stars.list.length) G.stars.fill(G.W, G.H, 140);
      for (let i = 0; i < 4; i++) this.spawnEdgeRock();
    }
    this.introDur = 1.1;
    this.after(0.4, () => G.card('ASTEROIDS', `Destroy ${this.goal}`, 'Left thumb flies · right thumb aims & fires', C.orange));
  }

  fromSnake(sn) {
    const G = this.G;
    const segs = sn.segPositions(sn.interp()).map((s) => ({
      x: ((s.x - sn.ox) % (sn.cols * sn.g) + sn.cols * sn.g) % (sn.cols * sn.g) + sn.ox,
      y: ((s.y - sn.oy) % (sn.rows * sn.g) + sn.rows * sn.g) % (sn.rows * sn.g) + sn.oy,
    }));
    // Grid dots lift off and become the starfield.
    for (const d of sn.dots()) G.stars.add(d.x, d.y, { vx: rand(-6, 6), vy: rand(-6, 6), fade: 0.3, color: Math.random() < 0.1 ? C.green : C.white });
    const h = segs[0];
    Object.assign(this.ship, { x: h.x, y: h.y, a: Math.atan2(sn.dir.y, sn.dir.x), morph: 0, r0: sn.g * 0.44 });
    // Body segments swell into rocks that drift away from the head.
    const body = segs.slice(1);
    const cap = 12;
    body.forEach((s, i) => {
      if (i >= cap) { G.burst(s.x, s.y, { n: 6, color: C.green, speed: 120 }); return; }
      const size = i % 4 === 0 ? 3 : i % 4 === 2 ? 2 : 1;
      let dx = s.x - h.x, dy = s.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const sp = rand(45, 90) * (size === 3 ? 0.7 : 1);
      this.rocks.push(makeRock(s.x, s.y, size, this.scale, { vx: dx * sp + rand(-20, 20), vy: dy * sp + rand(-20, 20), grow: 0, r0: sn.g * 0.32 }));
    });
    for (const m of sn.mines) {
      this.rocks.push(makeRock(sn.px(m.x), sn.py(m.y), 1, this.scale, { vx: rand(-40, 40), vy: rand(-40, 40), grow: 0, r0: sn.g * 0.3 }));
    }
    for (const f of sn.foods) G.burst(sn.px(f.x), sn.py(f.y), { n: 14, color: C.yellow, speed: 160 });
    while (this.rocks.filter((r) => r.size === 3).length < 3) this.spawnEdgeRock();
    this.morphing = true;
  }

  spawnEdgeRock(size = 3) {
    const G = this.G, side = Math.floor(rand(4)), m = 60;
    const x = side === 0 ? -m : side === 1 ? G.W + m : rand(G.W);
    const y = side === 2 ? -m : side === 3 ? G.H + m : rand(G.H);
    const a = Math.atan2(G.H / 2 - y, G.W / 2 - x) + rand(-0.6, 0.6);
    const sp = rand(35, 75) * (1 + G.loop * 0.2);
    this.rocks.push(makeRock(x, y, size, this.scale, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }));
  }

  stickVec(s) {
    if (!s) return null;
    const R = 55;
    let dx = s.x - s.bx, dy = s.y - s.by;
    const d = Math.hypot(dx, dy);
    if (d > R) { s.bx = s.x - (dx / d) * R; s.by = s.y - (dy / d) * R; dx = s.x - s.bx; dy = s.y - s.by; }
    const m = Math.min(1, d / R);
    return { x: dx / R, y: dy / R, m };
  }

  onDown(p) {
    const side = p.x < this.G.W / 2 ? 'L' : 'R';
    if (!this.sticks[side]) this.sticks[side] = { id: p.id, bx: p.x, by: p.y, x: p.x, y: p.y };
  }
  onMove(p) {
    for (const k of ['L', 'R']) { const s = this.sticks[k]; if (s && s.id === p.id) { s.x = p.x; s.y = p.y; } }
  }
  onUp(p) {
    for (const k of ['L', 'R']) { const s = this.sticks[k]; if (s && s.id === p.id) this.sticks[k] = null; }
  }

  fire() {
    const s = this.ship, G = this.G;
    const sp = 760;
    const nx = Math.cos(s.a), ny = Math.sin(s.a);
    this.bullets.push({ x: s.x + nx * 14 * this.scale, y: s.y + ny * 14 * this.scale, vx: nx * sp + s.vx * 0.5, vy: ny * sp + s.vy * 0.5, life: 0.85 });
    G.audio.laser();
    G.burst(s.x + nx * 15 * this.scale, s.y + ny * 15 * this.scale, { n: 3, color: C.cyan, speed: 120, angle: s.a, spread: 0.8, life: 0.15 });
  }

  breakRock(i, by) {
    const G = this.G;
    const k = this.rocks[i];
    this.rocks.splice(i, 1);
    this.killed++;
    const pts = [0, 100, 50, 20][k.size];
    G.addScore(pts, k.x, k.y, C.orange);
    G.audio.boom(k.size / 3);
    G.burst(k.x, k.y, { n: 8 + k.size * 8, color: [C.orange, C.yellow, C.white], speed: 120 + k.size * 70, life: 0.7 });
    G.burst(k.x, k.y, { n: 4 + k.size * 3, color: C.orange, type: 'px', size: 3 + k.size, speed: 90 + k.size * 30, life: 1.1, drag: 1 });
    G.shake.add(0.06 * k.size);
    if (k.size >= 2) G.shock(k.x, k.y, 0.25 * k.size, 0.6, 0.35 * k.size);
    if (k.size === 3) haptic(0.6);
    if (k.size > 1) {
      const base = Math.atan2(by?.vy ?? k.vy, by?.vx ?? k.vx);
      for (const s of [-1, 1]) {
        const a = base + s * rand(0.6, 1.3);
        const sp = rand(60, 120) * (1 + this.G.loop * 0.15);
        this.rocks.push(makeRock(k.x, k.y, k.size - 1, this.scale, { vx: k.vx * 0.5 + Math.cos(a) * sp, vy: k.vy * 0.5 + Math.sin(a) * sp }));
      }
    }
    if (this.killed >= this.goal && this.phase === 'play') this.complete();
  }

  complete() {
    const G = this.G;
    this.phase = 'done';
    this.ship.inv = 99;
    G.audio.win();
    G.slowmo(0.3, 1);
    G.addScore(2500, G.W / 2, G.H * 0.3, C.yellow, 26);
    while (this.rocks.length < 5) this.spawnEdgeRock(pick([2, 3]));
    this.after(1.3, () => G.advance());
  }

  killShip() {
    const G = this.G, s = this.ship;
    s.alive = false;
    G.burst(s.x, s.y, { n: 60, color: [C.cyan, C.white, C.magenta], speed: 420, life: 0.9 });
    G.burst(s.x, s.y, { n: 10, color: C.cyan, type: 'px', size: 4, speed: 160, life: 1.4, drag: 0.8 });
    G.shock(s.x, s.y, 1.5, 1, 1.2);
    G.audio.boom(1.2);
    G.die(() => {
      Object.assign(s, { x: G.W / 2, y: G.H / 2, vx: 0, vy: 0, inv: 2.5, alive: true });
      for (const k of this.rocks) {
        const dx = k.x - s.x, dy = k.y - s.y, d = Math.hypot(dx, dy);
        if (d < 140) { k.vx += (dx / (d || 1)) * 120; k.vy += (dy / (d || 1)) * 120; }
      }
    });
  }

  forceWin() { if (this.phase === 'play') { this.killed = this.goal - 1; this.breakRock(0); } }
  hudGoal() { return `DESTROYED ${Math.min(this.killed, this.goal)} / ${this.goal}`; }

  update(dt) {
    const G = this.G, s = this.ship, sc = this.scale;
    if (this.phase === 'intro' && this.t > this.introDur) this.phase = 'play';
    const k = clamp(this.t / 1.0, 0, 1);
    if (this.morphing) {
      s.morph = ease.inOutCubic(k);
      for (const r of this.rocks) if (r.grow < 1) r.grow = Math.min(1, r.grow + dt * 1.1);
      if (k >= 1) this.morphing = false;
    }
    this.hintT += dt;

    // Ship
    if (s.alive) {
      let L = this.stickVec(this.sticks.L);
      const R = this.stickVec(this.sticks.R);
      const ax = G.input.axis();
      if (ax.on) L = { x: ax.x, y: ax.y, m: 1 };
      if (L && L.m > 0.1) this.usedL = true;
      if (R && R.m > 0.2) this.usedR = true;
      const canFly = this.phase !== 'intro' || this.t > 0.5;
      s.thrust = 0;
      if (canFly && L && L.m > 0.12) {
        const acc = 600;
        s.vx += L.x * acc * dt; s.vy += L.y * acc * dt;
        s.thrust = L.m;
      }
      const drag = Math.exp(-0.9 * dt);
      s.vx *= drag; s.vy *= drag;
      const sp = Math.hypot(s.vx, s.vy), max = 400;
      if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; }
      let target = null;
      if (R && R.m > 0.2) target = Math.atan2(R.y, R.x);
      else if (L && L.m > 0.12) target = Math.atan2(L.y, L.x);
      else if (G.input.mouse && G.input.keys.size) target = Math.atan2(G.input.mouse.y - s.y, G.input.mouse.x - s.x);
      if (target !== null) s.a = lerpAngle(s.a, target, 1 - Math.exp(-20 * dt));
      s.x += s.vx * dt; s.y += s.vy * dt;
      const m = 12;
      if (s.x < -m) s.x += G.W + 2 * m; else if (s.x > G.W + m) s.x -= G.W + 2 * m;
      if (s.y < -m) s.y += G.H + 2 * m; else if (s.y > G.H + m) s.y -= G.H + 2 * m;
      s.inv = Math.max(0, s.inv - dt);
      if (s.thrust > 0 && Math.random() < 0.9) {
        const bx = s.x - Math.cos(s.a) * 8 * sc, by = s.y - Math.sin(s.a) * 8 * sc;
        G.particles.add({ x: bx, y: by, vx: -Math.cos(s.a + rand(-0.3, 0.3)) * 260 * s.thrust + s.vx, vy: -Math.sin(s.a + rand(-0.3, 0.3)) * 260 * s.thrust + s.vy, life: 0.35, size: 2.2, color: pick([C.orange, C.yellow, C.red]), drag: 3 });
      }
      this.fireT -= dt;
      const wantFire = (R && R.m > 0.35) || G.input.keys.has('Space');
      if (canFly && wantFire && this.fireT <= 0 && this.phase !== 'done') { this.fire(); this.fireT = 0.12; }
    }

    // Bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < 0) b.x += G.W; else if (b.x > G.W) b.x -= G.W;
      if (b.y < 0) b.y += G.H; else if (b.y > G.H) b.y -= G.H;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // Rocks
    for (const r of this.rocks) {
      r.x += r.vx * dt; r.y += r.vy * dt; r.ang += r.spin * dt;
      r.flash = Math.max(0, r.flash - dt * 6);
      const m = r.r + 10;
      if (r.x < -m - 40) r.x += G.W + 2 * m + 40; else if (r.x > G.W + m + 40) r.x -= G.W + 2 * m + 40;
      if (r.y < -m - 40) r.y += G.H + 2 * m + 40; else if (r.y > G.H + m + 40) r.y -= G.H + 2 * m + 40;
    }
    // Bullet vs rock
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ri = this.rocks.length - 1; ri >= 0; ri--) {
        const r = this.rocks[ri];
        if (r.grow < 0.6) continue;
        const dx = b.x - r.x, dy = b.y - r.y;
        if (dx * dx + dy * dy < r.r * r.r) {
          this.bullets.splice(bi, 1);
          this.breakRock(ri, b);
          break;
        }
      }
    }
    // Ship vs rock
    if (s.alive && s.inv <= 0 && this.phase === 'play') {
      for (const r of this.rocks) {
        const dx = s.x - r.x, dy = s.y - r.y, rr = r.r * 0.85 + s.r * 0.8;
        if (dx * dx + dy * dy < rr * rr) { this.killShip(); break; }
      }
    }
    // Keep the field busy.
    if (this.phase === 'play') {
      const mass = this.rocks.reduce((a, r) => a + r.size, 0);
      if (mass < 7 + G.loop * 2) this.spawnEdgeRock();
    }
  }

  draw(ctx) {
    const G = this.G, s = this.ship, sc = this.scale;
    for (const r of this.rocks) {
      if (r.grow < 1) {
        // Still part-snake: green segment blooming into rock.
        ctx.fillStyle = rgb(C.green, 1 - r.grow);
        ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r, r.grow), 0, TAU); ctx.fill();
      }
      drawRock(ctx, r, C.orange, r.grow < 1 ? ease.inQuad(r.grow) : 1);
    }
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      ctx.strokeStyle = rgb(C.cyan);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    if (s.alive) {
      const blink = s.inv > 0 && s.inv < 90 && Math.floor(s.inv * 10) % 2 === 0;
      if (!blink || this.t < 1) drawShip(ctx, s.x, s.y, s.a, sc, s.morph, s.r0, s.morph < 1 ? mix(C.green, C.cyan, s.morph) : C.cyan, s.thrust);
      if (s.inv > 0 && s.inv < 90) {
        ctx.strokeStyle = rgb(C.cyan, 0.3 + 0.2 * Math.sin(this.t * 20));
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 22 * sc, 0, TAU); ctx.stroke();
      }
    }
    this.drawSticks(ctx);
  }

  drawSticks(ctx) {
    const G = this.G;
    const showHint = this.phase !== 'done' && this.hintT < 12 && (!this.usedL || !this.usedR) && G.input.pointers.size === 0;
    ctx.save();
    for (const k of ['L', 'R']) {
      const s = this.sticks[k];
      if (s) {
        ctx.strokeStyle = rgb(k === 'L' ? C.cyan : C.magenta, 0.25);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.bx, s.by, 55, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgb(k === 'L' ? C.cyan : C.magenta, 0.25);
        ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, TAU); ctx.fill();
      } else if (showHint && ((k === 'L' && !this.usedL) || (k === 'R' && !this.usedR))) {
        const x = k === 'L' ? G.W * 0.22 : G.W * 0.78, y = G.H * 0.8;
        const a = 0.25 + 0.15 * Math.sin(this.t * 4);
        ctx.strokeStyle = rgb(k === 'L' ? C.cyan : C.magenta, a);
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 44, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        ctx.font = `800 11px ${FONT}`;
        ctx.fillStyle = rgb(k === 'L' ? C.cyan : C.magenta, a + 0.4);
        ctx.fillText(k === 'L' ? 'FLY' : 'AIM + FIRE', x, y + 4);
      }
    }
    ctx.restore();
  }
}
