import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8765/?debug');
console.log(await p.eval(`(async()=>{ G.audio.unlock(); await new Promise(r=>setTimeout(r,300)); return G.audio.ctx.state })()`));
for (const k of ['title',0,1,2,3,4,5,6]) {
  await p.eval(`G.audio.setTrack(${JSON.stringify(k)}, 1)`);
  await p.wait(1200);
}
console.log(await p.eval(`(()=>{const a=G.audio; ['tap','place','drop','eat','laser','pew','boom','hit','bounce','powerup','lose','win','riser','impact','thrust','tick'].forEach(f=>a[f](1)); a.note(5,{sparkle:true}); return 'sfx ok step='+a.step+' beat='+a.beat().toFixed(2)})()`));
await p.wait(800);
console.log(p.logs.join('\n') || 'no errors');
await p.close(); process.exit(0);
