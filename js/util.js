// Shared math, easing and colour helpers.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const sign = (v) => (v < 0 ? -1 : 1);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
export const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
// Local 0..1 progress of a staggered sub-animation.
export const stagger = (t, i, n, spread = 0.5) => {
  const span = 1 - spread;
  const start = n <= 1 ? 0 : (i / (n - 1)) * spread;
  return clamp((t - start) / span, 0, 1);
};

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t <= 0 || t >= 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

// Colours are [r,g,b] 0..255 arrays so they can be blended for morphs.
export const C = {
  cyan: [62, 242, 255],
  magenta: [255, 59, 212],
  yellow: [255, 216, 74],
  green: [77, 255, 154],
  orange: [255, 138, 61],
  red: [255, 68, 102],
  blue: [91, 123, 255],
  violet: [166, 107, 255],
  white: [255, 255, 255],
  grid: [140, 170, 255],
  dim: [70, 90, 160],
};
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const bright = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

// Draw a glowing stroke: coloured body plus a hot white core. Bloom does the rest.
export function neonPath(ctx, buildPath, color, width, alpha = 1, core = 0.38) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = width;
  ctx.beginPath();
  buildPath(ctx);
  ctx.stroke();
  if (core > 0) {
    ctx.strokeStyle = rgb(mix(color, C.white, 0.75));
    ctx.lineWidth = Math.max(0.6, width * core);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
export function neonLine(ctx, x1, y1, x2, y2, color, width, alpha = 1, core) {
  neonPath(ctx, (c) => { c.moveTo(x1, y1); c.lineTo(x2, y2); }, color, width, alpha, core);
}
export function glowDisc(ctx, x, y, r, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgb(mix(color, C.white, 0.7));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Catmull-Rom path sampled by arc length — used for dive paths and morph flights.
export class Path {
  constructor(points, samplesPerSeg = 16) {
    this.pts = [];
    const P = points;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let s = 0; s < samplesPerSeg; s++) {
        const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        this.pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    this.pts.push(P[P.length - 1].slice());
    this.len = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.len.push(this.len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.total = this.len[this.len.length - 1];
  }
  at(d) {
    d = clamp(d, 0, this.total);
    let lo = 0, hi = this.len.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (this.len[m] < d) lo = m; else hi = m;
    }
    const a = this.pts[lo], b = this.pts[hi];
    const seg = this.len[hi] - this.len[lo] || 1;
    const t = (d - this.len[lo]) / seg;
    return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
}

// Sample N evenly spaced points along a set of line segments.
export function samplePolyline(lines, n) {
  const lens = lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * total, k = 0;
    while (k < lines.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
    const l = lines[k], t = lens[k] ? d / lens[k] : 0;
    out.push({ x: lerp(l.x1, l.x2, t), y: lerp(l.y1, l.y2, t), line: k });
  }
  return out;
}
