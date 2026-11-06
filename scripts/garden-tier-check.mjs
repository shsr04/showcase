// Note: geometry checks for Garden building tier kits (public/garden/js/tiers/*.js); run `NODE_NO_WARNINGS=1 node scripts/garden-tier-check.mjs`.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = pathToFileURL(path.join(root, 'public/garden/vendor/three.module.js')).href;
// Note: loader hook maps the bare specifier 'three' to the vendored build.
const hook = `export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(s, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const THREE = await import('three');
const M = await import(pathToFileURL(path.join(root, 'public/garden/js/models.js')).href);
const CFG = await import(pathToFileURL(path.join(root, 'public/garden/js/config.js')).href);
const { TIER_KITS } = await import(pathToFileURL(path.join(root, 'public/garden/js/tiers/index.js')).href);

const GAP = 0.02; // connectivity tolerance
const BUDGET = 420; // Note: soft cap on extra triangles at T4; the models check limits the total.
const SLACK = 1.0; // tier parts may exceed the base bbox by this much in x/z
const MIN_Y = -0.3;
const LAMP_R = 1.5;
// Note: glow meshes that need no lamp point.
const LIT_OK = /pane|window|win\d*|sign|string|bulb|fairy|glass/i;

let failures = 0;
const fail = (m) => { failures++; console.error('FAIL:', m); };
const warn = (m) => console.warn('WARN:', m);
const f2 = (v) => v.toFixed(2);
const fb = (b) => `[${b.map(f2).join(', ')}]`;

// Note: kit file per id, for reporting to the owners.
const tierDir = path.join(root, 'public/garden/js/tiers');
const kitFile = (id) => {
  for (const f of fs.readdirSync(tierDir)) {
    if (!f.endsWith('.js') || ['index.js', 'registry.js'].includes(f)) continue;
    const src = fs.readFileSync(path.join(tierDir, f), 'utf8');
    if (new RegExp(`TIER_KITS(\\.${id}\\b|\\[['"\`]${id}['"\`]\\])`).test(src)) return f;
  }
  return '?';
};

function meshesOf(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);

// Note: prims of one mesh as AABBs in building space (mesh matrix applied to the 8 corners).
const _v = new THREE.Vector3();
function primsOf(mesh, id, seenNoPrims) {
  let prims = mesh.geometry.userData.prims;
  if (!Array.isArray(prims) || !prims.length) {
    if (!seenNoPrims.has(mesh.name)) { seenNoPrims.add(mesh.name); warn(`${id}/${mesh.name}: geometry has no userData.prims; using its bounding box`); }
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    prims = [[b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]];
  }
  const e = mesh.matrixWorld;
  return prims.map((p, i) => {
    const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
      _v.set(k & 1 ? p[3] : p[0], k & 2 ? p[4] : p[1], k & 4 ? p[5] : p[2]).applyMatrix4(e);
      for (let a = 0; a < 3; a++) { o[a] = Math.min(o[a], _v.getComponent(a)); o[a + 3] = Math.max(o[a + 3], _v.getComponent(a)); }
    }
    return { box: o, mesh: mesh.name, i };
  });
}

// Note: euclidean distance between two AABBs; 0 when they touch or overlap.
function gap(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(a[k] - b[k + 3], b[k] - a[k + 3], 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

const union = (list) => list.reduce((u, p) => {
  for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], p.box[k]); u[k + 3] = Math.max(u[k + 3], p.box[k + 3]); }
  return u;
}, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);

function build(id, lvl, seed, tier) {
  const g = M.makeBuilding(id, lvl, seed, tier);
  g.updateMatrixWorld(true);
  return g;
}

const ids = [...CFG.FLOURISH_IDS];
const rows = [];
const reported = new Map(); // dedupe key -> { text, n }
const litWarned = new Set();
const noPrims = new Set();

for (const id of ids) {
  if (!TIER_KITS[id]) { console.log(`skip ${id} (no kit)`); continue; }
  const file = kitFile(id);
  const levels = id === 'hut' ? [0, 1, 2] : [0];
  const row = { id, file, builds: 0, maxDelta: 0, deltaAt: '', disc: 0, mono: 0, spots: 0, lit: 0, bounds: 0, errs: 0 };
  const failId = (kind, key, text) => {
    const k = `${id}|${kind}|${key}`;
    const r = reported.get(k);
    if (r) { r.n++; return; }
    reported.set(k, { text: `${id} (${file}): ${text}`, n: 1 });
    row[kind]++;
  };

  for (const lvl of levels) {
    for (let d = 0; d < 2; d++) {
      for (let v = 0; v < 4; v++) {
        const seed = v | (d << 2);
        const cfg = `L${lvl} v${v} d${d}`;
        let g0;
        try { g0 = build(id, lvl, seed, 0); } catch (e) { row.errs++; fail(`${id} ${cfg} T0: throws ${e.message}`); continue; }
        const baseNames = new Set(meshesOf(g0).map((m) => m.name));
        const baseMeshes = meshesOf(g0).flatMap((m) => primsOf(m, id, noPrims));
        const baseBox = union(baseMeshes);
        const t0tris = tris(g0);
        let prevNames = baseNames;

        for (let tier = 1; tier <= 4; tier++) {
          const tag = `${cfg} T${tier}`;
          let g;
          try { g = build(id, lvl, seed, tier); } catch (e) { row.errs++; fail(`${id} ${tag}: throws ${e.message}`); break; }
          row.builds++;
          const all = meshesOf(g);
          const names = all.map((m) => m.name);
          const nameSet = new Set(names);
          if (nameSet.size !== names.length) failId('errs', 'dupname', `${tag}: duplicate mesh names`);
          // Note: base meshes are the first baseMeshes children of the T0 build; tier meshes are everything else by name.
          if (g.userData.baseMeshes !== g0.children.length) failId('errs', 'basemeshes', `${tag}: ud.baseMeshes=${g.userData.baseMeshes} but T0 has ${g0.children.length} children`);
          const tierMeshes = all.filter((m) => !baseNames.has(m.name));

          // (2) monotonic
          for (const n of prevNames) if (!nameSet.has(n)) failId('mono', `${n}|${tier}`, `${tag}: mesh "${n}" of T${tier - 1} missing`);
          prevNames = nameSet;

          // (4) spots
          for (const s of ['S', 'C', 'W']) if (!g.userData.spots?.[s]?.isVector3) failId('spots', s, `${tag}: ud.spots.${s} missing`);

          // (1) connectivity
          const tierPrims = tierMeshes.flatMap((m) => primsOf(m, id, noPrims));
          const nodes = [...baseMeshes, ...tierPrims];
          const reach = new Array(nodes.length).fill(false);
          const queue = [];
          // Note: base prims are sources; prims touching the ground (min y <= GAP) count as attached to it.
          nodes.forEach((p, i) => { if (i < baseMeshes.length || p.box[1] <= GAP) { reach[i] = true; queue.push(i); } });
          while (queue.length) {
            const a = nodes[queue.pop()].box;
            for (let j = baseMeshes.length; j < nodes.length; j++) {
              if (!reach[j] && gap(a, nodes[j].box) <= GAP) { reach[j] = true; queue.push(j); }
            }
          }
          for (let j = baseMeshes.length; j < nodes.length; j++) {
            if (reach[j]) continue;
            let best = Infinity;
            nodes.forEach((p, i) => { if (reach[i]) best = Math.min(best, gap(nodes[j].box, p.box)); });
            const p = nodes[j];
            failId('disc', `${p.mesh}|${p.i}|${p.box.map((x) => x.toFixed(2)).join(',')}`,
              `${tag}: floating prim in mesh "${p.mesh}" #${p.i} box ${fb(p.box)} nearest gap ${f2(best)}`);
          }

          // (6) bounds
          if (tierPrims.length) {
            const tb = union(tierPrims);
            const over = Math.max(baseBox[0] - tb[0], tb[3] - baseBox[3], baseBox[2] - tb[2], tb[5] - baseBox[5]);
            if (over > SLACK) failId('bounds', `xz|${tier}`, `${tag}: tier parts exceed base bbox by ${f2(over)} (> ${SLACK}) tier box ${fb(tb)} base box ${fb(baseBox)}`);
            if (tb[1] < MIN_Y) failId('bounds', `y|${tier}`, `${tag}: tier parts reach y=${f2(tb[1])} (< ${MIN_Y})`);
          }

          // (5) lit parts
          const lamps = g.userData.lamps || [];
          for (const m of tierMeshes) {
            if (m.material !== M.MATS.glow) continue;
            const b = union(primsOf(m, id, noPrims));
            const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
            const near = lamps.some((l) => Math.hypot(l.x - cx, l.y - cy, l.z - cz) <= LAMP_R);
            const k = `${id}|${m.name}`;
            if (!near && !LIT_OK.test(m.name) && !litWarned.has(k)) {
              litWarned.add(k);
              row.lit++;
              warn(`${id} (${file}): glow mesh "${m.name}" has no lamp within ${LAMP_R} (${tag}, centre ${fb([cx, cy, cz])})`);
            }
          }

          // (3) triangle budget
          if (tier === 4) {
            const delta = tris(g) - t0tris;
            if (delta > row.maxDelta) { row.maxDelta = delta; row.deltaAt = cfg; }
          }
        }
      }
    }
  }
  if (row.maxDelta > BUDGET) { row.budget = true; fail(`${id} (${file}): T4 adds ${row.maxDelta} tris > ${BUDGET} (${row.deltaAt})`); }
  rows.push(row);
}

for (const r of reported.values()) fail(r.text + (r.n > 1 ? ` (+${r.n - 1} more configs)` : ''));

console.log('\n== tier summary ==');
if (!rows.length) console.log('(no kits registered)');
else {
  console.log(`${'id'.padEnd(12)}${'file'.padEnd(18)}${'builds'.padStart(7)}${'T4+tris'.padStart(9)}${'float'.padStart(7)}${'mono'.padStart(6)}${'spots'.padStart(7)}${'bounds'.padStart(8)}${'errs'.padStart(6)}${'litwarn'.padStart(9)}`);
  for (const r of rows) {
    console.log(`${r.id.padEnd(12)}${r.file.padEnd(18)}${String(r.builds).padStart(7)}${String(r.maxDelta).padStart(9)}${String(r.disc).padStart(7)}${String(r.mono).padStart(6)}${String(r.spots).padStart(7)}${String(r.bounds).padStart(8)}${String(r.errs).padStart(6)}${String(r.lit).padStart(9)}`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : '\nall checks passed');
process.exit(failures ? 1 : 0);
