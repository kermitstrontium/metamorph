import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8765/?debug');
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.eval(expr)) return true; await p.wait(150); } console.log('waitFor timeout', expr); return false; };
const st = () => p.eval(`G.stage.kind + ' phase=' + G.stage.phase + ' t=' + G.stage.t.toFixed(2) + ' lives=' + G.lives + ' score=' + G.score`);
await p.wait(800);
await p.tap(195, 560);
await p.wait(700); await p.shot('a0-gather.png');
const kinds = ['ttt','c4','snake','asteroids','galaga','breakout','pong'];
for (let i = 0; i < 7; i++) {
  await waitFor(`G.stage.kind==='${kinds[i]}'`);
  await p.wait(500); await p.shot(`b${i}-${kinds[i]}-intro.png`);
  await waitFor(`G.stage.phase==='player'||G.stage.phase==='play'||G.stage.phase==='wait'`);
  await p.wait(1200);
  await p.shot(`c${i}-${kinds[i]}-play.png`);
  console.log(await st());
  await p.eval(`G.stage.forceWin()`);
  await p.wait(300);
  console.log('after win', await st());
}
await waitFor(`G.stage.kind==='ttt'`);
await p.wait(600); await p.shot('z-loop-ttt.png');
console.log(await st(), 'loop', await p.eval('G.loop'));
console.log(p.logs.slice(0, 30).join('\n'));
await p.close(); process.exit(0);
