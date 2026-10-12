import { open } from './cdp.mjs';
const out = [];
for (const [w, h, tag] of [[375, 667, 'se'], [844, 390, 'land']]) {
  for (const st of [1, 2, 4, 5]) {
    const p = await open(`http://127.0.0.1:8765/?debug&stage=${st}`, { width: w, height: h, dpr: 2 });
    await p.wait(3500);
    const f = `sz-${tag}-${st}.png`; await p.shot(f); out.push(f);
    const e = p.logs.filter((l) => /EXC|rror/.test(l)); if (e.length) console.log(tag, st, e[0]);
    await p.close();
  }
}
console.log(out.join(' '));
process.exit(0);
