// Unified pointer + keyboard input. Stages receive down/move/up/swipe callbacks
// and can poll `pointers` / `keys` for continuous controls.

export class Input {
  constructor(el, G) {
    this.G = G;
    this.el = el;
    this.pointers = new Map();
    this.keys = new Set();
    this.mouse = null;
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opt);
    window.addEventListener('pointermove', (e) => this.move(e), opt);
    window.addEventListener('pointerup', (e) => this.up(e), opt);
    window.addEventListener('pointercancel', (e) => this.up(e, true), opt);
    // Kill iOS gestures: pinch zoom, double-tap zoom, callouts, rubber-banding.
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), opt);
    document.addEventListener('touchmove', (e) => e.preventDefault(), opt);
    el.addEventListener('touchstart', (e) => e.preventDefault(), opt);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      G.audio.unlock();
      G.onKey?.(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
  }

  local(e) { return { x: e.clientX, y: e.clientY }; }

  down(e) {
    e.preventDefault();
    this.G.audio.unlock();
    const { x, y } = this.local(e);
    const p = { id: e.pointerId, x, y, x0: x, y0: y, sx: x, sy: y, px: x, py: y, t0: performance.now(), type: e.pointerType, swiped: false, moved: 0 };
    this.pointers.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch {}
    this.G.dispatch('onDown', p);
  }

  move(e) {
    const { x, y } = this.local(e);
    if (e.pointerType === 'mouse') this.mouse = { x, y };
    const p = this.pointers.get(e.pointerId);
    if (!p) { this.G.dispatch('onHover', { x, y }); return; }
    e.preventDefault();
    p.px = p.x; p.py = p.y;
    p.x = x; p.y = y;
    p.moved += Math.hypot(x - p.px, y - p.py);
    this.G.dispatch('onMove', p, x - p.px, y - p.py);
    // Continuous swipe: emit a direction each time the finger travels far enough,
    // then re-anchor so you can snake through turns without lifting.
    const dx = x - p.sx, dy = y - p.sy;
    const th = 22;
    if (Math.abs(dx) > th || Math.abs(dy) > th) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U';
      if (dir !== p.lastSwipe) this.G.dispatch('onSwipe', dir, p);
      p.lastSwipe = dir;
      p.swiped = true;
      p.sx = x; p.sy = y;
    }
  }

  up(e, cancel) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this.G.audio.unlock();
    p.tap = !cancel && p.moved < 14 && performance.now() - p.t0 < 450;
    this.G.dispatch('onUp', p);
  }

  // Keyboard vector from WASD / arrows.
  axis() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y += 1;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l, on: x !== 0 || y !== 0 };
  }
}

// Haptics: Vibration API where it exists; on iOS 18+ Safari, toggling a
// <input switch> fires the system haptic. Best effort; silent elsewhere.
let hapticEl = null;
let lastHaptic = 0;
export function haptic(strength = 1) {
  const now = performance.now();
  if (now - lastHaptic < 40) return;
  lastHaptic = now;
  if (navigator.vibrate) { navigator.vibrate(Math.round(8 + strength * 14)); return; }
  try {
    if (!hapticEl) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      label.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
      document.body.appendChild(label);
      hapticEl = label;
    }
    hapticEl.click();
  } catch {}
}
