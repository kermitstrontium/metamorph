import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8765/');
const fs = [];
await p.wait(2500); await p.shot('ti0.png'); fs.push('ti0.png');
for (let i = 1; i < 8; i++) { await p.wait(1050); await p.shot(`ti${i}.png`); fs.push(`ti${i}.png`); }
console.log(fs.join(' '), p.logs.join('\n'));
await p.close(); process.exit(0);
