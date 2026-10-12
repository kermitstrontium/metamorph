import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, stagger, neonLine, neonPath, samplePolyline, pick } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function tttWinner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { who: b[l[0]], line: l };
  return null;
}

function minimax(b, who) {
  const w = tttWinner(b);
  if (w) return { s: w.who === 2 ? 10 : -10 };
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return { s: 0 };
  let best = null;
  for (const i of empty) {
    b[i] = who;
    const r = minimax(b, who === 2 ? 1 : 2);
    b[i] = 0;
    const s = r.s * 0.9;
    if (!best || (who === 2 ? s > best.s : s < best.s) || (s === best.s && Math.random() < 0.4)) best = { s, i };
  }
  return best;
}

export class TicTacToe extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'ttt';
    this.board = Array(9).fill(0);
    this.pieces = [];
    this.phase = 'intro';
    this.hover = -1;
    this.winT = 0;
    this.result = null;
    this.mode = prev?.kind === 'title' ? 'gather' : prev?.kind === 'pong' ? 'pong' : 'draw';
    this.introDur = this.mode === 'gather' ? 1.7 : this.mode === 'pong' ? 1.6 : 1.0;
    G.gfx.setNebula([0.08, 0.3, 0.6], [0.35, 0.1, 0.5]);
    this.layout();
    if (this.mode === 'gather') {
      const src = prev.parts;
      const tg = samplePolyline(this.lines, src.length);
      this.flock = src.map((p, i) => ({
        sx: p.x, sy: p.y, tx: tg[i].x, ty: tg[i].y,
        cx: lerp(p.x, tg[i].x, 0.5) + rand(-120, 120), cy: lerp(p.y, tg[i].y, 0.5) + rand(-120, 120),
        d: rand(0, 0.45), color: p.color,
      }));
    } else if (this.mode === 'pong') {
      this.src = prev.exportLines();
    }
    const loopNote = G.loop > 0 ? `LOOP ${G.loop + 1} — EVERYTHING IS FASTER` : 'Three in a row';
    this.after(this.mode === 'gather' ? 0.6 : 0.2, () => G.card('TIC·TAC·TOE', loopNote, 'Tap a square. You are X.', C.cyan));
  }

  layout() {
    const f = this.G.field;
    this.S = Math.min(f.w * 0.86, f.h * 0.6, 440);
    this.cell = this.S / 3;
    this.cx = f.x + f.w / 2;
    this.cy = f.y + f.h * 0.52;
    this.x0 = this.cx - this.S / 2;
    this.y0 = this.cy - this.S / 2;
    const { x0, y0, S, cell } = this;
    this.lines = [
      { x1: x0 + cell, y1: y0, x2: x0 + cell, y2: y0 + S },
      { x1: x0 + 2 * cell, y1: y0, x2: x0 + 2 * cell, y2: y0 + S },
      { x1: x0, y1: y0 + cell, x2: x0 + S, y2: y0 + cell },
      { x1: x0, y1: y0 + 2 * cell, x2: x0 + S, y2: y0 + 2 * cell },
    ];
  }

  center(i) { return { x: this.x0 + ((i % 3) + 0.5) * this.cell, y: this.y0 + (Math.floor(i / 3) + 0.5) * this.cell }; }
  cellAt(x, y) {
    const cx = Math.floor((x - this.x0) / this.cell), cy = Math.floor((y - this.y0) / this.cell);
    if (cx < 0 || cy < 0 || cx > 2 || cy > 2) return -1;
    return cy * 3 + cx;
  }

  onDown(p) { if (this.phase === 'player') this.hover = this.cellAt(p.x, p.y); }
  onMove(p) { if (this.phase === 'player') this.hover = this.cellAt(p.x, p.y); }
  onUp(p) {
    const i = this.cellAt(p.x, p.y);
    this.hover = -1;
    if (this.phase !== 'player' || i < 0 || this.board[i]) return;
    this.place(i, 1);
  }

  place(i, who) {
    const G = this.G;
    this.board[i] = who;
    this.pieces.push({ cell: i, who, t: 0 });
    const c = this.center(i);
    G.audio.place(this.pieces.length);
    G.burst(c.x, c.y, { n: 18, color: who === 1 ? C.cyan : C.magenta, speed: 260, life: 0.45, size: 2 });
    G.particles.ring(c.x, c.y, who === 1 ? C.cyan : C.magenta, this.cell * 0.2, this.cell * 0.6, 0.4, 2);
    G.shake.add(0.12);
    if (who === 1) haptic(0.5);
    const w = tttWinner(this.board);
    const full = this.board.every((v) => v);
    if (w || full) {
      this.phase = 'end';
      this.result = w ? w : { who: 0 };
      this.winT = 0;
      this.after(0.25, () => {
        if (w?.who === 1) {
          G.audio.win();
          G.slowmo(0.4, 0.8);
          const a = this.center(w.line[0]), b = this.center(w.line[2]);
          G.shock((a.x + b.x) / 2, (a.y + b.y) / 2, 1.2, 1, 1.2);
          G.addScore(1000, this.cx, this.y0 - 20, C.yellow, 24);
        } else if (!w) G.addScore(300, this.cx, this.y0 - 20, C.grid, 18);
      });
      this.after(w ? 1.9 : 1.4, () => {
        if (w?.who === 2) G.die(() => this.resetRound());
        else G.advance();
      });
      return;
    }
    if (who === 1) {
      this.phase = 'ai';
      this.after(rand(0.45, 0.8), () => this.aiMove());
    } else this.phase = 'player';
  }

  aiMove() {
    const b = this.board;
    const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const mistake = Math.max(0.06, 0.42 - this.G.loop * 0.14);
    let m;
    if (empty.length >= 8 && Math.random() < 0.5) m = pick(empty);
    else if (Math.random() < mistake) m = pick(empty);
    else m = minimax(b.slice(), 2).i;
    this.place(m, 2);
  }

  resetRound() {
    const G = this.G;
    for (const p of this.pieces) {
      const c = this.center(p.cell);
      G.burst(c.x, c.y, { n: 30, color: p.who === 1 ? C.cyan : C.magenta, speed: 380, life: 0.7 });
    }
    G.audio.boom(0.5);
    this.board.fill(0);
    this.pieces = [];
    this.result = null;
    this.phase = 'player';
  }

  forceWin() {
    if (this.phase !== 'player') return;
    this.board = [1, 2, 0, 2, 1, 0, 0, 0, 0];
    this.pieces = [{ cell: 0, who: 1, t: 1 }, { cell: 1, who: 2, t: 1 }, { cell: 3, who: 2, t: 1 }, { cell: 4, who: 1, t: 1 }];
    this.place(8, 1);
  }

  hudGoal() {
    return this.phase === 'player' ? 'YOUR MOVE' : this.phase === 'ai' ? 'THINKING' + '.'.repeat(1 + (Math.floor(this.t * 4) % 3)) : '';
  }

  update(dt) {
    if (this.phase === 'intro' && this.t >= this.introDur) this.phase = 'player';
    for (const p of this.pieces) p.t = Math.min(1, p.t + dt * 4);
    if (this.phase === 'end') this.winT += dt;
  }

  // Current line geometry (also read by Connect 4 for its morph).
  currentLines() {
    const t = this.t;
    if (this.mode === 'draw' && t < this.introDur) {
      return this.lines.map((l, i) => {
        const k = ease.outCubic(stagger(t / this.introDur, i, 4, 0.4));
        const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2;
        return { x1: lerp(mx, l.x1, k), y1: lerp(my, l.y1, k), x2: lerp(mx, l.x2, k), y2: lerp(my, l.y2, k), a: k, color: C.grid };
      });
    }
    if (this.mode === 'pong' && t < this.introDur) {
      const src = [this.src[0], this.src[1], this.src[2], this.src[2]];
      return this.lines.map((l, i) => {
        const s = src[i];
        const k = ease.inOutCubic(stagger(t / this.introDur, i, 4, 0.25));
        const sc = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2, len: Math.hypot(s.x2 - s.x1, s.y2 - s.y1), a: Math.atan2(s.y2 - s.y1, s.x2 - s.x1) };
        const tc = { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2, len: this.S, a: Math.atan2(l.y2 - l.y1, l.x2 - l.x1) };
        const cx = lerp(sc.x, tc.x, k), cy = lerp(sc.y, tc.y, k), len = lerp(sc.len, tc.len, k);
        const a = lerp(sc.a, tc.a, k);
        return { x1: cx - Math.cos(a) * len / 2, y1: cy - Math.sin(a) * len / 2, x2: cx + Math.cos(a) * len / 2, y2: cy + Math.sin(a) * len / 2, a: 1, color: mix(s.color, C.grid, k) };
      });
    }
    const a = this.mode === 'gather' ? ease.outCubic(clamp((t - 1.1) / 0.5, 0, 1)) : 1;
    return this.lines.map((l) => ({ ...l, a, color: C.grid }));
  }

  draw(ctx) {
    const G = this.G, t = this.t;
    // Particle flock from the title screen.
    if (this.flock && t < this.introDur + 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fade = 1 - clamp((t - 1.1) / 0.5, 0, 1);
      for (const p of this.flock) {
        const k = ease.inOutCubic(clamp((t - p.d) / 1.0, 0, 1));
        const u = 1 - k;
        const x = u * u * p.sx + 2 * u * k * p.cx + k * k * p.tx;
        const y = u * u * p.sy + 2 * u * k * p.cy + k * k * p.ty;
        ctx.fillStyle = rgb(mix(p.color, C.grid, k), fade);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      ctx.restore();
    }
    if (this.mode === 'pong' && t < 0.8 && this.prev?.ball) {
      const b = this.prev.ball, k = ease.inCubic(clamp(t / 0.8, 0, 1));
      const x = lerp(b.x, this.cx, k), y = lerp(b.y, this.cy, k);
      ctx.fillStyle = rgb(C.white, 1 - k);
      ctx.beginPath(); ctx.arc(x, y, 7 * (1 - k * 0.7), 0, TAU); ctx.fill();
    }

    // Hover highlight
    if (this.hover >= 0 && !this.board[this.hover] && this.phase === 'player') {
      const c = this.center(this.hover), s = this.cell * 0.82;
      ctx.fillStyle = rgb(C.cyan, 0.08);
      ctx.beginPath();
      ctx.roundRect(c.x - s / 2, c.y - s / 2, s, s, 12);
      ctx.fill();
    }

    const breathe = 0.85 + 0.15 * Math.sin(t * 2);
    for (const l of this.currentLines()) {
      if (l.a <= 0) continue;
      neonLine(ctx, l.x1, l.y1, l.x2, l.y2, l.color, 4, l.a * breathe);
    }

    const win = this.result?.line;
    for (const p of this.pieces) {
      const c = this.center(p.cell);
      const onWin = win && win.includes(p.cell);
      const pulse = onWin ? 1 + 0.12 * Math.sin(this.winT * 14) : 1;
      this.drawPiece(ctx, c.x, c.y, p.who, p.t, pulse, onWin ? 1.25 : 1);
    }

    if (win && this.winT > 0) {
      const a = this.center(win[0]), b = this.center(win[2]);
      const k = ease.outCubic(clamp(this.winT / 0.35, 0, 1));
      const ex = (b.x - a.x) * 0.22, ey = (b.y - a.y) * 0.22;
      const color = this.result.who === 1 ? C.yellow : C.red;
      neonLine(ctx, a.x - ex, a.y - ey, lerp(a.x - ex, b.x + ex, k), lerp(a.y - ey, b.y + ey, k), color, 7, 1);
    } else if (this.result && this.result.who === 0 && this.winT > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `900 28px ${FONT}`;
      ctx.fillStyle = rgb(C.grid, clamp(this.winT * 3, 0, 1));
      ctx.fillText('DRAW', this.cx, this.y0 + this.S + 44);
      ctx.restore();
    }
  }

  drawPiece(ctx, x, y, who, t, scale = 1, glow = 1) {
    const r = this.cell * 0.27 * scale;
    const w = this.cell * 0.085;
    if (who === 1) {
      const k1 = ease.outCubic(clamp(t * 2, 0, 1)), k2 = ease.outCubic(clamp(t * 2 - 1, 0, 1));
      neonPath(ctx, (c) => {
        c.moveTo(x - r, y - r); c.lineTo(lerp(x - r, x + r, k1), lerp(y - r, y + r, k1));
        if (k2 > 0) { c.moveTo(x + r, y - r); c.lineTo(lerp(x + r, x - r, k2), lerp(y - r, y + r, k2)); }
      }, glow > 1 ? mix(C.cyan, C.white, 0.3) : C.cyan, w);
    } else {
      const k = ease.outCubic(t);
      neonPath(ctx, (c) => c.arc(x, y, r * 1.05, -Math.PI / 2, -Math.PI / 2 + TAU * k), glow > 1 ? mix(C.magenta, C.white, 0.3) : C.magenta, w);
    }
  }
}
