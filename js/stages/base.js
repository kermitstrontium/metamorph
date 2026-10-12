// Base class for each game form. A stage receives the previous stage so its
// intro can rebuild the outgoing scene's pieces into its own.
export class Stage {
  constructor(G, prev) {
    this.G = G;
    this.prev = prev;
    this.t = 0;
    this.timers = [];
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  tick(dt) {
    this.t += dt;
    if (this.timers.length) {
      const due = [];
      for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
      if (due.length) {
        this.timers = this.timers.filter((tm) => tm.t > 0);
        for (const tm of due) tm.fn();
      }
    }
    this.update(dt);
  }
  update() {}
  draw() {}
  layout() {}
  // Debug: jump to the end of this form.
  forceWin() {}
}
