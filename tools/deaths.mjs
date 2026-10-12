import { open } from './cdp.mjs';
const kill = {
  0: `(()=>{const s=G.stage; s.board=[2,2,0,1,1,0,0,0,0]; s.pieces=[{cell:0,who:2,t:1},{cell:1,who:2,t:1},{cell:3,who:1,t:1},{cell:4,who:1,t:1}]; s.place(2,2);})()`,
  1: `(()=>{const s=G.stage; for(let k=0;k<3;k++){s.board[k*6]=2; s.discs.push({c:k,r:0,who:2,x:s.colX(k),y:s.rowY(0),vy:0,morph:1,state:'rest',landed:true});} s.drop(3,2);})()`,
  2: `(()=>{G.stage.go(); G.stage.die();})()`,
  3: `G.stage.killShip()`,
  4: `G.stage.killShip()`,
  5: `(()=>{G.stage.launch(); G.stage.balls.forEach(b=>{b.y=G.H+100;});})()`,
  6: `(()=>{const s=G.stage; s.sa=2; s.ball.y=G.H+50; s.ball.vy=100;})()`,
};
for (let st = 0; st < 7; st++) {
  const p = await open(`http://127.0.0.1:8765/?debug&stage=${st}`);
  const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.eval(expr)) return true; await p.wait(150); } return false; };
  await waitFor(`['player','play','wait'].includes(G.stage.phase)`);
  await p.wait(300);
  await p.eval(kill[st]);
  const lost = await waitFor(`G.lives===2`, 8000);
  const back = await waitFor(`['player','play','wait'].includes(G.stage.phase) && (G.stage.kind!=='asteroids'&&G.stage.kind!=='galaga' || G.stage.ship.alive)`, 15000);
  // Now drain the final lives to test game over.
  await p.eval('G.lives=1');
  await p.wait(300);
  await p.eval(kill[st]);
  const over = await waitFor(`G.state==='over' && !document.getElementById('over').classList.contains('hidden')`, 15000);
  if (st === 3) await p.shot('d-over.png');
  await p.eval(`document.getElementById('again').click()`);
  const again = await waitFor(`G.state==='play' && G.lives===3`, 5000);
  console.log(st, { lost, back, over, again }, p.logs.filter(l=>/EXC|error/i.test(l)).slice(0,3).join(' | '));
  await p.close();
}
process.exit(0);
