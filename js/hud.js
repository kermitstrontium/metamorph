import { C, rgb, mix, TAU, clamp, ease, lerp } from './util.js';

const FONT = 'ui-rounded, "SF Pro Rounded", "SF Pro Display", system-ui, -apple-system, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
export const NAMES = ['TIC·TAC·TOE', 'CONNECT FOUR', 'SNAKE', 'ASTEROIDS', 'GALAGA', 'BREAKOUT', 'PONG'];
export const STAGE_COLORS = [C.cyan, C.magenta, C.green, C.orange, C.yellow, C.violet, C.cyan];

export class Hud {
  constructor(G) {
    this.G = G;
    this.card = null;
    this.shown = 0;
    this.lifePulse = 0;
  }

  showCard(title, sub = '', hint = '', color = C.cyan, dur = 2.6) {
    this.card = { title, sub, hint, color, t: 0, dur };
  }

  update(dt) {
    const G = this.G;
    this.shown += (G.score - this.shown) * (1 - Math.exp(-dt * 8));
    if (Math.abs(G.score - this.shown) < 1) this.shown = G.score;
    if (this.card) { this.card.t += dt; if (this.card.t > this.card.dur) this.card = null; }
    this.lifePulse = Math.max(0, this.lifePulse - dt);
  }

  draw(ctx) {
    const G = this.G;
    if (G.state === 'play' || G.state === 'over') this.drawBar(ctx);
    if (this.card) this.drawCard(ctx);
  }

  drawBar(ctx) {
    const G = this.G;
    const top = G.safe.t + 10;
    const L = G.safe.l + 16, R = G.W - G.safe.r - 16;
    ctx.save();
    ctx.textBaseline = 'top';
    // Score
    ctx.textAlign = 'left';
    ctx.font = `700 9px ${FONT}`;
    ctx.fillStyle = rgb(C.dim, 1);
    ctx.fillText('SCORE', L, top);
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = rgb(mix(C.cyan, C.white, 0.6));
    ctx.fillText(String(Math.round(this.shown)).padStart(6, '0'), L, top + 11);
    // Lives (right of centre, left of pause button)
    const lx = R - 46;
    for (let i = 0; i < Math.max(G.lives, 0); i++) {
      const x = lx - i * 15, y = top + 20;
      const pulse = i === G.lives - 1 && this.lifePulse > 0 ? 1 + this.lifePulse : 1;
      ctx.fillStyle = rgb(C.magenta);
      ctx.beginPath();
      ctx.moveTo(x, y - 6 * pulse); ctx.lineTo(x + 5 * pulse, y); ctx.lineTo(x, y + 6 * pulse); ctx.lineTo(x - 5 * pulse, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgb(mix(C.magenta, C.white, 0.7));
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    // Stage pips
    const cx = G.W / 2, n = 7, gap = 13;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * gap, y = top + 8;
      const cur = i === G.stageIndex;
      const done = i < G.stageIndex;
      const col = STAGE_COLORS[i];
      ctx.beginPath();
      ctx.arc(x, y, cur ? 4 : 2.6, 0, TAU);
      if (cur || done) { ctx.fillStyle = rgb(col, cur ? 1 : 0.55); ctx.fill(); }
      else { ctx.strokeStyle = rgb(C.dim, 0.8); ctx.lineWidth = 1; ctx.stroke(); }
      if (cur) {
        ctx.strokeStyle = rgb(col, 0.5 + 0.3 * Math.sin(G.time * 5));
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      }
    }
    ctx.textAlign = 'center';
    ctx.font = `700 9px ${FONT}`;
    const goal = G.stage?.hudGoal?.() ?? '';
    const label = (G.stageIndex >= 0 ? NAMES[G.stageIndex] : '') + (G.loop > 0 ? `  ·  LOOP ${G.loop + 1}` : '');
    ctx.fillStyle = rgb(C.dim, 1);
    ctx.fillText(label, cx, top + 20);
    if (goal) {
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = rgb(STAGE_COLORS[Math.max(0, G.stageIndex)]);
      ctx.fillText(goal, cx, top + 32);
    }
    ctx.restore();
  }

  drawCard(ctx) {
    const G = this.G, c = this.card;
    const t = c.t, inT = clamp(t / 0.45, 0, 1), out = clamp((c.dur - t) / 0.5, 0, 1);
    const a = Math.min(ease.outCubic(inT), out);
    const cx = G.W / 2, cy = G.safe.t + 52 + Math.min(G.H * 0.13, 110);
    const track = lerp(18, 2, ease.outExpo(inT)) + (1 - out) * 10;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Fit the title to the screen width (letter spacing included).
    ctx.font = `900 50px ${FONT}`;
    try { ctx.letterSpacing = '2px'; } catch {}
    const fit = (G.W * 0.88) / ctx.measureText(c.title).width;
    const size = Math.min(54, 50 * fit);
    ctx.font = `900 ${size}px ${FONT}`;
    try { ctx.letterSpacing = `${track}px`; } catch {}
    const glitch = inT < 1 || Math.random() < 0.04 ? (1 - inT) * 14 + 2 : 1.4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgb(C.magenta, a * 0.7);
    ctx.fillText(c.title, cx - glitch, cy);
    ctx.fillStyle = rgb(C.cyan, a * 0.7);
    ctx.fillText(c.title, cx + glitch, cy);
    ctx.fillStyle = rgb(mix(c.color, C.white, 0.6), a);
    ctx.fillText(c.title, cx, cy);
    // Slice glitch: a random horizontal band shifted sideways.
    if (inT < 1 || Math.random() < 0.06) {
      const by = cy - size * 0.5 + Math.random() * size;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, by, G.W, size * 0.18); ctx.clip();
      ctx.fillStyle = rgb(c.color, a);
      ctx.fillText(c.title, cx + (Math.random() - 0.5) * 30, cy);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    try { ctx.letterSpacing = '3px'; } catch {}
    if (c.sub) {
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = rgb(c.color, a * 0.95);
      ctx.fillText(c.sub.toUpperCase(), cx, cy + size * 0.75);
    }
    if (c.hint) {
      try { ctx.letterSpacing = '0.5px'; } catch {}
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = rgb(C.white, a * 0.7);
      ctx.fillText(c.hint, cx, cy + size * 0.75 + 22);
    }
    ctx.restore();
  }
}

export { FONT, MONO };
