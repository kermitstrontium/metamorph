import { open } from './cdp.mjs';
let p = await open('http://127.0.0.1:8089/?debug&stage=5');
await p.wait(2500);
console.log('bombs:', await p.eval(`G.stage.bricks.filter(b=>b.bomb).length`));
// Put two bombs side by side and detonate one: expect a chain.
console.log(await p.eval(`(async()=>{ const s=G.stage; const a=s.bricks.find(b=>b.r===3&&b.c===3), b=s.bricks.find(b=>b.r===3&&b.c===4); a.bomb=b.bomb=true; a.hp=b.hp=1;
  const before=s.bricks.filter(q=>q.alive).length; s.hitBrick(a); await new Promise(r=>setTimeout(r,1500)); const after=s.bricks.filter(q=>q.alive).length; return 'chain destroyed '+(before-after)+' bricks'; })()`));
console.log(await p.eval(`(async()=>{ const s=G.stage; s.applyPickup('wide'); s.applyPickup('wide'); s.applyPickup('wide'); await new Promise(r=>setTimeout(r,1500)); return 'wide x'+s.paddle.wideStacks+' width '+Math.round(s.paddle.w)+' (base '+Math.round(s.baseW)+', cap '+Math.round((s.R-s.L)*0.6)+')'; })()`));
await p.shot('nf-breakout.png');
console.log(p.logs.join(' ') || 'breakout clean'); await p.close();
p = await open('http://127.0.0.1:8089/?debug&stage=4');
await p.wait(4500);
console.log(await p.eval(`(async()=>{ const s=G.stage; G.lives=99; for (const a of s.aliens.slice(0,25)) s.killAlien(a); s.aliens=s.aliens.filter(a=>!a.dead); const n0=s.aliens.length; await new Promise(r=>setTimeout(r,1500)); return 'goal '+s.goal+' alive after kills '+n0+' -> after reinforce '+s.aliens.length; })()`));
await p.wait(1500); await p.shot('nf-galaga.png');
console.log(p.logs.join(' ') || 'galaga clean'); await p.close();
process.exit(0);
