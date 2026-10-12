import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, Path, pick, lerpAngle } from '../util.js';
import { haptic } from '../input.js';
import { drawRock, drawShip } from './asteroids.js';

// 11x8 pixel aliens, two animation frames each. a/b/c map to the palette.
const SLOTS = [];
[['boss', [2, 3, 4, 5]], ['fly', [0, 1, 2, 3, 4, 5, 6, 7]], ['fly', [0, 1, 2, 3, 4, 5, 6, 7]], ['bee', [0, 1, 2, 3, 4, 5, 6, 7]], ['bee', [0, 1, 2, 3, 4, 5, 6, 7]]]
  .forEach(([type, cols], row) => cols.forEach((col) => SLOTS.push([type, row, col])));

export const SPRITES = {
  bee: {
    pal: { a: C.yellow, b: C.blue, c: C.red },
    frames: [
      ['.b.......b.', '..b.....b..', '...aaaaa...', 'bbacaaacabb', 'bbaaaaaaabb', 'b..aaaaa..b', '...a.a.a...', '..a.....a..'],
      ['b.........b', '.b.......b.', 'b..aaaaa..b', 'bbacaaacabb', '.baaaaaaab.', '...aaaaa...', '...a.a.a...', '....a.a....'],
    ],
  },
  fly: {
    pal: { a: C.magenta, b: C.red, c: C.white },
    frames: [
      ['..a.....a..', '...a...a...', '..aaaaaaa..', '.aacaaacaa.', 'aaaaaaaaaaa', 'a.aaaaaaa.a', 'a.a.....a.a', '...bb.bb...'],
      ['..a.....a..', 'a..a...a..a', 'a.aaaaaaa.a', 'aaacaaacaaa', 'aaaaaaaaaaa', '.aaaaaaaaa.', '..a.....a..', '.b.......b.'],
    ],
  },
  boss: {
    pal: { a: C.green, b: C.violet, c: C.white },
    frames: [
      ['....aaa....', '..aaaaaaa..', '.aacaaacaa.', '.abaaaaaba.', 'aaaaaaaaaaa', '..bb...bb..', '.bb.b.b.bb.', 'b.........b'],
      ['....aaa....', '..aaaaaaa..', '.aacaaacaa.', '.abaaaaaba.', 'aaaaaaaaaaa', '...bb.bb...', '..b..b..b..', '.b.......b.'],
    ],
  },
};
SPRITES.bossHit = { pal: { a: C.cyan, b: C.violet, c: C.white }, frames: SPRITES.boss.frames };

// Pixel list for a sprite frame: [{x, y, color}] in pixel units centred on 0.
export function spritePixels(type, frame = 0) {
  const sp = SPRITES[type], rows = sp.frames[frame];
  const out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') out.push({ x: x - 5, y: y - 3.5, color: sp.pal[ch] }); }));
  return out;
}

export class Galaga extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'galaga';
    this.aliens = [];
    this.bullets = [];
    this.ebullets = [];
    this.kills = 0;
    this.goal = 54 + G.loop * 6;
    this.reinforceT = 0;
    this.diveT = 2.5;
    this.fireT = 0;
    this.phase = 'intro';
    this.sway = 0;
    G.gfx.setNebula([0.4, 0.3, 0.05], [0.05, 0.1, 0.45]);
    this.layout();
    this.ship = { x: G.W / 2, y: this.shipY, a: -Math.PI / 2, alive: true, inv: 0 };
    this.buildFormation();
    if (prev?.kind === 'asteroids' && prev.rocks.length) this.fromAsteroids(prev);
    else this.flyIn();
    // Warp: stars streak, then settle into a vertical scroll.
    G.stars.scrollTarget = 1100; G.stars.streakTarget = 1;
    if (!G.stars.list.length) G.stars.fill(G.W, G.H, 140);
    this.after(1.2, () => { G.stars.scrollTarget = 70; G.stars.streakTarget = 0.3; });
    this.after(0.5, () => G.card('GALAGA', `Shoot down ${this.goal}`, 'Drag anywhere to move · auto-fire', C.yellow, { y: G.H * 0.52 }));
  }

  layout() {
    const G = this.G, f = G.field;
    this.sx = Math.min(46, (f.w * 0.94) / 8);
    this.sy = this.sx * 0.86;
    this.p = (this.sx * 0.66) / 11;
    this.top = f.y + 26;
    this.cx = f.x + f.w / 2;
    this.shipY = f.y + f.h - 44;
    this.scale = clamp(Math.min(G.W, G.H) / 420, 0.85, 1.5);
    if (this.ship) this.ship.y = this.shipY;
    this.cache = {};
  }

  // Pre-render sprite frames for speed.
  sprite(type, frame) {
    const key = type + frame;
    if (this.cache[key]) return this.cache[key];
    const dpr = this.G.dpr, p = this.p;
    const c = document.createElement('canvas');
    c.width = Math.ceil(11 * p * dpr); c.height = Math.ceil(8 * p * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    for (const px of spritePixels(type, frame)) {
      x.fillStyle = rgb(px.color);
      x.fillRect((px.x + 5) * p, (px.y + 3.5) * p, p + 0.3, p + 0.3);
    }
    return (this.cache[key] = c);
  }

  buildFormation() {
    for (const [type, row, col] of SLOTS) this.aliens.push(this.newAlien(type, row, col));
  }
  newAlien(type, row, col) { return { type, row, col, hp: type === 'boss' ? 2 : 1, x: 0, y: 0, rot: 0, state: 'form', ph: rand(TAU), reveal: 1 }; }

  // Fresh waves swoop in to refill empty formation slots, so the goal can
  // outnumber a single formation.
  reinforce() {
    const G = this.G;
    const taken = new Set(this.aliens.map((a) => a.row + ',' + a.col));
    const free = SLOTS.filter(([, r, c]) => !taken.has(r + ',' + c));
    const side = Math.random() < 0.5 ? -1 : 1;
    free.forEach(([type, row, col], k) => {
      const a = this.newAlien(type, row, col);
      const sl = this.slot(a);
      a.path = new Path([[G.W / 2 + side * G.W * 0.55, -30], [G.W / 2 - side * G.W * 0.1, G.H * 0.32], [G.W / 2 + side * G.W * 0.3, G.H * 0.5], [sl.x, sl.y + 110], [sl.x, sl.y]]);
      a.state = 'morph';
      a.delay = this.t + k * 0.07;
      a.dur = 1.8;
      a.x = -100; a.y = -100;
      this.aliens.push(a);
    });
    if (free.length) G.floaters.add(G.W / 2, this.top + this.sy * 5.5, 'REINFORCEMENTS', C.red, 16);
  }

  slot(a) {
    const br = 1 + 0.05 * Math.sin(this.t * 1.2) * this.sway;
    const fx = Math.sin(this.t * 0.55) * this.G.field.w * 0.05 * this.sway;
    return { x: this.cx + (a.col - 3.5) * this.sx * br + fx, y: this.top + a.row * this.sy * br };
  }

  fromAsteroids(ast) {
    const G = this.G;
    const s = ast.ship;
    this.shipFrom = { x: s.x, y: s.y, a: s.a };
    this.ship.x = s.x; this.ship.y = s.y; this.ship.a = s.a;
    this.srcRocks = ast.rocks.map((r) => ({ ...r, grow: 1, r0: 0, base: r.r }));
    for (const r of this.srcRocks) G.burst(r.x, r.y, { n: 10, color: C.orange, speed: 180, life: 0.5 });
    const rocks = this.srcRocks.slice().sort((a, b) => a.x - b.x);
    const al = this.aliens.slice().sort((a, b) => this.slot(a).x - this.slot(b).x);
    al.forEach((a, i) => {
      const r = rocks[Math.floor((i * rocks.length) / al.length)];
      const sl = this.slot(a);
      const ang = rand(TAU), rr = r.r * rand(0, 0.6);
      const sx = r.x + Math.cos(ang) * rr, sy = r.y + Math.sin(ang) * rr;
      const mid = { x: lerp(sx, sl.x, 0.5) + rand(-90, 90), y: lerp(sy, sl.y, 0.5) + rand(-60, 60) };
      a.path = new Path([[sx, sy], [mid.x, mid.y], [sl.x, sl.y]]);
      a.state = 'morph';
      a.delay = rand(0, 0.45);
      a.dur = rand(1.0, 1.35);
      a.src = r;
      a.reveal = 0;
      a.shard = Array.from({ length: 5 }, () => rand(0.5, 1.1));
      a.x = sx; a.y = sy;
    });
    for (const r of this.srcRocks) r.total = this.aliens.filter((a) => a.src === r).length;
    this.introDur = 2.0;
  }

  flyIn() {
    const G = this.G;
    this.aliens.forEach((a, i) => {
      const side = a.col < 4 ? -1 : 1;
      const sl = this.slot(a);
      const sx = G.W / 2 + side * G.W * 0.6, sy = G.H * 0.35;
      a.path = new Path([[G.W / 2 - side * 40, -30], [G.W / 2 + side * 60, G.H * 0.3], [sx * 0.5 + G.W * 0.25, G.H * 0.55], [sl.x, sl.y + 120], [sl.x, sl.y]]);
      a.state = 'morph';
      a.delay = (a.row * 8 + a.col) * 0.04;
      a.dur = 1.6;
      a.reveal = 1;
      a.x = -100; a.y = -100;
    });
    this.introDur = 3.0;
  }

  onMove(p, dx) { if (this.ship.alive && this.phase !== 'intro') this.ship.x = clamp(this.ship.x + dx * 1.35, this.G.field.x + 14, this.G.field.x + this.G.field.w - 14); }

  launchDive() {
    const G = this.G;
    const inForm = this.aliens.filter((a) => a.state === 'form');
    const diving = this.aliens.filter((a) => a.state === 'dive').length;
    if (!inForm.length || diving >= 4 + G.loop) return;
    const lead = pick(inForm);
    const group = [lead];
    if (lead.type === 'boss') group.push(...inForm.filter((a) => a.row === 1 && Math.abs(a.col - lead.col) <= 1).slice(0, 2));
    const side = lead.col < 3.5 ? -1 : 1;
    group.forEach((a, k) => {
      const P0 = [a.x, a.y];
      const off = (k === 0 ? 0 : (k === 1 ? -1 : 1) * 26);
      const sx = this.ship.x;
      a.path = new Path([P0, [a.x + side * 40, a.y - 45], [a.x + side * 85, a.y + 15], [lerp(a.x, sx, 0.5) + rand(-70, 70) + off, G.H * 0.45], [sx + rand(-50, 50) + off, G.H * 0.72], [sx - side * rand(60, 160) + off, G.H + 60]]);
      a.state = 'dive';
      a.d = 0;
      a.speed = (a.type === 'bee' ? 270 : 240) + G.loop * 40;
      a.shots = [rand(0.3, 0.45), rand(0.5, 0.65)].slice(0, 1 + (Math.random() < 0.5 + G.loop * 0.2 ? 1 : 0));
    });
    G.audio.tone({ f: 600, f1: 300, type: 'triangle', vol: 0.05, d: 0.25, verb: 0.3 });
  }

  fire() {
    this.bullets.push({ x: this.ship.x, y: this.ship.y - 14, vy: -900 });
    this.G.audio.pew();
  }

  alienShoot(a) {
    const G = this.G, s = this.ship;
    let dx = s.x - a.x, dy = s.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    if (dy < 0.5) { dy = 0.5; dx = Math.sign(dx) * 0.86; }
    const sp = 250 + G.loop * 40;
    const n = a.type === 'boss' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const sa = (i - (n - 1) / 2) * 0.22, c = Math.cos(sa), sn = Math.sin(sa);
      this.ebullets.push({ x: a.x, y: a.y + 8, vx: (dx * c - dy * sn) * sp, vy: (dx * sn + dy * c) * sp });
    }
  }

  killAlien(a) {
    const G = this.G;
    const p = this.p;
    a.dead = true;
    this.kills++;
    const diving = a.state === 'dive';
    const pts = { bee: 50, fly: 80, boss: 150, bossHit: 150 }[a.type] * (diving ? 2 : 1);
    G.addScore(pts, a.x, a.y - 10, diving ? C.yellow : C.white);
    // Explode into the sprite's own pixels.
    for (const px of spritePixels(a.type === 'boss' && a.hp <= 0 ? 'bossHit' : a.type, 0)) {
      const ang = Math.atan2(px.y, px.x) + rand(-0.4, 0.4);
      const sp = rand(80, 300);
      G.particles.add({ x: a.x + px.x * p, y: a.y + px.y * p, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, type: 'px', size: p * 1.05, color: px.color, life: rand(0.5, 1.1), drag: 2.2, vr: rand(-10, 10) });
    }
    G.burst(a.x, a.y, { n: 10, color: C.white, speed: 300, life: 0.3 });
    G.audio.boom(a.type === 'boss' ? 0.7 : 0.4);
    G.shake.add(a.type === 'boss' ? 0.2 : 0.08);
    if (a.type === 'boss') G.shock(a.x, a.y, 0.6, 0.6, 0.5);
    if (this.kills >= this.goal && this.phase === 'play') this.complete();
  }

  complete() {
    const G = this.G;
    this.phase = 'done';
    this.ship.inv = 99;
    this.ebullets = [];
    G.audio.win();
    G.slowmo(0.35, 0.9);
    G.addScore(3000, G.W / 2, G.H * 0.4, C.yellow, 26);
    for (const a of this.aliens) if (!a.dead && a.state !== 'form') { a.state = 'return'; a.y = Math.min(a.y, -20); }
    this.after(1.5, () => G.advance());
  }

  killShip() {
    const G = this.G, s = this.ship;
    s.alive = false;
    G.burst(s.x, s.y, { n: 60, color: [C.cyan, C.white, C.magenta], speed: 420, life: 0.9 });
    G.shock(s.x, s.y, 1.4, 1, 1.1);
    G.audio.boom(1.2);
    G.die(() => { s.alive = true; s.inv = 2.5; s.x = G.W / 2; this.ebullets = []; });
  }

  forceWin() { if (this.phase === 'play') { this.kills = this.goal - 1; this.killAlien(this.aliens.find((a) => !a.dead)); this.aliens = this.aliens.filter((a) => !a.dead); } }
  hudGoal() { return `SHOT DOWN ${Math.min(this.kills, this.goal)} / ${this.goal}`; }

  update(dt) {
    const G = this.G, s = this.ship;
    if (this.phase === 'intro' && this.t > this.introDur) this.phase = 'play';
    this.sway = Math.min(1, this.sway + (this.phase === 'intro' ? 0 : dt * 0.5));

    // Ship: glide in from Asteroids, turning to face up.
    if (this.shipFrom && this.t < 1.3) {
      const k = ease.inOutCubic(clamp(this.t / 1.2, 0, 1));
      s.x = lerp(this.shipFrom.x, G.W / 2, k);
      s.y = lerp(this.shipFrom.y, this.shipY, k);
      s.a = lerpAngle(this.shipFrom.a, -Math.PI / 2, k);
    } else { s.y = this.shipY; s.a = -Math.PI / 2; }
    const ax = G.input.axis();
    if (ax.on && s.alive && this.phase !== 'intro') s.x = clamp(s.x + ax.x * 380 * dt, G.field.x + 14, G.field.x + G.field.w - 14);
    s.inv = Math.max(0, s.inv - dt);
    this.fireT -= dt;
    if (s.alive && this.phase === 'play' && this.fireT <= 0 && this.bullets.length < 6) { this.fire(); this.fireT = 0.16; }

    for (const b of this.bullets) b.y += b.vy * dt;
    this.bullets = this.bullets.filter((b) => b.y > -20);
    for (const b of this.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    this.ebullets = this.ebullets.filter((b) => b.y < G.H + 20 && b.x > -20 && b.x < G.W + 20);

    // Rocks shrink away as their shards leave.
    if (this.srcRocks) {
      for (const r of this.srcRocks) {
        r.x += r.vx * dt * 0.3; r.y += r.vy * dt * 0.3; r.ang += r.spin * dt;
        const left = this.aliens.filter((a) => a.src === r && a.state === 'morph' && this.t - a.delay < a.dur * 0.15).length;
        r.grow = r.total ? left / r.total : 0;
      }
      if (this.t > 2.5) this.srcRocks = null;
    }

    for (const a of this.aliens) {
      a.ph += dt;
      if (a.state === 'morph') {
        const k = clamp((this.t - a.delay) / a.dur, 0, 1);
        const e = ease.inOutCubic(k);
        const pt = a.path.at(e * a.path.total);
        a.x = pt.x; a.y = pt.y;
        a.rot = k < 1 ? pt.a + Math.PI / 2 : 0;
        a.rot *= 1 - ease.inCubic(k);
        if (a.src) a.reveal = clamp((k - 0.25) / 0.6, 0, 1);
        if (k >= 1) { a.state = 'form'; a.reveal = 1; a.rot = 0; }
      } else if (a.state === 'form') {
        const sl = this.slot(a);
        a.x = sl.x; a.y = sl.y; a.rot = 0;
      } else if (a.state === 'dive') {
        const before = a.d / a.path.total;
        a.d += a.speed * dt;
        const k = a.d / a.path.total;
        const pt = a.path.at(a.d);
        a.x = pt.x; a.y = pt.y;
        a.rot = lerpAngle(a.rot, pt.a - Math.PI / 2, 1 - Math.exp(-10 * dt));
        for (const sh of a.shots) if (before < sh && k >= sh && this.phase === 'play') this.alienShoot(a);
        if (k >= 1) { a.state = 'return'; a.x = this.slot(a).x; a.y = -30; }
      } else if (a.state === 'return') {
        const sl = this.slot(a);
        const sp = this.phase === 'done' ? 600 : 220;
        a.x = lerp(a.x, sl.x, 1 - Math.exp(-4 * dt));
        a.y = Math.min(sl.y, a.y + sp * dt);
        a.rot = lerpAngle(a.rot, 0, 1 - Math.exp(-6 * dt));
        if (a.y >= sl.y - 0.5) a.state = 'form';
      }
    }

    if (this.phase === 'play') {
      this.reinforceT -= dt;
      const left = this.goal - this.kills;
      if (this.aliens.length < 14 && left + 8 > this.aliens.length && this.reinforceT <= 0) { this.reinforce(); this.reinforceT = 4; }
      this.diveT -= dt;
      if (this.diveT <= 0) { this.launchDive(); this.diveT = rand(0.8, 1.6) / (1 + G.loop * 0.3); }
    }

    // Collisions
    const hw = 5.5 * this.p, hh = 4.5 * this.p;
    for (const b of this.bullets) {
      for (const a of this.aliens) {
        if (a.dead || a.state === 'morph') continue;
        if (Math.abs(b.x - a.x) < hw && Math.abs(b.y - a.y) < hh) {
          b.y = -100;
          a.hp--;
          if (a.hp <= 0) this.killAlien(a);
          else { a.type = 'bossHit'; G.audio.hit(); G.burst(a.x, a.y, { n: 8, color: C.green, speed: 200, life: 0.3 }); }
          break;
        }
      }
    }
    this.aliens = this.aliens.filter((a) => !a.dead);
    if (s.alive && s.inv <= 0 && this.phase === 'play') {
      for (const b of this.ebullets) if (Math.abs(b.x - s.x) < 8 && Math.abs(b.y - s.y) < 10) { this.killShip(); break; }
      if (s.alive) for (const a of this.aliens) if (a.state === 'dive' && Math.abs(a.x - s.x) < hw + 6 && Math.abs(a.y - s.y) < hh + 6) { this.killShip(); this.killAlien(a); break; }
    }
    this.aliens = this.aliens.filter((a) => !a.dead);
  }

  drawAlien(ctx, a) {
    const frame = Math.floor(a.ph * 2.2) % 2;
    const p = this.p;
    const w = 11 * p, h = 8 * p;
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.rot) ctx.rotate(a.rot);
    if (a.reveal >= 1) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.sprite(a.type, frame), -w / 2, -h / 2, w, h);
    } else {
      // Rock shard turning into pixels.
      const k = a.reveal;
      if (k < 1) {
        ctx.fillStyle = rgb(C.orange, 1 - k);
        ctx.beginPath();
        a.shard.forEach((m, i) => {
          const ang = (i / a.shard.length) * TAU + a.ph * 3;
          const r = p * 4.5 * m;
          i ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        });
        ctx.closePath();
        ctx.fill();
      }
      const pix = spritePixels(a.type, frame);
      pix.forEach((px, i) => {
        const th = ((i * 7919) % 97) / 97;
        if (th > k) return;
        ctx.fillStyle = rgb(mix(C.orange, px.color, k));
        ctx.fillRect(px.x * p - p / 2, px.y * p - p / 2, p + 0.3, p + 0.3);
      });
    }
    ctx.restore();
  }

  draw(ctx) {
    const G = this.G, s = this.ship;
    if (this.srcRocks) for (const r of this.srcRocks) if (r.grow > 0.01) drawRock(ctx, { ...r, r: r.base * r.grow, r0: 0, grow: 1 }, C.orange, Math.min(1, r.grow * 2));
    for (const a of this.aliens) this.drawAlien(ctx, a);
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      ctx.strokeStyle = rgb(C.cyan); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 14); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    for (const b of this.ebullets) {
      ctx.fillStyle = rgb(C.red);
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 2.6, 5, Math.atan2(b.vy, b.vx) + Math.PI / 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    }
    if (s.alive) {
      const blink = s.inv > 0 && s.inv < 90 && Math.floor(s.inv * 10) % 2 === 0;
      if (!blink) drawShip(ctx, s.x, s.y, s.a, this.scale, 1, 10, C.cyan, this.phase === 'intro' ? 0.8 : 0.35 + Math.random() * 0.2);
    }
  }
}
