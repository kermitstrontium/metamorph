import { open } from './cdp.mjs';
import { copyFileSync } from 'node:fs';
for (const [name, s, mask] of [['icon-512', 512, false], ['icon-192', 192, false], ['apple-touch-icon', 180, false], ['icon-maskable-512', 512, true]]) {
  const p = await open(`http://127.0.0.1:8765/tools/icon.html?s=${s}${mask ? '&mask' : ''}`, { width: s, height: s, dpr: 1, mobile: false });
  await p.wait(800);
  await p.shot(name + '.png');
  copyFileSync(new URL(`./shots/${name}.png`, import.meta.url), new URL(`../icons/${name}.png`, import.meta.url));
  await p.close();
}
process.exit(0);
