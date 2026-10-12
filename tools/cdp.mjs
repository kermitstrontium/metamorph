// Minimal Chrome DevTools Protocol driver for headless play-testing (no deps).
// Usage: import { open } from './cdp.mjs'; const p = await open(url); await p.shot('x.png');
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;

export async function open(url, { width = 390, height = 844, dpr = 2 } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (msg.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  };
  const send = (method, params = {}, ms = 15000) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); r({ timeout: method }); }, ms); pending.set(i, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1500));
  const api = {
    logs,
    send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.timeout) return 'TIMEOUT';
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
      return r.result?.result?.value;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      if (r.timeout) { console.log('shot timeout'); return; }
      mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });
      writeFileSync(new URL('./shots/' + file, import.meta.url), Buffer.from(r.result.data, 'base64'));
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    async touch(type, pts) {
      await send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    },
    async tap(x, y) {
      await api.touch('touchStart', [[x, y]]);
      await api.wait(40);
      await api.touch('touchEnd', []);
      await api.wait(60);
    },
    async swipe(x1, y1, x2, y2, steps = 6) {
      await api.touch('touchStart', [[x1, y1]]);
      for (let i = 1; i <= steps; i++) { await api.wait(16); await api.touch('touchMove', [[x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]]); }
      await api.touch('touchEnd', []);
    },
    async close() { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); },
  };
  return api;
}
