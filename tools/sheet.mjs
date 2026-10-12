import { open } from './cdp.mjs';
const [out, ...files] = process.argv.slice(2);
const n = files.length, cols = Math.min(4, n), rows = Math.ceil(n / cols);
const p = await open(`http://127.0.0.1:8765/tools/sheet.html?f=${files.join(',')}`, { width: cols * 394, height: rows * 848, dpr: 0.5 });
await p.wait(500);
await p.shot(out);
await p.close(); process.exit(0);
