import { Stage } from './base.js';
import { C, rgb, mix, rand, TAU, clamp, lerp, ease, stagger, neonLine, pick } from '../util.js';
import { FONT } from '../hud.js';
import { haptic } from '../input.js';

const COLS = 7, ROWS = 6;

// ---- AI: negamax with alpha-beta over a flat board[c*ROWS + r], r=0 bottom ----
function windows() {
  const out = [];
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) for (const [dc, dr] of dirs) {
    const cells = [];
    for (let k = 0; k < 4; k++) {
      const cc = c + dc * k, rr = r + dr * k;
      if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) break;
      cells.push(cc * ROWS + rr);
    }
    if (cells.length === 4) out.push(cells);
  }
  return out;
}
const WINDOWS = windows();

export function c4Winner(b) {
  for (const w of WINDOWS) {
    const v = b[w[0]];
    if (v && v === b[w[1]] && v === b[w[2]] && v === b[w[3]]) return { who: v, cells: w.map((i) => ({ c: Math.floor(i / ROWS), r: i % ROWS })) };
  }
  return null;
}

function evaluate(b, me) {
  const op = 3 - me;
  let s = 0;
  for (const w of WINDOWS) {
    let m = 0, o = 0;
    for (const i of w) { if (b[i] === me) m++; else if (b[i] === op) o++; }
    if (m && o) continue;
    if (m === 3) s += 40; else if (m === 2) s += 4;
    if (o === 3) s -= 55; else if (o === 2) s -= 4;
  }
  for (let r = 0; r < ROWS; r++) { if (b[3 * ROWS + r] === me) s += 5; else if (b[3 * ROWS + r] === op) s -= 5; }
  return s;
}

function heightOf(b, c) { let r = 0; while (r < ROWS && b[c * ROWS + r]) r++; return r; }
const ORDER = [3, 2, 4, 1, 5, 0, 6];

function negamax(b, depth, alpha, beta, me) {
  const w = c4Winner(b);
  if (w) return w.who === me ? 100000 + depth : -100000 - depth;
  if (depth === 0) return evaluate(b, me);
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    const r = heightOf(b, c);
    if (r >= ROWS) continue;
    any = true;
    b[c * ROWS + r] = me;
    const v = -negamax(b, depth - 1, -beta, -alpha, 3 - me);
    b[c * ROWS + r] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}

function bestMove(b, depth) {
  let best = -Infinity, moves = [];
  for (const c of ORDER) {
    const r = heightOf(b, c);
    if (r >= ROWS) continue;
    b[c * ROWS + r] = 2;
    const v = -negamax(b, depth - 1, -Infinity, Infinity, 1) + rand(-1.5, 1.5);
    b[c * ROWS + r] = 0;
    if (v > best) { best = v; moves = [c]; }
  }
  return moves[0];
}

export class Connect4 extends Stage {
  constructor(G, prev) {
    super(G, prev);
    this.kind = 'c4';
    this.board = new Array(COLS * ROWS).fill(0);
    this.discs = [];
    this.phase = 'intro';
    this.hoverCol = -1;
    this.result = null;
    this.winT = 0;
    this.morphSrc = prev?.kind === 'ttt' ? prev : null;
    G.gfx.setNebula([0.45, 0.08, 0.45], [0.1, 0.2, 0.7]);
    this.layout();

    if (this.morphSrc) {
      const src = prev.currentLines();
      // Each C4 grid line grows out of the nearest TTT line.
      this.lineSrc = this.targetLines().map((l, i) => (l.v ? src[l.i <= 3 ? 0 : 1] : src[l.i <= 3 ? 2 : 3]));
      const heights = new Array(COLS).fill(0);
      const ps = prev.pieces.slice().sort((a, b) => Math.floor(b.cell / 3) - Math.floor(a.cell / 3));
      ps.forEach((p, k) => {
        const c = 2 + (p.cell % 3);
        const r = heights[c]++;
        const pc = prev.center(p.cell);
        this.board[c * ROWS + r] = p.who;
        this.discs.push({ c, r, who: p.who, x: pc.x, y: pc.y, sx: pc.x, sy: pc.y, vy: 0, morph: 0, state: 'morph', delay: 0.15 + k * 0.07, landed: false });
      });
      this.introDur = 2.1;
    } else this.introDur = 0.9;
    this.after(0.5, () => G.card('CONNECT FOUR', 'The grid grows', 'Drag to aim · release to drop', C.magenta));
  }

  layout() {
    const f = this.G.field;
    this.cs = Math.min((f.w * 0.97) / COLS, (f.h * 0.66) / ROWS, 64);
    this.bw = this.cs * COLS;
    this.bh = this.cs * ROWS;
    this.bx = f.x + (f.w - this.bw) / 2;
    this.by = f.y + f.h * 0.53 - this.bh / 2 + this.cs * 0.3;
    for (const d of this.discs) if (d.state === 'rest') { d.x = this.colX(d.c); d.y = this.rowY(d.r); }
  }
  colX(c) { return this.bx + (c + 0.5) * this.cs; }
  rowY(r) { return this.by + this.bh - (r + 0.5) * this.cs; }
  colAt(x) { return clamp(Math.floor((x - this.bx) / this.cs), 0, COLS - 1); }

  targetLines() {
    const out = [];
    for (let i = 0; i <= COLS; i++) out.push({ v: true, i, x1: this.bx + i * this.cs, y1: this.by, x2: this.bx + i * this.cs, y2: this.by + this.bh });
    for (let j = 0; j <= ROWS; j++) out.push({ v: false, i: j, x1: this.bx, y1: this.by + j * this.cs, x2: this.bx + this.bw, y2: this.by + j * this.cs });
    return out;
  }

  currentLines() {
    const tl = this.targetLines();
    const t = this.t;
    if (t >= this.introDur) return tl.map((l) => ({ ...l, a: 1 }));
    if (!this.morphSrc) {
      return tl.map((l, i) => {
        const k = ease.outCubic(stagger(t / this.introDur, i, tl.length, 0.5));
        const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2;
        return { ...l, x1: lerp(mx, l.x1, k), y1: lerp(my, l.y1, k), x2: lerp(mx, l.x2, k), y2: lerp(my, l.y2, k), a: k };
      });
    }
    return tl.map((l, i) => {
      const s = this.lineSrc[i];
      const order = l.v ? Math.abs(l.i - 3.5) : Math.abs(l.i - 3) + 0.5;
      const k = ease.outBack(clamp((t - 0.35 - order * 0.1) / 0.75, 0, 1));
      return { ...l, x1: lerp(s.x1, l.x1, k), y1: lerp(s.y1, l.y1, k), x2: lerp(s.x2, l.x2, k), y2: lerp(s.y2, l.y2, k), a: 1 };
    });
  }

  myTurn() { return this.phase === 'player'; }

  onDown(p) { if (this.myTurn()) this.hoverCol = this.colAt(p.x); }
  onMove(p) { if (this.myTurn()) this.hoverCol = this.colAt(p.x); }
  onHover(p) { if (this.myTurn() && p.y > this.by - this.cs * 2) this.hoverCol = this.colAt(p.x); }
  onUp(p) {
    if (!this.myTurn()) return;
    const c = this.colAt(p.x);
    this.hoverCol = -1;
    if (heightOf(this.board, c) >= ROWS) { this.G.audio.hit(); return; }
    this.drop(c, 1);
  }

  drop(c, who) {
    const r = heightOf(this.board, c);
    this.board[c * ROWS + r] = who;
    this.phase = 'falling';
    this.G.audio.tap();
    if (who === 1) haptic(0.4);
    this.discs.push({ c, r, who, x: this.colX(c), y: this.by - this.cs * 0.75, vy: 0, morph: 1, state: 'fall', landed: false, last: true });
  }

  onLanded(d) {
    const G = this.G;
    G.audio.drop();
    G.shake.add(0.16);
    G.burst(d.x, d.y + this.cs * 0.4, { n: 14, color: d.who === 1 ? C.cyan : C.magenta, speed: 240, angle: -Math.PI / 2, spread: Math.PI, life: 0.4 });
    if (!d.last) return;
    d.last = false;
    if (d.who === 1) haptic(0.6);
    const w = c4Winner(this.board);
    const full = this.board.every((v) => v);
    if (w || full) {
      this.phase = 'end';
      this.result = w ?? { who: 0 };
      this.winT = 0;
      if (w?.who === 1) {
        G.audio.win();
        G.slowmo(0.35, 1);
        const m = w.cells[1];
        G.shock(this.colX(m.c), this.rowY(m.r), 1.4, 1.1, 1.3);
        G.flash(C.cyan, 0.15);
        G.addScore(1500, this.colX(m.c), this.by - 20, C.yellow, 24);
        this.after(2.0, () => G.advance());
      } else if (w) {
        this.after(1.6, () => G.die(() => this.clearBoard()));
      } else {
        G.addScore(500, this.colX(3), this.by - 20, C.grid);
        this.after(1.4, () => G.advance());
      }
      return;
    }
    if (d.who === 1) {
      this.phase = 'ai';
      this.after(rand(0.35, 0.6), () => this.aiMove());
    } else this.phase = 'player';
  }

  aiMove() {
    const loop = this.G.loop;
    const valid = ORDER.filter((c) => heightOf(this.board, c) < ROWS);
    const mistake = Math.max(0.03, 0.2 - loop * 0.07);
    const c = Math.random() < mistake ? pick(valid) : bestMove(this.board.slice(), 4 + Math.min(loop, 2));
    this.drop(c, 2);
  }

  clearBoard() {
    // The floor opens: every disc tumbles out of the bottom.
    for (const d of this.discs) { d.state = 'out'; d.vy = rand(-200, 0); d.vx = rand(-80, 80); }
    this.board.fill(0);
    this.result = null;
    this.G.audio.boom(0.4);
    this.after(0.9, () => { this.discs = []; this.phase = 'player'; });
  }

  forceWin() {
    if (this.phase !== 'player') return;
    this.board.fill(0);
    this.discs = [];
    for (let k = 0; k < 3; k++) {
      this.board[(k + 1) * ROWS] = 1;
      this.discs.push({ c: k + 1, r: 0, who: 1, x: this.colX(k + 1), y: this.rowY(0), vy: 0, morph: 1, state: 'rest', landed: true });
    }
    this.drop(4, 1);
  }

  hudGoal() {
    return this.phase === 'player' ? 'YOUR MOVE' : this.phase === 'ai' ? 'THINKING' + '.'.repeat(1 + (Math.floor(this.t * 4) % 3)) : '';
  }

  update(dt) {
    if (this.phase === 'intro' && this.t >= this.introDur) {
      const n1 = this.board.filter((v) => v === 1).length, n2 = this.board.filter((v) => v === 2).length;
      if (n1 > n2) { this.phase = 'ai'; this.after(0.4, () => this.aiMove()); } else this.phase = 'player';
    }
    if (this.phase === 'end') this.winT += dt;
    const g = 3400;
    for (const d of this.discs) {
      if (d.state === 'morph') {
        const lt = this.t - d.delay;
        d.morph = ease.inOutCubic(clamp(lt / 0.45, 0, 1));
        const k = ease.inOutCubic(clamp((lt - 0.3) / 0.45, 0, 1));
        d.x = lerp(d.sx, this.colX(d.c), k);
        d.y = d.sy - Math.sin(k * Math.PI) * this.cs * 0.4;
        if (lt > 0.8) d.state = 'fall';
      } else if (d.state === 'fall') {
        d.vy += g * dt;
        d.y += d.vy * dt;
        const ty = this.rowY(d.r);
        if (d.y >= ty) {
          d.y = ty;
          if (!d.landed) { d.landed = true; this.onLanded(d); }
          if (d.vy > 260) d.vy = -d.vy * 0.28; else { d.vy = 0; d.state = 'rest'; }
        }
      } else if (d.state === 'out') {
        d.vy += g * 0.6 * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
      }
    }
  }

  draw(ctx) {
    const G = this.G, cs = this.cs;
    const lines = this.currentLines();
    const settled = clamp((this.t - this.introDur + 0.4) / 0.6, 0, 1);
    // Faint hole rings once the lattice is in place.
    if (settled > 0) {
      ctx.strokeStyle = rgb(C.grid, 0.13 * settled);
      ctx.lineWidth = 1.5;
      for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
        ctx.beginPath(); ctx.arc(this.colX(c), this.rowY(r), cs * 0.38, 0, TAU); ctx.stroke();
      }
    }
    for (const l of lines) neonLine(ctx, l.x1, l.y1, l.x2, l.y2, C.grid, (l.i === 0 || (l.v ? l.i === COLS : l.i === ROWS) ? 3.5 : 2.2), 0.75 * l.a);

    // Column highlight + ghost disc
    if (this.myTurn() && this.hoverCol >= 0) {
      const x = this.colX(this.hoverCol);
      ctx.fillStyle = rgb(C.cyan, 0.06);
      ctx.fillRect(x - cs / 2, this.by, cs, this.bh);
      this.drawDisc(ctx, x, this.by - cs * 0.75 + Math.sin(this.t * 6) * 3, 1, 1, 0.55);
    }

    const tw = this.morphSrc?.result?.line;
    if (tw && this.t < 0.6) {
      const a = this.morphSrc.center(tw[0]), b = this.morphSrc.center(tw[2]);
      const ex = (b.x - a.x) * 0.22, ey = (b.y - a.y) * 0.22;
      neonLine(ctx, a.x - ex, a.y - ey, b.x + ex, b.y + ey, C.yellow, 7 * (1 - this.t / 0.6), 1 - this.t / 0.6);
    }
    const win = this.result?.cells;
    for (const d of this.discs) {
      const onWin = win && win.some((w) => w.c === d.c && w.r === d.r);
      const pulse = onWin ? 1 + 0.1 * Math.sin(this.winT * 14) : 1;
      if (d.state === 'morph' && d.morph < 1) this.drawMorph(ctx, d);
      else this.drawDisc(ctx, d.x, d.y, d.who, pulse, 1, onWin);
    }
    if (win && this.winT > 0) {
      const a = win[0], b = win[3];
      const k = ease.outCubic(clamp(this.winT / 0.4, 0, 1));
      const ax = this.colX(a.c), ay = this.rowY(a.r), bx = this.colX(b.c), by = this.rowY(b.r);
      neonLine(ctx, ax, ay, lerp(ax, bx, k), lerp(ay, by, k), this.result.who === 1 ? C.yellow : C.red, 6, 0.9);
    } else if (this.result?.who === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `900 26px ${FONT}`;
      ctx.fillStyle = rgb(C.grid, clamp(this.winT * 3, 0, 1));
      ctx.fillText('DRAW', this.bx + this.bw / 2, this.by - cs);
      ctx.restore();
    }
  }

  drawDisc(ctx, x, y, who, scale = 1, alpha = 1, hot = false) {
    const r = this.cs * 0.38 * scale;
    const col = who === 1 ? C.cyan : C.magenta;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, rgb(mix(col, C.white, hot ? 0.85 : 0.55)));
    g.addColorStop(0.6, rgb(col));
    g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.45)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgb(mix(col, C.white, 0.6), 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // X/O shapes melting into discs.
  drawMorph(ctx, d) {
    const m = d.morph, x = d.x, y = d.y;
    const col = d.who === 1 ? C.cyan : C.magenta;
    const ttt = this.morphSrc;
    const r0 = ttt.cell * 0.27;
    const r = lerp(r0, this.cs * 0.38, m);
    if (d.who === 1) {
      const arm = r0 * (1 - m);
      ctx.strokeStyle = rgb(col);
      ctx.lineWidth = ttt.cell * 0.085;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - arm, y - arm); ctx.lineTo(x + arm, y + arm);
      ctx.moveTo(x + arm, y - arm); ctx.lineTo(x - arm, y + arm);
      ctx.stroke();
      ctx.fillStyle = rgb(col, m);
      ctx.beginPath(); ctx.arc(x, y, r * m, 0, TAU); ctx.fill();
    } else {
      const lw = lerp(ttt.cell * 0.085, r * 2, m * m);
      ctx.strokeStyle = rgb(col);
      ctx.lineWidth = Math.min(lw, r * 2);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r * 1.05 - lw / 2 * m), 0, TAU); ctx.stroke();
    }
  }
}
