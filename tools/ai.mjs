import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8765/?debug&stage=1');
await p.wait(2500);
console.log(await p.eval(`(()=>{ const s=G.stage; const out=[]; for (const loop of [0,1,2,3]) { G.loop=loop; const b=s.board.slice(); b[3*6]=1; b[2*6]=2; b[4*6]=1; const t0=performance.now(); s.board=b; const save=s.drop; let col; s.drop=(c)=>{col=c}; s.aiMove(); s.drop=save; out.push('loop'+loop+' '+(performance.now()-t0).toFixed(0)+'ms col='+col); } G.loop=0; return out.join(' | '); })()`));
await p.close(); process.exit(0);
