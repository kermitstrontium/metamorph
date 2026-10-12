import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8765/?debug');
await p.eval(`(async()=>{ const a=G.audio; a.unlock(); await new Promise(r=>setTimeout(r,200)); const an=a.ctx.createAnalyser(); an.fftSize=2048; a.master.connect(an); window.__an=an; })()`);
const meas = `(async()=>{ const an=window.__an, b=new Float32Array(2048); let peak=0, sum=0, n=0; for(let i=0;i<40;i++){ an.getFloatTimeDomainData(b); for(const v of b){peak=Math.max(peak,Math.abs(v)); sum+=v*v; n++;} await new Promise(r=>setTimeout(r,50)); } return 'peak='+peak.toFixed(2)+' rms='+Math.sqrt(sum/n).toFixed(3); })()`;
for (const k of ['title',0,1,2,3,4,5,6]) { await p.eval(`G.audio.setTrack(${JSON.stringify(k)})`); await p.wait(1500); console.log('track', k, await p.eval(meas)); }
await p.eval(`G.audio.setMusic(false)`); await p.wait(500);
for (const f of ['place','eat','laser','boom','win','riser','lose']) { await p.eval(`G.audio.${f}(1)`); console.log('sfx', f, await p.eval(meas)); }
await p.close(); process.exit(0);
