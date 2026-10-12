import { open } from './cdp.mjs';
const extra = {
  2: `(()=>{const s=G.stage; s.eaten=4; s.foods=[]; s.spawnFood();})()`,
  5: `(()=>{const s=G.stage; s.launch(); ['multi','wide','laser'].forEach(k=>s.applyPickup(k)); s.pickups.push({x:200,y:300,kind:'multi',t:0});})()`,
};
for (const st of (process.env.STAGES || "0,1,2,3,4,5,6").split(",").map(Number)) {
  const p = await open(`http://127.0.0.1:${process.env.PORT||8765}/?debug&stage=${st}`);
  await p.wait(3000);
  await p.eval('G.lives = 99');
  if (extra[st]) await p.eval(extra[st]);
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 25000) {
    const r = Math.random();
    const x = 20 + Math.random() * 350, y = 120 + Math.random() * 680;
    if (r < 0.3) await p.tap(x, y);
    else if (r < 0.7) await p.swipe(x, y, x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 200, 5);
    else { await p.touch('touchStart', [[60 + Math.random() * 100, 650], [250 + Math.random() * 100, 650]]); for (let i = 0; i < 8; i++) { await p.wait(30); await p.touch('touchMove', [[60 + Math.random() * 120, 600 + Math.random() * 100], [230 + Math.random() * 120, 600 + Math.random() * 100]]); } await p.touch('touchEnd', []); }
    n++;
  }
  const info = await p.eval(`G.stage.kind + ' phase=' + G.stage.phase + ' score=' + G.score + ' lives=' + G.lives + ' goal=' + (G.stage.hudGoal?.()||'')`);
  const errs = p.logs.filter((l) => /EXC|error|Error/.test(l));
  console.log(st, n, 'inputs ->', info, errs.length ? '\n  ' + errs.slice(0, 4).join('\n  ') : 'clean');
  await p.close();
}
process.exit(0);
