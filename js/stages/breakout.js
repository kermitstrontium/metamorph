import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, pick } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';
import { spritePixels } from './galaga.js';
import { drawShip } from './asteroids.js';

const COLS = 8, ROWS = 6;
const ROW_COLORS = [C.green, C.magenta, C.magenta, C.orange, C.yellow, C.yellow];
const SUBX = 6, SUBY = 2;

export class Breakout extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'breakout';
    this.bricks = [];
    this.balls = [];
    this.pickups = [];
    this.lasers = [];
    this.combo = 0;
    this.hits = 0;
    this.phase = 'intro';
    this.scale = clamp(Math.min(G.W, G.H) / 420, 0.85, 1.5);
    G.gfx.setNebula([0.3, 0.1, 0.6], [0.5, 0.1, 0.3]);
    this.layout();
    this.paddle = { x: G.W / 2, w: this.baseW, tw: this.baseW, h: 12, wideT: 0, laserT: 0, laserFire: 0, squash: 0, vx: 0, morph: 1 };
    this.buildBricks();
    if (prev?.kind === 'galaga') this.fromGalaga(prev);
    else {
      for (const b of this.bricks) b.solid = 1;
      this.balls.push(this.newBall(true));
      this.introDur = 0.6;
    }
    G.stars.scrollTarget = 0; G.stars.streakTarget = 0;
    this.after(0.8, () => G.card('BREAKOUT', 'Clear the wall', 'Drag to move · tap to launch', C.violet, { y: G.H * 0.52 }));
  }

  layout() {
    const G = this.G, f = G.field;
    this.L = f.x; this.R = f.x + f.w; this.T = f.y;
    this.bw = (f.w * 0.96) / COLS;
    this.bh = clamp(this.bw * 0.42, 14, 22);
    this.bx = f.x + (f.w - this.bw * COLS) / 2;
    this.by = f.y + Math.min(60, f.h * 0.08);
    this.paddleY = f.y + f.h - 44;
    this.baseW = 84 * this.scale;
    for (const b of this.bricks) { b.x = this.bx + b.c * this.bw + 2; b.y = this.by + b.r * this.bh + 2; b.w = this.bw - 4; b.h = this.bh - 4; }
  }

  buildBricks() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      this.bricks.push({ c, r, x: this.bx + c * this.bw + 2, y: this.by + r * this.bh + 2, w: this.bw - 4, h: this.bh - 4, hp: r === 0 ? 2 : 1, color: ROW_COLORS[r], alive: true, solid: 0, flash: 0 });
    }
  }

  fromGalaga(gal) {
    const G = this.G;
    // Every surviving alien dissolves; its pixels rebuild the wall.
    const src = [];
    for (const a of gal.aliens) for (const px of spritePixels(a.type, 0)) src.push({ x: a.x + px.x * gal.p, y: a.y + px.y * gal.p, color: px.color });
    if (!src.length) src.push({ x: G.W / 2, y: G.H * 0.3, color: C.yellow });
    this.flight = [];
    let k = 0;
    for (const b of this.bricks) {
      b.delay = 0.2 + (b.r * COLS + (b.r % 2 ? COLS - 1 - b.c : b.c)) * 0.012;
      for (let sy = 0; sy < SUBY; sy++) for (let sx = 0; sx < SUBX; sx++) {
        const s = src[k++ % src.length];
        this.flight.push({
          sx: s.x + rand(-2, 2), sy: s.y + rand(-2, 2), c0: s.color, b,
          tx: b.x + ((sx + 0.5) / SUBX) * b.w, ty: b.y + ((sy + 0.5) / SUBY) * b.h,
          cx: rand(-80, 80), cy: rand(-60, 60), d: b.delay + rand(0, 0.25), dur: rand(0.7, 1.0),
        });
      }
      b.done = b.delay + 0.25 + 1.0;
    }
    this.pixSize = Math.max(2, Math.min(b0w(this) / SUBX, this.bh / SUBY) * 0.9);
    // Ship flattens into the paddle.
    this.paddle.x = gal.ship.x;
    this.paddle.morph = 0;
    this.shipScale = gal.scale;
    // The last bullet in flight becomes the ball.
    const lb = gal.bullets[gal.bullets.length - 1];
    const ball = this.newBall(true);
    ball.from = lb ? { x: lb.x, y: lb.y } : { x: gal.ship.x, y: gal.ship.y - 16 };
    this.balls.push(ball);
    this.introDur = 2.2;
    G.audio.riser(1.8);
  }

  newBall(stuck) {
    return { x: this.paddle.x, y: this.paddleY - 6 - 7, vx: 0, vy: 0, r: 7, stuck, off: rand(-0.2, 0.2), trail: [] };
  }

  speed() { return Math.min(800, 430 + this.G.loop * 50 + this.hits * 3); }

  launch() {
    for (const b of this.balls) if (b.stuck) {
      b.stuck = false;
      const a = -Math.PI / 2 + rand(-0.35, 0.35);
      b.vx = Math.cos(a) * this.speed(); b.vy = Math.sin(a) * this.speed();
      this.G.audio.bounce(0);
      haptic(0.4);
    }
  }

  onMove(p, dx) {
    if (this.phase === 'intro' && this.t < 1.2) return;
    const pd = this.paddle;
    pd.x = clamp(pd.x + dx * 1.4, this.L + pd.w / 2, this.R - pd.w / 2);
  }
  onUp(p) { if (p.tap && this.phase === 'play') this.launch(); }
  onSwipe(d) { if (d === 'U' && this.phase === 'play') this.launch(); }
  onKey(code) { if ((code === 'Space' || code === 'ArrowUp') && this.phase === 'play') this.launch(); }

  hitBrick(b, ball) {
    const G = this.G;
    b.hp--;
    b.flash = 1;
    this.hits++;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.hp > 0) { G.audio.hit(); b.color = mix(b.color, C.white, 0.35); return; }
    b.alive = false;
    this.combo++;
    G.audio.note(this.combo - 1, { type: 'square', vol: 0.08, d: 0.22, sparkle: this.combo > 4 });
    G.addScore(40 + this.combo * 10, cx, cy, b.color, 13);
    for (let i = 0; i < 10; i++) G.particles.add({ x: cx + rand(-b.w / 2, b.w / 2), y: cy + rand(-b.h / 2, b.h / 2), vx: rand(-160, 160) + (ball?.vx ?? 0) * 0.2, vy: rand(-160, 120) + (ball?.vy ?? 0) * 0.2, type: 'px', size: rand(3, 5), color: b.color, life: rand(0.5, 1), g: 500, drag: 1, vr: rand(-10, 10) });
    G.burst(cx, cy, { n: 8, color: mix(b.color, C.white, 0.5), speed: 220, life: 0.3 });
    G.shake.add(0.05);
    if (this.combo > 0 && this.combo % 5 === 0) G.floaters.add(cx, cy - 22, `${this.combo}× COMBO`, C.yellow, 18);
    if (Math.random() < 0.16) this.pickups.push({ x: cx, y: cy, kind: pick(['multi', 'wide', 'laser']), t: 0 });
    this.lastBrick = { x: b.x, y: b.y, w: b.w, h: b.h, color: b.color };
    if (!this.bricks.some((q) => q.alive)) this.complete();
  }

  complete() {
    const G = this.G;
    if (this.phase === 'done') return;
    this.phase = 'done';
    G.audio.win();
    G.slowmo(0.3, 1.0);
    G.flash(C.violet, 0.2);
    G.shock(this.lastBrick.x + this.lastBrick.w / 2, this.lastBrick.y, 1.4, 1, 1.4);
    G.addScore(3500, G.W / 2, G.H * 0.4, C.yellow, 26);
    // No pause: the ball stays in play and Pong begins around it.
    G.advance();
  }

  applyPickup(k) {
    const G = this.G, pd = this.paddle;
    G.audio.powerup();
    haptic(0.7);
    if (k === 'multi') {
      const add = [];
      for (const b of this.balls.slice(0, 3)) {
        if (b.stuck) continue;
        for (const s of [-0.45, 0.45]) {
          const a = Math.atan2(b.vy, b.vx) + s, sp = Math.hypot(b.vx, b.vy);
          add.push({ ...b, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, trail: [] });
        }
      }
      this.balls.push(...add);
      G.floaters.add(pd.x, this.paddleY - 30, 'MULTIBALL', C.cyan, 16);
    } else if (k === 'wide') {
      pd.tw = this.baseW * 1.6; pd.wideT = 10;
      G.floaters.add(pd.x, this.paddleY - 30, 'WIDE', C.green, 16);
    } else {
      pd.laserT = 8;
      G.floaters.add(pd.x, this.paddleY - 30, 'LASERS', C.red, 16);
    }
  }

  forceWin() { if (this.phase === 'play') { for (const b of this.bricks) if (b.alive) { b.hp = 1; } const rest = this.bricks.filter((b) => b.alive); rest.slice(0, -1).forEach((b) => (b.alive = false)); this.launch(); this.hitBrick(rest[rest.length - 1]); } }
  hudGoal() { const n = this.bricks.filter((b) => b.alive).length; return `BRICKS LEFT ${n}`; }

  update(dt) {
    const G = this.G, pd = this.paddle;
    if (this.phase === 'intro' && this.t > this.introDur) this.phase = 'play';
    if (pd.morph < 1) pd.morph = ease.inOutCubic(clamp((this.t - 0.3) / 0.9, 0, 1));
    const ax = G.input.axis();
    if (ax.on && this.t > 1.2) pd.x = clamp(pd.x + ax.x * 460 * dt, this.L + pd.w / 2, this.R - pd.w / 2);
    pd.vx = (pd.x - (pd.lx ?? pd.x)) / Math.max(dt, 1e-4); pd.lx = pd.x;
    pd.wideT = Math.max(0, pd.wideT - dt);
    if (pd.wideT <= 0) pd.tw = this.baseW;
    pd.w = lerp(pd.w, pd.tw, 1 - Math.exp(-8 * dt));
    pd.squash = Math.max(0, pd.squash - dt * 5);
    pd.laserT = Math.max(0, pd.laserT - dt);
    if (pd.laserT > 0 && this.phase === 'play') {
      pd.laserFire -= dt;
      if (pd.laserFire <= 0) {
        pd.laserFire = 0.22;
        for (const s of [-1, 1]) this.lasers.push({ x: pd.x + s * (pd.w / 2 - 6), y: this.paddleY - 8 });
        G.audio.pew();
      }
    }
    for (const b of this.bricks) {
      b.flash = Math.max(0, b.flash - dt * 5);
      if (!b.solid && (this.t > (b.done ?? 0))) b.solid = 1;
    }

    // Lasers
    for (const l of this.lasers) {
      l.y -= 900 * dt;
      for (const b of this.bricks) if (b.alive && l.x > b.x && l.x < b.x + b.w && l.y > b.y && l.y < b.y + b.h) { l.y = -50; this.hitBrick(b); break; }
    }
    this.lasers = this.lasers.filter((l) => l.y > this.T - 10);

    // Pickups
    for (const p of this.pickups) {
      p.t += dt; p.y += 150 * dt;
      if (Math.abs(p.x - pd.x) < pd.w / 2 + 12 && Math.abs(p.y - this.paddleY) < 14) { p.got = true; this.applyPickup(p.kind); }
    }
    this.pickups = this.pickups.filter((p) => !p.got && p.y < G.H + 20);

    // Balls
    const ph = pd.h * (1 - pd.squash * 0.3);
    for (const b of this.balls) {
      if (b.stuck) {
        if (b.from && this.t < 1.6) {
          // Bullet slows, curls and drops onto the paddle as the new ball.
          const k = ease.inOutCubic(clamp((this.t - 0.2) / 1.3, 0, 1));
          const tx = pd.x + b.off * pd.w * 0.3, ty = this.paddleY - pd.h / 2 - b.r;
          b.x = lerp(b.from.x, tx, k) + Math.sin(k * Math.PI) * 60;
          b.y = lerp(b.from.y, ty, k) - Math.sin(k * Math.PI) * 80;
        } else {
          b.from = null;
          b.x = pd.x + b.off * pd.w * 0.3;
          b.y = this.paddleY - pd.h / 2 - b.r;
        }
        continue;
      }
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();
      const sp = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.7)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        b.x += b.vx * h; b.y += b.vy * h;
        if (b.x < this.L + b.r) { b.x = this.L + b.r; b.vx = Math.abs(b.vx); G.audio.tick(); }
        if (b.x > this.R - b.r) { b.x = this.R - b.r; b.vx = -Math.abs(b.vx); G.audio.tick(); }
        if (b.y < this.T + b.r) { b.y = this.T + b.r; b.vy = Math.abs(b.vy); G.audio.tick(); }
        // Paddle
        if (b.vy > 0 && b.y + b.r >= this.paddleY - ph / 2 && b.y - b.r <= this.paddleY + ph / 2 && Math.abs(b.x - pd.x) <= pd.w / 2 + b.r) {
          const off = clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
          const a = -Math.PI / 2 + off * 1.05;
          const v = this.speed();
          b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
          b.y = this.paddleY - ph / 2 - b.r;
          pd.squash = 1;
          this.combo = 0;
          G.audio.bounce(2);
          G.burst(b.x, b.y + b.r, { n: 8, color: C.cyan, speed: 160, angle: -Math.PI / 2, spread: 2, life: 0.3 });
          haptic(0.3);
        }
        // Bricks
        for (const k of this.bricks) {
          if (!k.alive || !k.solid) continue;
          const nx = clamp(b.x, k.x, k.x + k.w), ny = clamp(b.y, k.y, k.y + k.h);
          const dx = b.x - nx, dy = b.y - ny;
          if (dx * dx + dy * dy < b.r * b.r) {
            const ox = Math.min(b.x + b.r - k.x, k.x + k.w - (b.x - b.r));
            const oy = Math.min(b.y + b.r - k.y, k.y + k.h - (b.y - b.r));
            if (ox < oy) { b.vx = b.x < k.x + k.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); }
            else { b.vy = b.y < k.y + k.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); }
            this.hitBrick(k, b);
            const v = this.speed(), cur = Math.hypot(b.vx, b.vy) || 1;
            b.vx *= v / cur; b.vy *= v / cur;
            break;
          }
        }
        if (this.phase === 'done') break;
      }
      // Avoid boring horizontal loops.
      if (Math.abs(b.vy) < 90) { b.vy = (b.vy < 0 ? -1 : 1) * 90; }
      if (b.y > G.H + 30) b.lost = true;
    }
    if (this.phase !== 'done') {
      const before = this.balls.length;
      this.balls = this.balls.filter((b) => !b.lost);
      if (before && !this.balls.length) {
        this.phase = 'dead';
        G.die(() => { this.balls = [this.newBall(true)]; this.phase = 'play'; });
      }
    }
  }

  draw(ctx) {
    const G = this.G, pd = this.paddle, t = this.t;
    // Pixels in flight from the aliens
    if (this.flight && t < 2.6) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const s = this.pixSize;
      for (const f of this.flight) {
        const k = ease.inOutCubic(clamp((t - f.d) / f.dur, 0, 1));
        if (f.b.solid && k >= 1) continue;
        const u = 1 - k;
        const mx = (f.sx + f.tx) / 2 + f.cx, my = (f.sy + f.ty) / 2 + f.cy;
        const x = u * u * f.sx + 2 * u * k * mx + k * k * f.tx, y = u * u * f.sy + 2 * u * k * my + k * k * f.ty;
        ctx.fillStyle = rgb(mix(f.c0, f.b.color, k));
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.restore();
    }
    const few = this.bricks.filter((b) => b.alive).length <= 3;
    for (const b of this.bricks) {
      if (!b.alive || !b.solid) continue;
      const pulse = few ? 0.25 + 0.25 * Math.sin(t * 8) : 0;
      const col = mix(b.color, C.white, b.flash * 0.7 + pulse);
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, rgb(mix(col, [0, 0, 0], 0.55)));
      g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.82)));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 3); ctx.fill();
      ctx.strokeStyle = rgb(col, 0.95);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = rgb(mix(col, C.white, 0.6), 0.55);
      ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 1.2);
      if (b.hp > 1) { ctx.fillStyle = rgb(C.white, 0.8); ctx.fillRect(b.x + b.w / 2 - 2, b.y + b.h / 2 - 2, 4, 4); }
    }
    // Pickups
    for (const p of this.pickups) {
      const col = p.kind === 'multi' ? C.cyan : p.kind === 'wide' ? C.green : C.red;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = rgb(mix(col, [0, 0, 0], 0.5));
      ctx.strokeStyle = rgb(col); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-14, -7, 28, 14, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.kind === 'multi' ? 'M' : p.kind === 'wide' ? 'W' : 'L', 0, 0.5);
      ctx.restore();
    }
    ctx.lineCap = 'round';
    for (const l of this.lasers) {
      ctx.strokeStyle = rgb(C.red); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + 12); ctx.stroke();
    }
    this.drawPaddle(ctx);
    for (const b of this.balls) this.drawBall(ctx, b);
  }

  drawPaddle(ctx) {
    const pd = this.paddle, m = pd.morph;
    const y = this.paddleY;
    if (m < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - m;
      ctx.translate(pd.x, y);
      ctx.scale(lerp(1, pd.w / 22, m), lerp(1, 0.3, m));
      drawShip(ctx, 0, 0, -Math.PI / 2, this.shipScale ?? 1, 1, 10, C.cyan, 0);
      ctx.restore();
    }
    const w = lerp(20, pd.w, m) * (1 + pd.squash * 0.08), h = pd.h * (1 - pd.squash * 0.3);
    ctx.globalAlpha = m;
    ctx.fillStyle = rgb(mix(C.cyan, [0, 0, 0], 0.55));
    ctx.strokeStyle = rgb(C.cyan);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.roundRect(pd.x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(mix(C.cyan, C.white, 0.7));
    ctx.fillRect(pd.x - w / 2 + h / 2, y - 1, w - h, 2);
    if (pd.laserT > 0) {
      ctx.fillStyle = rgb(C.red);
      for (const s of [-1, 1]) ctx.fillRect(pd.x + s * (w / 2 - 6) - 2, y - h / 2 - 6, 4, 6);
    }
    ctx.globalAlpha = 1;
  }

  drawBall(ctx, b) {
    b.trail.forEach((p, i) => {
      const k = (i + 1) / b.trail.length;
      ctx.fillStyle = rgb(C.cyan, k * 0.35);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r * k * 0.9, 0, TAU); ctx.fill();
    });
    const grow = b.from ? clamp((this.t - 0.2) / 1.0, 0.25, 1) : 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * grow, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgb(C.cyan);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * grow + 1.5, 0, TAU); ctx.stroke();
  }
}

function b0w(s) { return s.bw - 4; }
