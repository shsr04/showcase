// Note: node check for herd migration; run with `node scripts/garden-herd-check.mjs`.

import { World } from '../public/garden/js/world.js';
import { N } from '../public/garden/js/config.js';
import { startBuilding, findSite } from '../public/garden/js/econ.js';
import { makeLink, linkPoints } from '../public/garden/js/links.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

// Note: flat sites are random per run, so retry fresh worlds until all five buildings fit.
let w; let A; let B; let C; let coopA; let penA; let svB; let coopB; let penB;
for (let attempt = 0; attempt < 8 && !(coopA && penA && svB && coopB && penB); attempt++) {
  w = World.createNew(`SKY-HERD${attempt || ''}`);
  for (let t = 0; t < 1800; t++) w.step(0.1);
  A = w.getIsland(0, 0);
  B = w.getIsland(0, 1);
  C = w.getIsland(-1, 0);
  w.reveal(B, true); w.reveal(C, true);
  w.planNow(A); w.planNow(B);

  const link = makeLink(w, A, B);
  Object.assign(link, { type: 'ropebridge', state: 'done', progress: 1, built: true });
  link.pts = linkPoints(w, link);
  w.links.push(link);

  const put = (isl, id) => {
    const s = findSite(w, isl, id, isl.reach, null);
    return s ? startBuilding(w, isl, id, s.x, s.y, { built: true }) : null;
  };
  penA = put(A, 'pen'); coopA = put(A, 'coop');
  svB = put(B, 'storehouse'); coopB = put(B, 'coop'); penB = put(B, 'pen');
}
ok(coopA && penA && svB && coopB && penB, 'setup buildings');
if (failures) process.exit(1);

const add = (kind, isl, home) => w.animals.push({ id: w.nextAnimal++, kind, isle: isl.id, x: home.door.i + 0.5, z: home.door.j + 0.5, alt: 0, face: 0, state: 'idle', t: 0, anim: 'idle', hidden: false, home, wait: 0, wool: 0.2, lay: 0, variant: 0 });
for (let k = 0; k < 4; k++) add('hen', A, coopA);
for (let k = 0; k < 3; k++) add('sheep', A, penA);

let sawLink = false; let saved = false;
const onB = (kind) => w.animals.filter((a) => a.isle === B.id && a.kind === kind && !a.gone).length;
for (let t = 0; t < 600 * 25; t++) {
  w.step(0.1);
  if (!sawLink && w.animals.some((a) => a.state === 'herd' && a.link)) {
    sawLink = true;
    // Note: a save mid-crossing must restore the animals on the source island.
    const n = w.animals.length;
    const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    ok(w2.animals.length === n, `restore keeps ${n} animals, got ${w2.animals.length}`);
    ok(w2.animals.every((a) => a.state !== 'herd'), 'restored animals are not herded');
    for (let k = 0; k < 300; k++) w2.step(0.1);
    saved = true;
  }
  if (onB('hen') >= 2 && onB('sheep') >= 2) break;
}
ok(sawLink, 'a herd crossed the bridge');
ok(saved, 'save mid-crossing tested');
ok(onB('hen') >= 2, `hens reach B (${onB('hen')})`);
ok(onB('sheep') >= 1, `sheep reach B (${onB('sheep')})`);
ok(w.animals.filter((a) => a.isle === A.id && a.kind === 'hen').length >= 2, 'A keeps two hens');
ok(w.animals.filter((a) => a.isle === A.id && a.kind === 'sheep').length >= 1, 'A keeps one sheep');
for (let t = 0; t < 600; t++) w.step(0.1);
ok(!w.animals.some((a) => a.state === 'herd'), 'no herd left over');
for (const a of w.animals.filter((x) => x.state === 'herd')) {
  const ld = w.folk.find((f) => f.id === a.leader);
  console.error('  stuck', a.kind, a.isle, 'go', a.go, 'link', a.link && a.link.t, 'dest', JSON.stringify(a.dest && a.dest.isle), 'leader', a.leader, ld && JSON.stringify({ task: ld.task && ld.task.type, ph: ld.task && ld.task.phase, isle: ld.isle, link: !!ld.link }));
}
ok(w.animals.every((a) => a.kind === 'bird' || a.kind === 'butterfly' || a.kind === 'fish' || a.kind === 'dog' || (a.home && !a.home.gone)), 'every hen and sheep has a home');
ok(!w.animals.some((a) => a.isle === C.id && ['hen', 'sheep', 'dog'].includes(a.kind)), 'no local spawn on C');
// Note: nobody may be stuck mid-herd.
ok(w.folk.every((f) => !f.task || f.task.type !== 'herd' || f.task.phase !== 'board' || f.task.t < 60), 'leader not stuck at the anchor');
console.log(`hens on B ${onB('hen')}, sheep on B ${onB('sheep')}, hens on A ${w.animals.filter((a) => a.isle === A.id && a.kind === 'hen').length}`);
console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
