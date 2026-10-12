import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8089/?debug&stage=6&ts=2');
await p.wait(2500);
console.log(await p.eval(`new Promise(res=>{ const s=G.stage; G.lives=99; let n=0, ok=0, miss=0;
  s.point=()=>{ miss++; next(); };
  function next(){ if(n++>=40) return res('returned '+ok+' / missed '+miss); s.ai.x = Math.random()<0.5 ? s.L+s.ai.w/2 : s.R-s.ai.w/2; s.serve(1); }
  (function watch(){ if (s.hits>0 && !s.serving) { ok++; next(); } requestAnimationFrame(watch); })();
  next(); })`, ));
await p.close(); process.exit(0);
