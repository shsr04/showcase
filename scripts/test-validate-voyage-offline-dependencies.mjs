import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../public/voyage/index.html', import.meta.url), 'utf8');

assert.ok(!indexHtml.includes('https://unpkg.com/'), 'Voyage import map must not use unpkg');
assert.match(indexHtml, /"three":"\.\/vendor\/three\.module\.js"/, 'Voyage must load Three.js from its local vendor directory');
assert.match(indexHtml, /"three\/addons\/":"\.\/vendor\/"/, 'Voyage must load addons from its local vendor directory');

await Promise.all([
  access(new URL('../public/voyage/vendor/three.module.js', import.meta.url)),
  access(new URL('../public/voyage/vendor/controls/OrbitControls.js', import.meta.url)),
]);

console.log('Voyage import map has no external module URLs.');
