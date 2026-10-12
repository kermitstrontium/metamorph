// Capture frames through each transition at slowed time.
import { open } from './cdp.mjs';
const from = Number(process.argv[2] ?? 0), ts = Number(process.argv[3] ?? 0.25), n = Number(process.argv[4] ?? 6), gap = Number(process.argv[5] ?? 900);
const p = await open(`http://127.0.0.1:8765/?debug&stage=${from}&ts=${ts}`);
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.eval(expr)) return true; await p.wait(150); } console.log('timeout', expr); return false; };
await waitFor(`['player','play','wait'].includes(G.stage.phase)`, 40000);
if (process.env.SETUP) await p.eval(process.env.SETUP);
await p.wait(300);
const k0 = await p.eval('G.stage.kind');
await p.eval(process.env.FORCE || 'G.stage.forceWin()');
await waitFor(`G.stage.kind !== '${k0}'`);
const files = [];
for (let i = 0; i < n; i++) { await p.wait(gap); const f = `t${from}-${i}.png`; await p.shot(f); files.push(f); console.log(i, await p.eval(`G.stage.kind+' t='+G.stage.t.toFixed(2)`)); }
console.log(files.join(','));
console.log(p.logs.join('\n'));
await p.close(); process.exit(0);
