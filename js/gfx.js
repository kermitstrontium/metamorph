// WebGL post-processing: the game draws into a 2D canvas, which is uploaded each
// frame and run through a procedural nebula, two-level bloom, shockwave
// distortion, chromatic aberration, vignette and grain.

const VS = `
attribute vec2 p; varying vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const DOWN = `
precision mediump float; varying vec2 uv;
uniform sampler2D t; uniform vec2 px; uniform float thr;
void main(){
  vec3 s = texture2D(t, uv + vec2(-px.x, -px.y)).rgb + texture2D(t, uv + vec2(px.x, -px.y)).rgb
         + texture2D(t, uv + vec2(-px.x, px.y)).rgb + texture2D(t, uv + vec2(px.x, px.y)).rgb;
  s *= 0.25;
  float l = max(s.r, max(s.g, s.b));
  float k = smoothstep(thr, thr + 0.35, l);
  gl_FragColor = vec4(s * k, 1.0);
}`;

const BLUR = `
precision mediump float; varying vec2 uv;
uniform sampler2D t; uniform vec2 dir;
void main(){
  vec3 c = texture2D(t, uv).rgb * 0.2270270270;
  c += texture2D(t, uv + dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(t, uv - dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(t, uv + dir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(t, uv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const NEBULA = `
precision mediump float; varying vec2 uv;
uniform float time; uniform float aspect; uniform vec3 c1; uniform vec3 c2; uniform float level;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
void main(){
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.2;
  float t = time * 0.025;
  vec2 q = vec2(fbm(p + t), fbm(p - t + 5.2));
  float n = fbm(p + 2.2 * q + vec2(t * 2.0, -t));
  float m = fbm(p * 1.7 - q + 3.1);
  vec3 col = vec3(0.012, 0.010, 0.035);
  col += c1 * pow(n, 2.6) * 0.55;
  col += c2 * pow(m, 3.4) * 0.45;
  col *= level;
  gl_FragColor = vec4(col, 1.0);
}`;

const COMPOSITE = `
precision highp float; varying vec2 uv;
uniform sampler2D scene, b1, b2, neb;
uniform vec4 shock[6];
uniform float aspect, aberr, time, flashA, bloom, crt, vig;
uniform vec3 flashC;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 p = uv;
  vec2 c0 = uv - 0.5;
  if (crt > 0.5) { float r2 = dot(c0, c0); p = 0.5 + c0 * (1.0 + 0.09 * r2); }
  float ring = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 s = shock[i];
    if (s.w <= 0.0) continue;
    vec2 d = p - s.xy; d.x *= aspect;
    float r = length(d);
    float x = (r - s.z) / 0.05;
    float f = s.w * exp(-x * x) * x;
    vec2 n = r > 0.0001 ? d / r : vec2(0.0);
    n.x /= aspect;
    p -= n * f * 0.018;
    ring += abs(f) * 0.12;
  }
  vec2 dir = p - 0.5;
  float ab = 0.0012 + aberr * 0.006;
  vec4 c = texture2D(scene, p);
  float r = texture2D(scene, p + dir * ab).r;
  float b = texture2D(scene, p - dir * ab).b;
  vec3 col = texture2D(neb, uv).rgb * (1.0 - c.a) + vec3(r, c.g, b);
  col += (texture2D(b1, p).rgb * 1.05 + texture2D(b2, p).rgb * 0.9) * bloom;
  col += vec3(0.5, 0.7, 1.0) * ring;
  float v = smoothstep(1.15, 0.25, length(c0 * vec2(aspect * 0.8, 1.0)));
  col *= mix(1.0, v, vig);
  if (crt > 0.5) {
    col *= 0.86 + 0.14 * sin(gl_FragCoord.y * 1.7);
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) col = vec3(0.0);
  }
  col = mix(col, flashC, flashA);
  col += (hash(uv * 977.0 + fract(time)) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Gfx {
  constructor(glCanvas, sceneCanvas) {
    this.canvas = glCanvas;
    this.scene = sceneCanvas;
    this.ok = false;
    this.shocks = [];
    this.flash = { c: [1, 1, 1], a: 0 };
    this.aberr = 0;
    this.bloom = 1;
    this.crt = false;
    this.neb = { c1: [0.25, 0.15, 0.6], c2: [0.1, 0.4, 0.6], level: 1, t1: [0.25, 0.15, 0.6], t2: [0.1, 0.4, 0.6] };
    try { this.init(); } catch (e) { console.warn('WebGL unavailable', e); this.ok = false; }
  }

  init() {
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return;
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.buf = buf;
    this.progs = {
      down: this.prog(DOWN), blur: this.prog(BLUR), neb: this.prog(NEBULA), comp: this.prog(COMPOSITE),
    };
    this.sceneTex = this.tex();
    this.ok = true;
  }

  prog(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  tex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  fbo(w, h) {
    const gl = this.gl;
    const t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }

  resize(w, h) {
    this.w = w; this.h = h;
    if (!this.ok) return;
    const gl = this.gl;
    for (const k of ['a', 'b', 'c', 'd', 'n']) if (this[k]) { gl.deleteTexture(this[k].t); gl.deleteFramebuffer(this[k].f); }
    const q = (d) => [Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d))];
    this.a = this.fbo(...q(4)); this.b = this.fbo(...q(4));
    this.c = this.fbo(...q(8)); this.d = this.fbo(...q(8));
    this.n = this.fbo(...q(4));
  }

  // x, y in CSS pixels, normalised against viewport size.
  shock(x, y, amp = 1, dur = 0.9, size = 1) {
    this.shocks.push({ x, y, amp, dur, size, t: 0 });
    if (this.shocks.length > 6) this.shocks.shift();
  }

  setNebula(c1, c2) { this.neb.t1 = c1; this.neb.t2 = c2; }

  update(dt) {
    for (const s of this.shocks) s.t += dt;
    this.shocks = this.shocks.filter((s) => s.t < s.dur);
    this.flash.a = Math.max(0, this.flash.a - dt * 2.5);
    this.aberr = Math.max(0, this.aberr - dt * 2.2);
    const k = 1 - Math.exp(-dt * 1.2);
    for (let i = 0; i < 3; i++) {
      this.neb.c1[i] += (this.neb.t1[i] - this.neb.c1[i]) * k;
      this.neb.c2[i] += (this.neb.t2[i] - this.neb.c2[i]) * k;
    }
  }

  pass(prog, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
    gl.useProgram(prog.p);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  render(time, vw, vh) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
    const aspect = this.w / this.h;
    const P = this.progs;

    this.pass(P.neb, this.n, (u) => {
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform3fv(u.c1, this.neb.c1);
      gl.uniform3fv(u.c2, this.neb.c2);
      gl.uniform1f(u.level, this.neb.level);
    });
    // Full res -> 1/4 with 4 bilinear taps (exact 4x4 box), soft threshold.
    this.pass(P.down, this.a, (u) => {
      this.bind(0, this.sceneTex, u.t);
      gl.uniform2f(u.px, 1 / this.w, 1 / this.h);
      gl.uniform1f(u.thr, 0.12);
    });
    const blur = (src, dst, w, h, dx, dy) => this.pass(P.blur, dst, (u) => {
      this.bind(0, src.t, u.t);
      gl.uniform2f(u.dir, dx / w, dy / h);
    });
    blur(this.a, this.b, this.a.w, this.a.h, 1, 0);
    blur(this.b, this.a, this.a.w, this.a.h, 0, 1);
    this.pass(P.down, this.c, (u) => {
      this.bind(0, this.a.t, u.t);
      gl.uniform2f(u.px, 1 / this.a.w, 1 / this.a.h);
      gl.uniform1f(u.thr, 0.0);
    });
    blur(this.c, this.d, this.c.w, this.c.h, 1.5, 0);
    blur(this.d, this.c, this.c.w, this.c.h, 0, 1.5);
    blur(this.c, this.d, this.c.w, this.c.h, 2.5, 0);
    blur(this.d, this.c, this.c.w, this.c.h, 0, 2.5);

    this.pass(P.comp, null, (u) => {
      this.bind(0, this.sceneTex, u.scene);
      this.bind(1, this.a.t, u.b1);
      this.bind(2, this.c.t, u.b2);
      this.bind(3, this.n.t, u.neb);
      const arr = new Float32Array(24);
      this.shocks.forEach((s, i) => {
        const k = s.t / s.dur;
        arr[i * 4] = s.x / vw;
        arr[i * 4 + 1] = 1 - s.y / vh;
        arr[i * 4 + 2] = k * 0.55 * s.size;
        arr[i * 4 + 3] = s.amp * (1 - k) * (1 - k);
      });
      gl.uniform4fv(u.shock, arr);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform1f(u.aberr, this.aberr);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.flashA, this.flash.a);
      gl.uniform3fv(u.flashC, this.flash.c);
      gl.uniform1f(u.bloom, this.bloom);
      gl.uniform1f(u.crt, this.crt ? 1 : 0);
      gl.uniform1f(u.vig, 0.85);
    });
  }
}
