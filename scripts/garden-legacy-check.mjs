// Note: node check for the pure legacy rules (deeds and elder teaching); run with `node scripts/garden-legacy-check.mjs`.
// Note: uses a stub world and the real island generator; world.js and folk.js are not imported.

import { generateIsland, cidx } from '../public/garden/js/island.js';
import { N, AGE } from '../public/garden/js/config.js';
import {
  DEED_KINDS, MAX_DEEDS, HERO_STEPS, MASTER_MADE, TALENTS, TALENT_CAP, TEACH_COOLDOWN, YOUNG_AGE,
  recordDeed, scanDeeds, legacyEvent, legacyTick, elderTeach, elderTeachAt, deedIcon, deedMemorials, deedCells, memorialSpot,
  deedsToJSON, deedsFromJSON, hasDeed,
} from '../public/garden/js/legacy.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mkIsland(world, gx, gz) {
  const isl = generateIsland(world.seed, gx, gz);
  isl.revealed = true;
  // Note: a storehouse door near the island centre gives the placement a stable anchor.
  let door = null;
  for (let r = 0; r < N && !door; r++) for (let j = N / 2 - r; j <= N / 2 + r && !door; j++) for (let i = N / 2 - r; i <= N / 2 + r && !door; i++) if (isl.walkable(i, j) && isl.bld[cidx(i, j)] < 0) door = { i, j };
  isl.buildings.push({ id: 'storehouse', x: door.i, y: door.j - 2, size: 2, built: true, door });
  world.islands.set(isl.id, isl);
  return isl;
}

function mkWorld(seed = 4711) {
  const world = {
    seed, time: 1000, islands: new Map(), folk: [], links: [], deeds: [], out: [],
    emit(e) { this.out.push(e); },
    folkOn(id) { return this.folk.filter((f) => f.isle === id && !f.link); },
  };
  for (const [gx, gz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [1, 1], [2, 0], [0, 2], [-1, -1], [2, 1], [-2, 0], [0, -2], [3, 0]]) mkIsland(world, gx, gz);
  return world;
}

let nextId = 1;
const mkFolk = (world, isl, o = {}) => {
  const f = {
    id: nextId++, isle: isl.id, stage: 'adult', age: 3000, kids: 0, home: -1, pars: null, link: null,
    talent: { gather: 1, craft: 1, build: 1, porter: 1, wonder: 1 }, ...o,
  };
  if (o.talent) f.talent = { gather: 1, craft: 1, build: 1, porter: 1, wonder: 1, ...o.talent };
  world.folk.push(f);
  return f;
};
const isls = (w) => [...w.islands.values()];
const linkOn = (w, a, b, id) => ({ id, a: a.id, b: b.id, ai: { i: 4, j: 4 }, bi: { i: 5, j: 5 }, state: 'done' });

// Note: 1) bridge
{
  const w = mkWorld(); const [A, B, C] = isls(w);
  const l1 = linkOn(w, A, B, 'l1'); const l2 = linkOn(w, B, C, 'l2');
  w.links.push(l1);
  const ev = legacyEvent(w, { type: 'linkdone', link: l1 });
  ok(ev.length === 1 && ev[0].type === 'deed' && ev[0].kind === 'bridge' && ev[0].isl === A, 'first link built records a bridge deed with the island object');
  w.links.push(l2);
  ok(legacyEvent(w, { type: 'linkdone', link: l2 }).length === 0, 'second link records nothing');
  ok(scanDeeds(w).length === 0 && w.deeds.filter((d) => d.kind === 'bridge').length === 1, 'scan adds no second bridge');
  ok(recordDeed(w, 'bridge', { isl: C }) === null, 'direct bridge on another island is a duplicate');
  const d = w.deeds[0];
  ok(A.walkable(d.x, d.z) && !(d.x === 4 && d.z === 4), 'bridge memorial stands on a free walkable cell off the anchor');
  const w2 = mkWorld(); w2.links.push(linkOn(w2, isls(w2)[1], isls(w2)[2], 'q'));
  ok(scanDeeds(w2).length === 1 && w2.deeds[0].kind === 'bridge', 'scan repairs a save that has a done link but no deed');
  const w3 = mkWorld(); w3.links.push({ ...linkOn(w3, isls(w3)[0], isls(w3)[1], 'p'), state: 'building' });
  ok(scanDeeds(w3).length === 0, 'an unfinished link makes no deed');
}

// Note: 2) master
{
  const w = mkWorld(); const [A, B, C] = isls(w);
  A.use = { plank: MASTER_MADE + 5 }; mkFolk(w, A, { talent: { craft: 1.45 } });
  B.use = { plank: MASTER_MADE + 5 }; mkFolk(w, B, { talent: { craft: 1.0, build: 1.0 } });
  C.use = { wood: 500, stone: 500 }; mkFolk(w, C, { talent: { craft: 1.6 } });
  const ev = scanDeeds(w);
  ok(ev.length === 1 && ev[0].kind === 'master' && ev[0].isl === A, 'master needs high talent and enough crafted goods; raw gathering does not count');
  ok(scanDeeds(w).length === 0 && legacyEvent(w, { type: 'crafted', isl: A }).length === 0, 'master is recorded once per island');
  A.use.plank = 3; mkFolk(w, B, { talent: { build: 1.5 } });
  ok(legacyEvent(w, { type: 'crafted', isl: B }).length === 1 && hasDeed(w, 'master', B.id), 'the crafted event records a master once the rule holds');
  const kid = mkFolk(w, C, { stage: 'child', talent: { craft: 1.6 } }); C.use = { plank: 99 }; w.folk = w.folk.filter((f) => f.isle !== C.id || f === kid);
  ok(scanDeeds(w).length === 0, 'a child cannot be a master');
}

// Note: 3) parent
{
  const w = mkWorld(); const [A, B, C] = isls(w);
  const e1 = mkFolk(w, A, { stage: 'elder', kids: 3, age: AGE.elder + 5 });
  mkFolk(w, B, { stage: 'elder', kids: 1 });
  mkFolk(w, C, { stage: 'adult', kids: 6 });
  const ev = legacyEvent(w, { type: 'aged', f: e1 });
  ok(ev.length === 1 && ev[0].kind === 'parent' && ev[0].isl === A, 'an elder with enough kids records a parent deed');
  ok(legacyEvent(w, { type: 'aged', f: e1 }).length === 0, 'repeat aged event adds nothing');
  const e3 = mkFolk(w, A, { stage: 'elder', kids: 5 });
  ok(legacyEvent(w, { type: 'aged', f: e3 }).length === 0, 'a second elder on the same island adds nothing');
  const sc = scanDeeds(w);
  ok(sc.length === 0 && !hasDeed(w, 'parent', B.id) && !hasDeed(w, 'parent', C.id), 'one kid or a non-elder makes no parent deed');
  const e4 = mkFolk(w, B, { stage: 'elder', kids: 2 });
  ok(scanDeeds(w).length === 1 && hasDeed(w, 'parent', B.id), 'scan finds the elder on another island');
  ok(legacyEvent(w, { type: 'aged', f: mkFolk(w, C, { stage: 'adult', kids: 9 }) }).length === 0, 'an aged event for a non-elder is ignored');
  ok(e4.isle === B.id, 'stub sanity');
}

// Note: 4) hero
{
  const w = mkWorld(); const list = isls(w).slice(1);
  const explore = (n) => { for (let k = 0; k < n; k++) list[k].explored = true; };
  explore(HERO_STEPS[0] - 1);
  ok(scanDeeds(w).length === 0, 'too few explored islands make no hero');
  list[HERO_STEPS[0] - 1].explored = true;
  const ev = legacyEvent(w, { type: 'land', isl: list[0] });
  ok(ev.length === 1 && ev[0].kind === 'hero', 'the third explored island records one hero');
  ok(scanDeeds(w).length === 0 && legacyEvent(w, { type: 'reveal', isl: list[0] }).length === 0, 'repeat hooks add nothing');
  for (let k = HERO_STEPS[0]; k < HERO_STEPS[1]; k++) list[k].explored = true;
  ok(scanDeeds(w).length === 1, 'the sixth explored island records a second hero');
  const heroes = w.deeds.filter((d) => d.kind === 'hero');
  ok(new Set(heroes.map((d) => d.isl)).size === heroes.length && heroes.length === 2, 'each hero memorial stands on its own island');
  ok(recordDeed(w, 'hero', { isl: list[list.length - 1] }) === null, 'a direct hero beyond the owed count is refused');
  for (const i of list) i.explored = true;
  scanDeeds(w);
  ok(w.deeds.filter((d) => d.kind === 'hero').length === HERO_STEPS.filter((s) => s <= list.length).length, 'hero count follows the steps');
  const home = isls(w)[0]; home.explored = true;
  ok(w.deeds.filter((d) => d.kind === 'hero').length <= HERO_STEPS.length, 'home does not count');
}

// Note: 5) deed shape: icon only
{
  const w = mkWorld(); const [A] = isls(w);
  A.use = { plank: 99 }; mkFolk(w, A, { talent: { craft: 1.5 } }); mkFolk(w, A, { stage: 'elder', kids: 4 });
  w.links.push(linkOn(w, A, isls(w)[1], 'z'));
  scanDeeds(w);
  const keys = new Set(w.deeds.flatMap((d) => Object.keys(d)));
  ok(w.deeds.length === 3 && same([...keys].sort(), ['isl', 'kind', 't', 'x', 'z']), 'deeds carry only kind, island, cell and time');
  ok(DEED_KINDS.every((k) => typeof deedIcon(k) === 'string') && deedIcon('nope') === null, 'every kind has an icon id');
  const m = deedMemorials(w, A.id);
  ok(m.length === 3 && m.every((x) => x.icon === deedIcon(x.kind) && !('name' in x)), 'memorial data has an icon and no name');
  ok(deedCells(w, A.id).size === 3, 'deed cells list every memorial');
  ok(recordDeed(w, 'villain', { isl: A }) === null && recordDeed(w, 'hero', { isl: 'nowhere' }) === null, 'unknown kind or island is refused');
}

// Note: 6) placement
{
  const w = mkWorld(); const [A] = isls(w);
  A.memorials = [{ i: 12, j: 12, kind: 'tree' }];
  const used = [];
  for (let k = 0; k < 6; k++) {
    const s = memorialSpot(w, A, null);
    if (!s) break;
    used.push(s); w.deeds.push({ kind: 'master', isl: A.id, x: s.x, z: s.z, t: 0 });
  }
  ok(used.length === 6, 'six spots found');
  let apart = true;
  for (let a = 0; a < used.length; a++) for (let b = a + 1; b < used.length; b++) if (Math.max(Math.abs(used[a].x - used[b].x), Math.abs(used[a].z - used[b].z)) <= 1) apart = false;
  ok(apart && used.every((s) => A.walkable(s.x, s.z) && Math.max(Math.abs(s.x - 12), Math.abs(s.z - 12)) > 1), 'spots are walkable, apart and clear of old memorials');
  const sv = A.buildings[0].door;
  ok(used.every((s) => !(s.x === sv.i && s.z === sv.j)), 'a spot never blocks a door');
  const dry = mkIsland(mkWorld(), 5, 5); dry.mask.fill(0);
  ok(memorialSpot(w, dry, null) === null && recordDeed(w, 'parent', { isl: dry }) === null, 'no free cell gives null, not a crash');
}

// Note: 7) save and load
{
  const w = mkWorld(); const [A, B] = isls(w);
  A.use = { plank: 99 }; mkFolk(w, A, { talent: { craft: 1.5 } }); mkFolk(w, B, { stage: 'elder', kids: 4 });
  w.links.push(linkOn(w, A, B, 'r'));
  for (const i of isls(w).slice(1, 7)) i.explored = true;
  scanDeeds(w);
  const json = JSON.parse(JSON.stringify(deedsToJSON(w)));
  const back = deedsFromJSON(json);
  ok(same(back, w.deeds) && back.length >= 4, `deeds roundtrip (${back.length})`);
  const lean = deedsFromJSON(json.map((d) => ({ kind: d.kind, isl: d.isl, x: d.x, z: d.z, t: d.t })));
  ok(same(lean, back), 'contract-only fields load the same');
  const dupes = deedsFromJSON([...json, ...json, json[0]]);
  ok(dupes.length === back.length, 'duplicate deeds in a save are dropped');
  const w2 = mkWorld(); w2.deeds = back; w2.links = w.links; for (const i of isls(w2)) i.explored = w.islands.get(i.id).explored; w2.folk = w.folk;
  for (const i of isls(w2)) i.use = w.islands.get(i.id).use;
  ok(scanDeeds(w2).length === 0 && w2.deeds.length === back.length, 'a rescan after load adds no duplicates');
  const sameKind = deedsFromJSON([{ kind: 'parent', isl: A.id, x: 3, z: 3, t: 1 }, { kind: 'parent', isl: A.id, x: 6, z: 6, t: 2 }, { kind: 'bridge', isl: A.id, x: 3, z: 3, t: 1 }, { kind: 'bridge', isl: B.id, x: 4, z: 3, t: 1 }]);
  ok(sameKind.length === 2, 'dedupe by kind and island alone');
  const junk = deedsFromJSON([null, 5, { kind: 'x' }, { kind: 'hero', isl: 3, x: 1, z: 1 }, { kind: 'hero', isl: 'a', x: -1, z: 1 }, { kind: 'hero', isl: 'a', x: 99, z: 1 }]);
  ok(junk.length === 0 && deedsFromJSON(undefined).length === 0 && deedsFromJSON('no').length === 0, 'junk deeds are dropped');
  const many = deedsFromJSON(Array.from({ length: 60 }, (_, k) => ({ kind: 'hero', isl: `${k},0`, x: 1, z: 1, t: 0 })));
  ok(many.length === MAX_DEEDS, 'the deed cap holds on load');
  const full = mkWorld(); full.deeds = many.map((d) => ({ ...d, isl: `g${d.isl}` }));
  ok(recordDeed(full, 'parent', { isl: isls(full)[0] }) === null, 'the cap holds when recording');
}

// Note: 8) determinism
{
  const run = () => {
    nextId = 1;
    const w = mkWorld(99); const [A, B, C] = isls(w);
    A.use = { plank: 99 }; mkFolk(w, A, { talent: { craft: 1.5 } }); mkFolk(w, B, { stage: 'elder', kids: 4 }); mkFolk(w, A, { stage: 'elder', kids: 4 });
    for (const i of isls(w).slice(1)) i.explored = true;
    const ev = [];
    const l = linkOn(w, A, C, 'd'); w.links.push(l);
    ev.push(...legacyEvent(w, { type: 'linkdone', link: l }), ...legacyTick(w), ...legacyTick(w));
    return { deeds: w.deeds, ev: ev.map((e) => ({ k: e.kind, i: e.isl.id, x: e.x, z: e.z })) };
  };
  const a = run(); const b = run();
  ok(same(a, b) && a.deeds.length >= 4, 'two identical runs give identical deeds and events');
}

// Note: 9) elder teaching
{
  const w = mkWorld(); const [A, B] = isls(w);
  const elder = mkFolk(w, A, { stage: 'elder', age: AGE.elder + 10, talent: { gather: 1.2, craft: 1.5, build: 1.1, porter: 0.8, wonder: 1.0 } });
  const pupil = mkFolk(w, A, { stage: 'adult', age: 2500, talent: { gather: 0.7, craft: 0.7, build: 0.7, porter: 0.7, wonder: 0.7 } });
  const before = JSON.stringify(elder.talent);
  const t = elderTeach(w, elder, pupil);
  ok(t && t.key === 'craft' && Math.abs(pupil.talent.craft - 0.75) < 1e-9 && t.type === 'teach' && t.isl === A, 'the elder teaches the talent with the largest gap');
  ok(elderTeach(w, elder, pupil) === null, 'a cooldown blocks an immediate second lesson');
  w.time += TEACH_COOLDOWN + 1;
  ok(elderTeach(w, elder, pupil) !== null, 'a lesson follows after the cooldown');
  // Note: bounded: thousands of attempts never lift a learner above the elder or the cap.
  let lessons = 0;
  for (let k = 0; k < 5000; k++) {
    w.time += TEACH_COOLDOWN + 1;
    if (elderTeach(w, elder, pupil)) lessons++;
    for (const key of TALENTS) if (pupil.talent[key] > Math.min(TALENT_CAP, Math.max(elder.talent[key], 0.7)) + 1e-9) { ok(false, `talent ${key} above the elder`); k = 1e9; }
  }
  ok(lessons > 3 && lessons <= 100, `lessons are finite (${lessons})`);
  ok(JSON.stringify(elder.talent) === before, 'the elder never loses a talent');
  ok(pupil.talent.craft <= 1.5 + 1e-9 && pupil.talent.gather <= 1.2 + 1e-9 && pupil.talent.porter === 0.7 && pupil.talent.wonder === 1.0, 'talents stop at the elder level; weak ones are not taught');
  w.time += TEACH_COOLDOWN + 1;
  ok(elderTeach(w, elder, pupil) === null, 'nothing left to teach returns null');
  // Note: caps and eligibility
  const grand = mkFolk(w, A, { stage: 'elder', talent: { gather: 2.4, craft: 0.5, build: 0.5, porter: 0.5, wonder: 0.5 } });
  const kid = mkFolk(w, A, { stage: 'child', age: 100, talent: { gather: 1.55, craft: 1, build: 1, porter: 1, wonder: 1 } });
  elderTeach(w, grand, kid);
  ok(kid.talent.gather <= TALENT_CAP + 1e-9, 'the learner is capped at 1.6 even from an over-skilled elder');
  const weak = mkFolk(w, A, { stage: 'elder', talent: { gather: 0.9, craft: 0.9, build: 0.9, porter: 0.9, wonder: 0.9 } });
  ok(elderTeach(w, weak, mkFolk(w, A, { stage: 'child', talent: { gather: 0.7 } })) === null, 'an elder without a strong talent teaches nothing');
  ok(elderTeach(w, pupil, kid) === null && elderTeach(w, elder, elder) === null, 'only elders teach, nobody teaches self');
  ok(elderTeach(w, grand, mkFolk(w, A, { stage: 'elder', talent: { gather: 0.5 } })) === null, 'elders are not learners');
  ok(elderTeach(w, grand, mkFolk(w, B, { stage: 'child', age: 5, talent: { gather: 0.5 } })) === null, 'learner on another island is refused');
  // Note: bench pick
  const w2 = mkWorld(); const [P] = isls(w2); nextId = 100;
  const el = mkFolk(w2, P, { stage: 'elder', talent: { gather: 1.4, craft: 1.4, build: 1.4, porter: 1.4, wonder: 1.4 } });
  const old = mkFolk(w2, P, { stage: 'adult', age: YOUNG_AGE + 500, talent: { gather: 0.5, craft: 0.5, build: 0.5, porter: 0.5, wonder: 0.5 } });
  const far = mkFolk(w2, P, { stage: 'child', age: 50, talent: { gather: 0.7, craft: 0.7, build: 0.7, porter: 0.7, wonder: 0.7 } });
  const own = mkFolk(w2, P, { stage: 'child', age: 60, pars: [el.id, 999], talent: { gather: 1.3, craft: 1.3, build: 1.3, porter: 1.3, wonder: 1.3 } });
  const ev = legacyEvent(w2, { type: 'tierjob', isl: P, f: el, kind: 'C' });
  ok(ev.length === 1 && ev[0].type === 'teach' && ev[0].learner === own, 'at a bench the elder teaches own kin first');
  ok(old.talent.gather === 0.5, 'a grown adult is not taught');
  ok(legacyEvent(w2, { type: 'tierjob', isl: P, f: el, kind: 'C' }).length === 0, 'the bench cooldown holds');
  w2.time += TEACH_COOLDOWN + 1;
  ok(legacyEvent(w2, { type: 'tierjob', isl: P, f: el, kind: 'S' }).length === 0, 'only bench sessions teach');
  ok(legacyEvent(w2, { type: 'tierjob', isl: P, f: far, kind: 'C' }).length === 0, 'only elders teach at a bench');
  const e2 = legacyEvent(w2, { type: 'tierjob', isl: P, f: el, kind: 'C' });
  ok(e2.length === 1 && e2[0].learner === own, 'own kin stay first while they still have a gap');
  w2.time += TEACH_COOLDOWN + 1;
  for (const k of TALENTS) own.talent[k] = 1.4;
  const e3 = legacyEvent(w2, { type: 'tierjob', isl: P, f: el, kind: 'C' });
  ok(e3.length === 1 && e3[0].learner === far, 'once kin have no gap the next lesson goes to the largest gap');
  w2.time -= TEACH_COOLDOWN + 1;
  ok(elderTeachAt(w2, P, el) === null, 'the cooldown also holds in elderTeachAt');
  ok(legacyEvent(w2, { type: 'gathered' }).length === 0 && legacyEvent(w2, { type: 'tierjob', kind: 'C' }).length === 0, 'unrelated or incomplete events are ignored');
}

console.log(failures ? `garden-legacy-check: ${failures} failure(s)` : 'garden-legacy-check: ok');
process.exit(failures ? 1 : 0);
