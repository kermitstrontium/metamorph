import { open } from './cdp.mjs';
const [out, ...files] = process.argv.slice(2);
const p = await open(`http://127.0.0.1:8765/tools/sheet2.html?f=${files.join(',')}`, { width: 1700, height: Math.ceil(files.length / 2) * 396, dpr: 0.5, mobile: false });
await p.wait(500); await p.shot(out); await p.close(); process.exit(0);
