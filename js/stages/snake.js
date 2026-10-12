import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, neonLine, shuffle } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';

const DIRS = { U: { x: 0, y: -1 }, D: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 } };

export class Snake extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'snake';
    this.foods = [];
    this.mines = [];
    this.ripples = [];
    this.queue = [];
    this.eaten = 0;
    this.goal = 10 + G.loop * 3;
    this.grow = 0;
    this.stepT = 0;
    this.gulp = 0;
    this.phase = 'intro';
    this.morph = null;
    G.gfx.setNebula([0.05, 0.4, 0.3], [0.1, 0.15, 0.5]);
    const fromC4 = prev?.kind === 'c4';
    this.setupGrid(fromC4 ? prev : null);
    if (fromC4) this.morphFromC4(prev);
    else {
      this.spawnSnake();
      this.spawnFood();
      this.introDur = 0.9;
    }
    this.prevBody = this.body.map((s) => ({ ...s }));
    this.after(this.introDur - 0.3, () => G.card('SNAKE', `Eat ${this.goal} to evolve`, 'Swipe to steer · edges wrap', C.green));
  }

  setupGrid(c4) {
    const f = this.G.field;
    if (c4) {
      // Snake cells are half a Connect-4 cell, offset so every disc lands on a cell centre.
      const g = (this.g = c4.cs / 2);
      this.ox = c4.bx + g / 2 - Math.floor((c4.bx + g / 2 - f.x) / g) * g;
      this.oy = c4.by + g / 2 - Math.floor((c4.by + g / 2 - f.y) / g) * g;
    } else {
      const g = (this.g = clamp(Math.min(f.w / 14, f.h / 24), 18, 36));
      this.ox = f.x + (f.w - Math.floor(f.w / g) * g) / 2;
      this.oy = f.y + (f.h - Math.floor(f.h / g) * g) / 2;
    }
    this.cols = Math.floor((f.x + f.w - this.ox) / this.g);
    this.rows = Math.floor((f.y + f.h - this.oy) / this.g);
  }

  px(c) { return this.ox + (c + 0.5) * this.g; }
  py(r) { return this.oy + (r + 0.5) * this.g; }
  cellOf(x, y) { return { x: clamp(Math.round((x - this.ox) / this.g - 0.5), 0, this.cols - 1), y: clamp(Math.round((y - this.oy) / this.g - 0.5), 0, this.rows - 1) }; }

  occupied(x, y) {
    return this.body.some((s) => s.x === x && s.y === y) || this.mines.some((m) => m.x === x && m.y === y) || this.foods.some((f) => f.x === x && f.y === y);
  }
  freeCellNear(x, y) {
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
      if (!this.occupied(cx, cy)) return { x: cx, y: cy };
    }
    return null;
  }

  morphFromC4(c4) {
    let cells = c4.result?.who === 1 ? c4.result.cells.slice() : null;
    const discs = c4.discs.filter((d) => d.state === 'rest' || d.state === 'fall');
    const key = (d) => d.c + ',' + d.r;
    if (!cells) cells = discs.filter((d) => d.who === 1).slice(-4).map((d) => ({ c: d.c, r: d.r }));
    if (cells.length < 2) { this.spawnSnake(); this.spawnFood(); this.introDur = 0.9; return; }
    const winSet = new Set(cells.map(key));
    // Map discs onto snake cells, then stitch the gaps with a 4-connected path.
    const pts = cells.map((w) => this.cellOf(c4.colX(w.c), c4.rowY(w.r)));
    const path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      let cur = { ...path[path.length - 1] };
      const tgt = pts[i];
      while (cur.x !== tgt.x || cur.y !== tgt.y) {
        if (cur.x !== tgt.x) cur.x += Math.sign(tgt.x - cur.x); else cur.y += Math.sign(tgt.y - cur.y);
        // Never let the stitched body cross itself.
        const seen = path.findIndex((q) => q.x === cur.x && q.y === cur.y);
        if (seen >= 0) path.length = seen;
        path.push({ ...cur });
      }
    }
    // Head at the end whose heading points into more open space.
    const a = path[path.length - 1], b = path[path.length - 2];
    let body = path.slice().reverse();
    let dir = { x: a.x - b.x, y: a.y - b.y };
    const z = path[0], y1 = path[1];
    const roomA = dir.y === -1 ? a.y : dir.y === 1 ? this.rows - a.y : dir.x === 1 ? this.cols - a.x : a.x;
    const dirZ = { x: z.x - y1.x, y: z.y - y1.y };
    const roomZ = dirZ.y === -1 ? z.y : dirZ.y === 1 ? this.rows - z.y : dirZ.x === 1 ? this.cols - z.x : z.x;
    if (roomZ > roomA) { body = path.slice(); dir = dirZ; }
    this.body = body;
    this.dir = dir;
    // Intro sprites: winning discs glide into body cells; stitched cells grow in.
    this.morph = { segs: [], foods: [], mines: [], pops: [], lines: c4.currentLines() };
    const pathKey = pts.map((p) => p.x + ',' + p.y);
    body.forEach((s, i) => {
      const k = pathKey.indexOf(s.x + ',' + s.y);
      const w = k >= 0 ? cells[k] : null;
      this.morph.segs.push({ i, from: w ? { x: c4.colX(w.c), y: c4.rowY(w.r), r: c4.cs * 0.38 } : null });
    });
    const others = discs.filter((d) => !winSet.has(key(d)));
    const mineBudget = 3 + Math.min(this.G.loop, 3);
    let mines = 0;
    for (const d of shuffle(others)) {
      const near = this.cellOf(d.x, d.y);
      const tooClose = Math.abs(near.x - this.body[0].x) + Math.abs(near.y - this.body[0].y) < 4;
      if (d.who === 1) {
        const c = this.freeCellNear(near.x, near.y);
        if (!c) continue;
        const f = { x: c.x, y: c.y, kind: 'n', t: rand(TAU), born: -1 };
        this.foods.push(f);
        this.morph.foods.push({ f, sx: d.x, sy: d.y, r: c4.cs * 0.38 });
      } else if (mines < mineBudget && !tooClose) {
        const c = this.freeCellNear(near.x, near.y);
        if (!c) continue;
        const m = { x: c.x, y: c.y, t: rand(TAU) };
        this.mines.push(m);
        mines++;
        this.morph.mines.push({ m, sx: d.x, sy: d.y, r: c4.cs * 0.38 });
      } else this.morph.pops.push({ x: d.x, y: d.y, r: c4.cs * 0.38, done: false });
    }
    if (!this.foods.length) this.spawnFood();
    this.introDur = 1.9;
  }

  spawnSnake() {
    const y = Math.floor(this.rows / 2), x = Math.floor(this.cols / 2);
    this.body = [];
    for (let i = 0; i < 4; i++) this.body.push({ x: x - i, y });
    this.dir = { x: 1, y: 0 };
    this.mines = this.mines.filter((m) => m.y !== y);
    this.foods = this.foods.filter((f) => !(f.y === y && Math.abs(f.x - x) < 3));
    this.prevBody = this.body.map((s) => ({ ...s }));
    this.stepT = 0;
    this.queue = [];
  }

  spawnFood() {
    const h = this.body[0];
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(rand(this.cols)), y = Math.floor(rand(this.rows));
      if (this.occupied(x, y)) continue;
      if (h && Math.abs(h.x - x) + Math.abs(h.y - y) < 4) continue;
      const gold = (this.eaten + 1) % 5 === 0;
      this.foods.push({ x, y, kind: gold ? 'gold' : 'n', t: 0, born: this.t });
      return;
    }
  }

  speed() { return 6.2 + this.G.loop * 1.6 + this.eaten * 0.16; }

  onSwipe(d) { this.steer(DIRS[d]); }
  onKey(code) {
    const m = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[code];
    if (m) this.steer(DIRS[m]);
  }
  onUp(p) { if (p.tap && this.phase === 'wait') this.go(); }

  steer(d) {
    if (this.phase === 'wait') {
      if (d.x === -this.dir.x && d.y === -this.dir.y) { this.body.reverse(); this.prevBody = this.body.map((s) => ({ ...s })); }
      this.dir = d;
      this.go();
      return;
    }
    if (this.phase !== 'run') return;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
    if (this.queue.length < 3) this.queue.push(d);
    this.G.audio.tick();
  }

  go() { this.phase = 'run'; this.stepT = 0; haptic(0.3); }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    const old = this.body;
    const h = old[0];
    const nh = { x: (h.x + this.dir.x + this.cols) % this.cols, y: (h.y + this.dir.y + this.rows) % this.rows };
    const willGrow = this.grow > 0;
    const hitSelf = old.some((s, i) => (i < old.length - 1 || willGrow) && s.x === nh.x && s.y === nh.y);
    const hitMine = this.mines.some((m) => m.x === nh.x && m.y === nh.y);
    if (hitSelf || hitMine) { this.die(); return; }
    const nb = [nh, ...old];
    if (willGrow) this.grow--; else nb.pop();
    this.prevBody = nb.map((_, i) => ({ ...(old[i] ?? old[old.length - 1]) }));
    this.body = nb;
    const fi = this.foods.findIndex((f) => f.x === nh.x && f.y === nh.y);
    if (fi >= 0) this.eat(fi);
  }

  eat(i) {
    const G = this.G;
    const f = this.foods.splice(i, 1)[0];
    const x = this.px(f.x), y = this.py(f.y);
    const gold = f.kind === 'gold';
    this.eaten++;
    this.grow += gold ? 3 : 1;
    this.gulp = 1;
    G.audio.eat(this.eaten);
    haptic(gold ? 1 : 0.5);
    G.burst(x, y, { n: gold ? 40 : 22, color: gold ? [C.yellow, C.white] : [C.yellow, C.green], speed: gold ? 380 : 260, life: 0.55 });
    G.particles.ring(x, y, gold ? C.yellow : C.green, 4, this.g * (gold ? 4 : 2.5), 0.5, 3);
    G.shock(x, y, gold ? 0.9 : 0.4, 0.7, gold ? 0.9 : 0.5);
    this.ripples.push({ x, y, t: 0 });
    G.addScore(gold ? 500 : 100, x, y - 18, gold ? C.yellow : C.green);
    if (gold) { G.slowmo(0.4, 0.5); G.flash(C.yellow, 0.12); }
    if (this.eaten >= this.goal) { this.complete(); return; }
    if (!this.foods.length) this.spawnFood();
  }

  complete() {
    const G = this.G;
    this.phase = 'done';
    this.frozenP = clamp(this.stepT * this.speed(), 0, 1);
    G.audio.win();
    G.slowmo(0.3, 0.9);
    G.flash(C.green, 0.15);
    G.addScore(2000, G.W / 2, G.H * 0.3, C.yellow, 26);
    this.after(1.0, () => G.advance());
  }

  die() {
    const G = this.G;
    this.phase = 'dead';
    const segs = this.segPositions(clamp(this.stepT * this.speed(), 0, 1));
    G.shock(segs[0].x, segs[0].y, 1.2, 1, 1);
    segs.forEach((s, i) => this.after(i * 0.03, () => {
      G.burst(s.x, s.y, { n: 10, color: [C.green, C.cyan], speed: 240, life: 0.6 });
      if (i % 4 === 0) G.audio.hit();
    }));
    this.deadSegs = segs;
    this.body = [];
    G.die(() => { this.deadSegs = null; this.spawnSnake(); this.phase = 'wait'; if (!this.foods.length) this.spawnFood(); });
  }

  forceWin() { if (this.phase === 'run' || this.phase === 'wait') { this.eaten = this.goal - 1; const h = this.body[0]; this.foods.push({ x: h.x, y: h.y, kind: 'n', t: 0, born: 0 }); this.eat(this.foods.length - 1); } }

  hudGoal() { return `EATEN ${this.eaten} / ${this.goal}`; }

  update(dt) {
    const G = this.G;
    if (this.phase === 'intro' && this.t >= this.introDur) this.phase = 'wait';
    if (this.phase === 'run') {
      const interval = 1 / this.speed();
      this.stepT += dt;
      while (this.stepT >= interval && this.phase === 'run') { this.stepT -= interval; this.step(); }
    }
    this.gulp = Math.max(0, this.gulp - dt * 4);
    for (const f of this.foods) f.t += dt;
    for (const m of this.mines) m.t += dt;
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 1.6);
    if (this.morph) {
      for (const p of this.morph.pops) if (!p.done && this.t > 0.35) {
        p.done = true;
        G.burst(p.x, p.y, { n: 16, color: C.magenta, speed: 220, life: 0.5 });
      }
      if (this.t > this.introDur) this.morph = null;
    }
  }

  // Interpolated pixel positions of the body, unwrapped so the tube stays continuous across edges.
  segPositions(p) {
    const out = [];
    const W = this.cols, H = this.rows;
    for (let i = 0; i < this.body.length; i++) {
      const a = this.prevBody[i] ?? this.body[i], b = this.body[i];
      let dx = b.x - a.x, dy = b.y - a.y;
      if (dx > 1) dx -= W; else if (dx < -1) dx += W;
      if (dy > 1) dy -= H; else if (dy < -1) dy += H;
      let cx = a.x + dx * p, cy = a.y + dy * p;
      if (i > 0) {
        const pr = out[i - 1];
        const pcx = (pr.x - this.ox) / this.g - 0.5, pcy = (pr.y - this.oy) / this.g - 0.5;
        while (cx - pcx > W / 2) cx -= W;
        while (cx - pcx < -W / 2) cx += W;
        while (cy - pcy > H / 2) cy -= H;
        while (cy - pcy < -H / 2) cy += H;
      }
      out.push({ x: this.px(cx), y: this.py(cy) });
    }
    return out;
  }

  interp() {
    if (this.phase === 'run') return clamp(this.stepT * this.speed(), 0, 1);
    if (this.phase === 'done') return this.frozenP;
    return 1;
  }

  // Grid dots as pixel positions (Asteroids turns these into stars).
  dots() {
    const out = [];
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) out.push({ x: this.px(x), y: this.py(y) });
    return out;
  }

  draw(ctx) {
    const G = this.G, g = this.g, t = this.t;
    const intro = this.phase === 'intro';
    const fw = this.cols * g, fh = this.rows * g;
    // Fading lattice from Connect 4
    if (this.morph?.lines) {
      const a = 1 - clamp(t / 0.8, 0, 1);
      if (a > 0) for (const l of this.morph.lines) neonLine(ctx, l.x1, l.y1, l.x2, l.y2, C.grid, 2, a * 0.7);
    }
    // LED dot matrix with ripples from each bite.
    const cxm = this.ox + fw / 2, cym = this.oy + fh / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const X = this.px(x), Y = this.py(y);
      let a = 0.16;
      if (intro) a *= clamp((t - 0.2 - Math.hypot(X - cxm, Y - cym) / 900) / 0.4, 0, 1);
      let boost = 0;
      for (const r of this.ripples) {
        const d = Math.hypot(X - r.x, Y - r.y) - r.t * 420;
        if (d > -40 && d < 40) boost += (1 - Math.abs(d) / 40) * (1 - r.t / 1.6);
      }
      ctx.fillStyle = boost > 0.05 ? rgb(mix(C.grid, C.green, Math.min(1, boost)), a + boost * 0.6) : rgb(C.grid, a);
      const s = 1.6 + boost * 2;
      ctx.fillRect(X - s / 2, Y - s / 2, s, s);
    }
    ctx.restore();
    // Field edge (portals)
    const ea = intro ? clamp((t - 0.6) / 0.5, 0, 1) : 1;
    ctx.strokeStyle = rgb(C.green, 0.18 * ea);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(this.ox, this.oy, fw, fh);
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath(); ctx.rect(this.ox - 2, this.oy - 2, fw + 4, fh + 4); ctx.clip();

    // Mines
    for (const m of this.mines) {
      const mm = this.morph?.mines.find((q) => q.m === m);
      let x = this.px(m.x), y = this.py(m.y), k = 1;
      if (mm) { k = ease.inOutCubic(clamp((t - 0.2) / 0.8, 0, 1)); x = lerp(mm.sx, x, k); y = lerp(mm.sy, y, k); }
      this.drawMine(ctx, x, y, m.t, k, mm ? mm.r : 0);
    }
    // Food
    for (const f of this.foods) {
      const mf = this.morph?.foods.find((q) => q.f === f);
      let x = this.px(f.x), y = this.py(f.y), k = 1;
      if (mf) { k = ease.inOutCubic(clamp((t - 0.15) / 0.85, 0, 1)); x = lerp(mf.sx, x, k); y = lerp(mf.sy, y, k); }
      const born = f.born >= 0 ? ease.outElastic(clamp((t - f.born) / 0.6, 0, 1)) : 1;
      this.drawFood(ctx, x, y, f, k, mf ? mf.r : 0, born);
    }
    // C4 discs that weren't kept pop like bubbles
    if (this.morph) for (const p of this.morph.pops) if (!p.done) {
      ctx.fillStyle = rgb(C.magenta, 0.9);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + this.t * 0.6), 0, TAU); ctx.fill();
    }

    if (this.body.length) {
      let segs = this.segPositions(this.interp());
      let radii = null;
      if (this.morph) {
        // Discs glide in from the board and shrink to segments.
        const k = ease.inOutCubic(clamp(t / 0.9, 0, 1));
        const grow = ease.outBack(clamp((t - 0.6) / 0.5, 0, 1));
        radii = [];
        segs = segs.map((s, i) => {
          const m = this.morph.segs[i];
          if (m?.from) { radii.push(lerp(m.from.r, g * 0.36, k)); return { x: lerp(m.from.x, s.x, k), y: lerp(m.from.y, s.y, k), c: k }; }
          radii.push(g * 0.36 * grow);
          return { ...s, c: 1 };
        });
      }
      // Draw with wrap-around copies so the tube slides through the edges.
      const offs = [[0, 0]];
      if (segs.some((s) => s.x < this.ox + g)) offs.push([fw, 0]);
      if (segs.some((s) => s.x > this.ox + fw - g)) offs.push([-fw, 0]);
      if (segs.some((s) => s.y < this.oy + g)) offs.push([0, fh]);
      if (segs.some((s) => s.y > this.oy + fh - g)) offs.push([0, -fh]);
      for (const [dx, dy] of offs) {
        ctx.save();
        ctx.translate(dx, dy);
        this.drawSnake(ctx, segs, radii);
        ctx.restore();
      }
    }
    ctx.restore();

    if (this.phase === 'wait') {
      const h = this.segPositions(1)[0];
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillStyle = rgb(C.green, a);
      ctx.fillText('SWIPE TO GO', h.x, h.y - g * 1.3);
      ctx.restore();
    }
  }

  drawSnake(ctx, segs, radii) {
    const g = this.g, n = segs.length;
    const width = (i) => (radii ? radii[i] * 2 : g * (0.72 - 0.32 * (i / Math.max(1, n - 1))));
    const color = (i) => mix(C.green, C.cyan, i / Math.max(1, n - 1));
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i > 0; i--) {
        const a = segs[i], b = segs[i - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) > g * 1.6) continue;
        ctx.strokeStyle = pass === 0 ? rgb(color(i)) : rgb(mix(color(i), C.white, 0.7), 0.8);
        ctx.lineWidth = pass === 0 ? width(i) : width(i) * 0.3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // Scale pattern: little bright beads along the body.
    for (let i = 1; i < n; i += 2) {
      ctx.fillStyle = rgb(mix(color(i), C.white, 0.5), 0.6);
      ctx.beginPath(); ctx.arc(segs[i].x, segs[i].y, width(i) * 0.14, 0, TAU); ctx.fill();
    }
    const h = segs[0];
    const hr = (radii ? radii[0] : g * 0.44) * (1 + this.gulp * 0.25);
    ctx.fillStyle = rgb(C.green);
    ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(mix(C.green, C.white, 0.6));
    ctx.beginPath(); ctx.arc(h.x, h.y, hr * 0.55, 0, TAU); ctx.fill();
    // Eyes face the travel direction.
    const d = this.queue[0] && this.phase === 'run' ? this.dir : this.dir;
    const ex = d.x * hr * 0.35, ey = d.y * hr * 0.35, px = -d.y * hr * 0.45, py = d.x * hr * 0.45;
    for (const s of [1, -1]) {
      ctx.fillStyle = '#04110a';
      ctx.beginPath(); ctx.arc(h.x + ex + px * s, h.y + ey + py * s, hr * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(h.x + ex + px * s + d.x * hr * 0.06, h.y + ey + py * s + d.y * hr * 0.06, hr * 0.09, 0, TAU); ctx.fill();
    }
  }

  drawFood(ctx, x, y, f, k, r0, born) {
    const g = this.g;
    const gold = f.kind === 'gold';
    const col = gold ? C.yellow : mix(C.cyan, C.yellow, k);
    const s = Math.max(0.1, lerp(r0, g * 0.3, k) * born * (1 + 0.1 * Math.sin(f.t * 6)));
    const a = f.t * 1.5;
    ctx.save();
    ctx.translate(x, y);
    if (k < 1) {
      ctx.fillStyle = rgb(C.cyan, 1 - k);
      ctx.beginPath(); ctx.arc(0, 0, s * 1.2, 0, TAU); ctx.fill();
    }
    ctx.rotate(a * k);
    ctx.fillStyle = rgb(col);
    ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(mix(col, C.white, 0.7));
    ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(s * 0.45, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.45, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgb(col, 0.35 + 0.25 * Math.sin(f.t * 4));
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, s * (gold ? 2.6 : 2) + Math.sin(f.t * 3) * 2, 0, TAU); ctx.stroke();
    if (gold) for (let i = 0; i < 3; i++) {
      const aa = f.t * 3 + (i * TAU) / 3;
      ctx.fillStyle = rgb(C.white, 0.9);
      ctx.fillRect(x + Math.cos(aa) * s * 2.4 - 1, y + Math.sin(aa) * s * 2.4 - 1, 2, 2);
    }
  }

  drawMine(ctx, x, y, t, k, r0) {
    const g = this.g;
    const r = lerp(r0, g * 0.3, k);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.8 * k);
    ctx.strokeStyle = rgb(C.magenta);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      ctx.lineTo(Math.cos(a) * r * (1.25 + 0.15 * Math.sin(t * 5)) * k + Math.cos(a) * r * 0.6 * (1 - k), Math.sin(a) * r * (1.25 + 0.15 * Math.sin(t * 5)) * k + Math.sin(a) * r * 0.6 * (1 - k));
    }
    ctx.stroke();
    ctx.fillStyle = rgb(C.magenta);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(mix(C.magenta, C.white, 0.6), 0.6 + 0.4 * Math.sin(t * 7));
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
