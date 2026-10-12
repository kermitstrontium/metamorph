import { open } from './cdp.mjs';
const which = process.argv[2] ?? 'all';
const S = async (stage) => { const p = await open(`http://127.0.0.1:8765/?debug&stage=${stage}`); await p.wait(2500); return p; };
const ev = (p, e) => p.eval(e);
if (which === 'all' || which === 'ttt') {
  const p = await S(0);
  const c = await ev(p, `JSON.stringify(G.stage.center(4))`); const {x,y} = JSON.parse(c);
  await p.tap(x, y); await p.wait(1500);
  console.log('TTT board after tap centre:', await ev(p, 'G.stage.board.join("")'), 'phase', await ev(p,'G.stage.phase'));
  await p.shot('i0-ttt.png'); console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'c4') {
  const p = await S(1);
  const x = await ev(p, 'G.stage.colX(3)');
  await p.tap(x, 300); await p.wait(2500);
  console.log('C4 pieces:', await ev(p, 'G.stage.board.filter(v=>v).length'), 'phase', await ev(p,'G.stage.phase'));
  await p.shot('i1-c4.png'); console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'snake') {
  const p = await S(2);
  await p.swipe(200, 400, 200, 300); await p.wait(600);
  console.log('snake phase', await ev(p,'G.stage.phase'), 'dir', await ev(p,'JSON.stringify(G.stage.dir)'));
  await p.swipe(200, 400, 300, 400); await p.wait(400);
  console.log('dir', await ev(p,'JSON.stringify(G.stage.dir)'), 'head', await ev(p,'JSON.stringify(G.stage.body[0])'));
  await p.shot('i2-snake.png'); console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'ast') {
  const p = await S(3);
  await p.wait(800);
  const s0 = await ev(p, 'JSON.stringify([G.stage.ship.x|0, G.stage.ship.y|0])');
  await p.touch('touchStart', [[80, 650], [300, 650]]);
  for (let i = 0; i < 25; i++) { await p.wait(40); await p.touch('touchMove', [[80 + 40, 650 - 30], [300, 600]]); }
  await p.shot('i3-ast.png');
  console.log('ship', s0, '->', await ev(p, 'JSON.stringify([G.stage.ship.x|0, G.stage.ship.y|0, G.stage.ship.a.toFixed(2)])'), 'bullets', await ev(p,'G.stage.bullets.length'), 'killed', await ev(p,'G.stage.killed'));
  await p.touch('touchEnd', []);
  console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'gal') {
  const p = await S(4);
  await p.wait(2500);
  const x0 = await ev(p, 'G.stage.ship.x|0');
  await p.swipe(200, 700, 120, 700, 8); await p.wait(1500);
  console.log('galaga ship', x0, '->', await ev(p, 'G.stage.ship.x|0'), 'kills', await ev(p,'G.stage.kills'), 'phase', await ev(p,'G.stage.phase'));
  await p.shot('i4-gal.png'); console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'brk') {
  const p = await S(5);
  await p.tap(200, 600); await p.wait(1500);
  console.log('breakout ball', await ev(p, 'JSON.stringify(G.stage.balls.map(b=>[b.stuck,b.x|0,b.y|0]))'), 'left', await ev(p,'G.stage.bricks.filter(b=>b.alive).length'));
  await p.shot('i5-brk.png'); console.log(p.logs.join('\n')); await p.close();
}
if (which === 'all' || which === 'pong') {
  const p = await S(6);
  await p.swipe(200, 700, 300, 700, 8); await p.wait(1000);
  console.log('pong me.x', await ev(p, 'G.stage.me.x|0'), 'ball', await ev(p, 'JSON.stringify([G.stage.ball.x|0,G.stage.ball.y|0])'));
  await p.shot('i6-pong.png'); console.log(p.logs.join('\n')); await p.close();
}
process.exit(0);
