import { open } from './cdp.mjs';
const p = await open('http://127.0.0.1:8089/');
await p.wait(1500);
const r = await p.send('Page.getAppManifest');
console.log('errors:', JSON.stringify(r.result.errors), '\nurl:', r.result.url);
const m = JSON.parse(r.result.data); console.log('name:', m.name, '| display:', m.display, '| icons:', m.icons.map(i => i.sizes + (i.purpose ? '/' + i.purpose : '')).join(', '));
console.log('build:', await p.eval(`document.querySelector('meta[name=metamorph-build]').content`), '| logs:', p.logs.join(' ') || 'none');
await p.close(); process.exit(0);
