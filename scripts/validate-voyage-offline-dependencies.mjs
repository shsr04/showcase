import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const indexUrl = new URL('../public/voyage/index.html', import.meta.url);
const indexHtml = await readFile(indexUrl, 'utf8');
const match = indexHtml.match(/<script type="importmap">(.*?)<\/script>/);
assert.ok(match, 'Voyage must define an import map');

const { imports } = JSON.parse(match[1]);
assert.deepEqual(imports, {
  three: './vendor/three.module.js',
  'three/addons/': './vendor/',
}, 'Voyage import map must point Three.js modules at local vendor assets');

for (const moduleUrl of Object.values(imports)) {
  assert.ok(!/^[a-z][a-z\d+.-]*:/i.test(moduleUrl), `Voyage import map must not use an external module URL: ${moduleUrl}`);
}

await Promise.all([
  access(new URL('../public/voyage/vendor/three.module.js', import.meta.url)),
  access(new URL('../public/voyage/vendor/controls/OrbitControls.js', import.meta.url)),
]);

const threeModule = await readFile(new URL('../public/voyage/vendor/three.module.js', import.meta.url), 'utf8');
assert.match(threeModule, /const REVISION = '160';/, 'vendored Three.js must be revision 160');

console.log('Validated local Voyage Three.js 0.160.0 module dependencies.');
