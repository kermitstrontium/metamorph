import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';

export class Pong extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'pong';
    this.scale = clamp(Math.min(G.W, G.H) / 420, 0.85, 1.5);
    this.target = 3;
    this.sp = 0; this.sa = 0;
    this.bumpP = 0; this.bumpA = 0;
    this.phase = 'intro';
    this.trail = [];
    this.hits = 0;
    G.gfx.setNebula([0.05, 0.25, 0.55], [0.45, 0.05, 0.35]);
    this.layout();
    const w = 88 * this.scale;
    this.me = { x: G.W / 2, w, h: 12, vx: 0, squash: 0 };
    this.ai = { x: G.W / 2, w, h: 12, vx: 0, squash: 0, err: 0, form: 1 };
    this.ghosts = [];
    if (prev?.kind === 'breakout') {
      const pd = prev.paddle;
      this.me.x = pd.x;
      this.me.w = pd.w;
      const live = prev.balls.filter((b) => !b.stuck);
      const b = live[0] ?? prev.balls[0];
      this.ball = { x: b.x, y: b.y, vx: b.vx, vy: b.vy || -300, r: 7 };
      if (b.stuck) this.serve(-1);
      this.ghosts = live.slice(1).map((g) => ({ x: g.x, y: g.y, vx: g.vx, vy: g.vy }));
      // The last brick's shards become the opponent's paddle.
      const lb = prev.lastBrick ?? { x: G.W / 2 - 20, y: this.aiY, w: 40, h: 12, color: C.magenta };
      this.ai.form = 0;
      this.ai.x = clamp(lb.x + lb.w / 2, this.L + w / 2, this.R - w / 2);
      this.shards = Array.from({ length: 48 }, (_, i) => ({
        sx: lb.x + rand(lb.w), sy: lb.y + rand(lb.h), c0: lb.color,
        tx: (i % 24) / 23, ty: i < 24 ? -0.5 : 0.5, d: rand(0, 0.35), cx: rand(-60, 60), cy: rand(-40, 40),
      }));
      this.introDur = 1.4;
    } else {
      this.ball = { x: G.W / 2, y: this.netY, vx: 0, vy: 0, r: 7 };
      this.serve(1);
      this.introDur = 0.8;
    }
    this.after(0.4, () => G.card('PONG', `First to ${this.target}`, 'Drag to move · hit with the edge to angle it', C.cyan, { y: lerp(this.aiY, this.netY, 0.45) }));
  }

  layout() {
    const f = this.G.field;
    this.L = f.x; this.R = f.x + f.w;
    this.aiY = f.y + 30;
    this.meY = f.y + f.h - 44;
    this.netY = (this.aiY + this.meY) / 2;
  }

  serve(dir) {
    const b = this.ball;
    b.x = this.G.W / 2; b.y = this.netY;
    b.vx = 0; b.vy = 0;
    this.serving = { dir, t: 0.9 };
    this.hits = 0;
    if (this.ai) this.ai.err = 0;
  }

  speed() { return Math.min(950, 400 + this.G.loop * 50 + this.hits * 22); }

  onMove(p, dx) { this.me.x = clamp(this.me.x + dx * 1.4, this.L + this.me.w / 2, this.R - this.me.w / 2); }

  exportLines() {
    return [
      { x1: this.me.x - this.me.w / 2, y1: this.meY, x2: this.me.x + this.me.w / 2, y2: this.meY, color: C.cyan },
      { x1: this.ai.x - this.ai.w / 2, y1: this.aiY, x2: this.ai.x + this.ai.w / 2, y2: this.aiY, color: C.magenta },
      { x1: this.L, y1: this.netY, x2: this.R, y2: this.netY, color: C.grid },
    ];
  }

  predictX() {
    const b = this.ball;
    if (b.vy >= 0) return this.G.W / 2;
    const t = (this.aiY + 6 + b.r - b.y) / b.vy;
    let x = b.x + b.vx * t;
    const lo = this.L + b.r, hi = this.R - b.r, w = hi - lo;
    x -= lo;
    x = ((x % (2 * w)) + 2 * w) % (2 * w);
    if (x > w) x = 2 * w - x;
    return x + lo;
  }

  point(byMe) {
    const G = this.G;
    const y = byMe ? this.aiY : this.meY;
    G.shock(this.ball.x, y, 1.6, 1.1, 1.6);
    G.flash(byMe ? C.cyan : C.red, 0.25);
    G.shake.add(0.4);
    G.burst(this.ball.x, y, { n: 50, color: byMe ? [C.cyan, C.white] : [C.red, C.magenta], speed: 500, life: 0.8 });
    if (byMe) {
      this.sp++; this.bumpP = 1;
      G.audio.win();
      G.addScore(750, this.ball.x, y + 30, C.cyan, 20);
      haptic(1);
      if (this.sp >= this.target) { this.phase = 'done'; G.slowmo(0.35, 1); G.addScore(4000, G.W / 2, G.H * 0.4, C.yellow, 26); this.after(1.6, () => G.advance()); this.ball.vx = this.ball.vy = 0; this.ball.hidden = true; return; }
      this.serve(1);
    } else {
      this.sa++; this.bumpA = 1;
      G.audio.lose();
      if (this.sa >= this.target) {
        this.phase = 'dead';
        this.ball.hidden = true;
        G.die(() => { this.sp = 0; this.sa = 0; this.ball.hidden = false; this.phase = 'play'; this.serve(-1); });
        return;
      }
      this.serve(-1);
    }
  }

  forceWin() { if (this.phase === 'play') { this.sp = this.target - 1; this.ball.y = -10; this.point(true); } }
  hudGoal() { return `YOU ${this.sp} — ${this.sa} CPU`; }

  update(dt) {
    const G = this.G, b = this.ball, me = this.me, ai = this.ai;
    if (this.phase === 'intro' && this.t > this.introDur) this.phase = 'play';
    this.bumpP = Math.max(0, this.bumpP - dt * 2);
    this.bumpA = Math.max(0, this.bumpA - dt * 2);
    if (ai.form < 1) ai.form = ease.inOutCubic(clamp((this.t - 0.1) / 1.1, 0, 1));
    const base = 88 * this.scale;
    me.w = lerp(me.w, base, 1 - Math.exp(-4 * dt));
    const ax = G.input.axis();
    if (ax.on) me.x = clamp(me.x + ax.x * 480 * dt, this.L + me.w / 2, this.R - me.w / 2);
    me.vx = (me.x - (me.lx ?? me.x)) / Math.max(dt, 1e-4); me.lx = me.x;
    me.squash = Math.max(0, me.squash - dt * 5);
    ai.squash = Math.max(0, ai.squash - dt * 5);

    for (const g of this.ghosts) { g.x += g.vx * dt; g.y += g.vy * dt; g.a = (g.a ?? 1) - dt * 1.5; }
    this.ghosts = this.ghosts.filter((g) => g.a > 0);

    // AI paddle: tracks a predicted intercept with some human-ish error.
    // The CPU only commits once the ball crosses the net, moves at a capped
    // speed, and misjudges more on fast shots, so sharp edge hits beat it.
    const aiSpeed = 275 + G.loop * 45;
    // A serve heading its way is a gimme: react at once, aim dead centre.
    const reacting = b.vy < 0 && (b.y < this.netY || this.hits === 0);
    const tx = reacting ? this.predictX() + ai.err : G.W / 2 + (b.x - G.W / 2) * 0.2;
    const want = clamp((tx - ai.x) * 8, -aiSpeed, aiSpeed);
    ai.vx = lerp(ai.vx, want, 1 - Math.exp(-10 * dt));
    if (ai.form >= 1 || this.phase !== 'intro') ai.x = clamp(ai.x + ai.vx * dt, this.L + ai.w / 2, this.R - ai.w / 2);

    if (this.serving) {
      this.serving.t -= dt;
      if (this.serving.t <= 0 && this.phase !== 'done' && this.phase !== 'dead') {
        const a = (this.serving.dir > 0 ? -Math.PI / 2 : Math.PI / 2) + rand(-0.45, 0.45);
        b.vx = Math.cos(a) * this.speed(); b.vy = Math.sin(a) * this.speed();
        this.serving = null;
        G.audio.tick();
      }
    }
    if (b.hidden) return;
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 14) this.trail.shift();

    const sp = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.7)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.x < this.L + b.r) { b.x = this.L + b.r; b.vx = Math.abs(b.vx); G.audio.tick(); }
      if (b.x > this.R - b.r) { b.x = this.R - b.r; b.vx = -Math.abs(b.vx); G.audio.tick(); }
      // While the opponent assembles, the top acts as a wall.
      if (this.phase === 'intro' && ai.form < 1 && b.y < this.aiY + b.r && b.vy < 0) { b.vy = Math.abs(b.vy); G.audio.tick(); }
      const paddles = [[me, this.meY, 1], [ai, this.aiY, -1]];
      for (const [p, py, side] of paddles) {
        const ph = p.h;
        const moving = side === 1 ? b.vy > 0 : b.vy < 0;
        if (!moving || (side === -1 && ai.form < 1)) continue;
        const grace = side === 1 ? 6 : 0;
        if (Math.abs(b.y - py) <= ph / 2 + b.r + grace && Math.abs(b.x - p.x) <= p.w / 2 + b.r + grace) {
          this.hits++;
          const off = clamp((b.x - p.x) / (p.w / 2), -1, 1);
          const a = (side === 1 ? -Math.PI / 2 : Math.PI / 2) + off * side * 1.0;
          const v = this.speed();
          b.vx = Math.cos(a) * v + p.vx * 0.15;
          b.vy = Math.sin(a) * v;
          b.y = py - side * (ph / 2 + b.r);
          p.squash = 1;
          G.audio.bounce(side === 1 ? 2 : 4);
          G.burst(b.x, b.y, { n: 10, color: side === 1 ? C.cyan : C.magenta, speed: 200, angle: side === 1 ? -Math.PI / 2 : Math.PI / 2, spread: 2, life: 0.3 });
          if (v > 700) G.shock(b.x, b.y, 0.4, 0.5, 0.4);
          if (side === 1) haptic(0.4);
          ai.err = rand(-1, 1) * (ai.w * Math.max(0.3, 0.58 - G.loop * 0.09) + Math.max(0, v - 420) * 0.1);
        }
      }
    }
    if (this.phase === 'play' || this.phase === 'intro') {
      if (b.y > G.H + 20) this.point(false);
      else if (b.y < -20) this.point(true);
    }
  }

  draw(ctx) {
    const G = this.G, t = this.t, b = this.ball;
    // Big background score digits
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.min(140, G.H * 0.16);
    ctx.font = `900 ${fs * (1 + this.bumpA * 0.2)}px ${FONT}`;
    ctx.fillStyle = rgb(C.magenta, 0.09 + this.bumpA * 0.3);
    ctx.fillText(String(this.sa), G.W / 2, lerp(this.aiY, this.netY, 0.5));
    ctx.font = `900 ${fs * (1 + this.bumpP * 0.2)}px ${FONT}`;
    ctx.fillStyle = rgb(C.cyan, 0.09 + this.bumpP * 0.3);
    ctx.fillText(String(this.sp), G.W / 2, lerp(this.netY, this.meY, 0.5));
    ctx.restore();

    // Net: dashes appear from the centre outward.
    const n = 15, span = this.R - this.L, dw = span / n;
    const sp = Math.hypot(b.vx, b.vy);
    for (let i = 0; i < n; i++) {
      const fromC = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const k = this.prev?.kind === 'breakout' ? clamp((t - fromC * 0.6) / 0.25, 0, 1) : 1;
      if (k <= 0) continue;
      const x = this.L + i * dw + dw * 0.2;
      ctx.fillStyle = rgb(mix(C.grid, C.white, clamp((sp - 500) / 500, 0, 0.6)), 0.5 * k);
      ctx.fillRect(x, this.netY - 1.5, dw * 0.6 * k, 3);
    }

    // AI paddle forming from shards
    const ai = this.ai;
    if (this.shards && ai.form < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.shards) {
        const k = ease.inOutCubic(clamp((t - s.d) / 0.9, 0, 1));
        const tx = ai.x - ai.w / 2 + s.tx * ai.w, ty = this.aiY + s.ty * ai.h * 0.8;
        const u = 1 - k, mx = (s.sx + tx) / 2 + s.cx, my = (s.sy + ty) / 2 + s.cy;
        ctx.fillStyle = rgb(mix(s.c0, C.magenta, k), 1 - ai.form * 0.8);
        ctx.fillRect(u * u * s.sx + 2 * u * k * mx + k * k * tx - 2, u * u * s.sy + 2 * u * k * my + k * k * ty - 2, 4, 4);
      }
      ctx.restore();
    }
    this.drawPaddle(ctx, ai, this.aiY, C.magenta, ai.form);
    this.drawPaddle(ctx, this.me, this.meY, C.cyan, 1);

    for (const g of this.ghosts) {
      ctx.fillStyle = rgb(C.cyan, g.a * 0.6);
      ctx.beginPath(); ctx.arc(g.x, g.y, 7 * g.a, 0, TAU); ctx.fill();
    }
    if (!b.hidden) {
      this.trail.forEach((p, i) => {
        const k = (i + 1) / this.trail.length;
        ctx.fillStyle = rgb(mix(C.cyan, C.magenta, clamp((sp - 400) / 500, 0, 1)), k * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, b.r * k, 0, TAU); ctx.fill();
      });
      const pulse = this.serving ? 1 + 0.3 * Math.sin(t * 16) : 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgb(C.cyan);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse + 1.5, 0, TAU); ctx.stroke();
    }
  }

  drawPaddle(ctx, p, y, col, a) {
    if (a <= 0) return;
    const w = p.w * (1 + p.squash * 0.08), h = p.h * (1 - p.squash * 0.3);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgb(mix(col, [0, 0, 0], 0.55));
    ctx.strokeStyle = rgb(col);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.roundRect(p.x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(mix(col, C.white, 0.7));
    ctx.fillRect(p.x - w / 2 + h / 2, y - 1, w - h, 2);
    ctx.globalAlpha = 1;
  }
}
