// Note: season clock, save/restore, effect bounds, archetype festivals and determinism checks.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-season-check.mjs [seeds=3] [years=2]
// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports; runs replay exactly.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = pathToFileURL(path.join(root, 'public/garden/vendor/three.module.js')).href;
const hook = `export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(s, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const THREE = await import('three');
const cfg = await J('config.js');
const { World, seasonWeights, seasonInfo, festivalDay, growMuls } = await J('world.js');
const { ARCH_IDS, festivalPlace } = await J('art.js');
const { storehouse } = await J('econ.js');
const { WorldView } = await J('view.js');
const { makeFestivalSet } = await J('festival.js');
const { Sky } = await J('sky.js');
const { Fx } = await J('fx.js');
const { OrbitCamera } = await J('camera.js');
const { SEASON_IDS, SEASON_LEN, YEAR_LEN, SEASON_DAYS, SEASON_FESTIVAL, SEASON_WINTER_FOOD, DAY_LENGTH, SEASON_FEST_LEN } = cfg;

const seeds = Number(process.argv[2] || 3);
const years = Number(process.argv[3] || 2);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };
const DT = 0.1;
const step = (w, secs, on) => { for (let t = 0; t < secs; t += DT) { w.step(DT); if (on) on(w); else w.events.length = 0; } };
const adults = (w, isl) => w.folkOn(isl.id).filter((f) => f.stage === 'adult');
const eligible = (w, arch) => [...w.islands.values()].some((i) => i.revealed && i.arch === arch && i.rung >= 2 && !i.festival && storehouse(i) && adults(w, i).length >= 2);

// 1. Clock: info, weights, advance, wrap.
{
  ok(YEAR_LEN === 4 * SEASON_DAYS * DAY_LENGTH && SEASON_DAYS === 3, 'year = 4 seasons x 3 days');
  for (let t = 0; t < YEAR_LEN; t += 7.3) {
    const k = seasonWeights(t);
    const sum = k.reduce((a, b) => a + b, 0);
    ok(Math.abs(sum - 1) < 1e-6 && k.every((x) => x >= 0 && x <= 1), `weights at ${t}: ${k}`);
    const k2 = seasonWeights(t + 1);
    ok(k.every((x, n) => Math.abs(x - k2[n]) < 0.01), `weights jump at ${t}`);
    const m = growMuls(k);
    ok(m.crop >= 0.5 - 1e-6 && m.crop <= 1.4 + 1e-6 && m.other >= 0.6 - 1e-6 && m.other <= 1.2 + 1e-6, `grow muls out of bounds at ${t}`);
  }
  ok(seasonWeights(SEASON_LEN / 2)[0] === 1 && seasonWeights(1.5 * SEASON_LEN)[1] === 1 && seasonWeights(3.5 * SEASON_LEN)[3] === 1, 'season centres are pure');
  ok(seasonInfo(0).id === 'spring' && seasonInfo(SEASON_LEN).id === 'summer' && seasonInfo(2 * SEASON_LEN + 1).id === 'autumn' && seasonInfo(YEAR_LEN - 1).id === 'winter', 'season ids');
  ok(seasonInfo(DAY_LENGTH * 2 + 1).day === 2 && seasonInfo(SEASON_LEN + 1).day === 0, 'season days');
  const w = World.createNew('SKY-1000');
  ok(w.season.t === 0 && w.season.year === 0, 'fresh world starts spring day 0');
  step(w, 20, (x) => { x.events.length = 0; });
  ok(Math.abs(w.season.t - 20) < 0.01, `clock advances: ${w.season.t}`);
  let ev = [];
  w.setSeasonClock(SEASON_LEN - 0.25);
  step(w, 1, (x) => { ev.push(...x.events); x.events.length = 0; });
  ok(ev.some((e) => e.type === 'season' && e.season === 'summer' && e.year === 0), 'season event on change');
  ok(ev.filter((e) => e.type === 'season').length === 1, 'one season event');
  ev = [];
  w.season.done = ['weavers'];
  w.setSeasonClock(YEAR_LEN - 0.25);
  step(w, 1, (x) => { ev.push(...x.events); x.events.length = 0; });
  ok(w.season.year === 1 && w.season.t < 1 && w.season.done.length === 0, `year wraps: year ${w.season.year} t ${w.season.t}`);
  ok(ev.some((e) => e.type === 'season' && e.season === 'spring' && e.year === 1), 'spring event on wrap');
}

// 2. Save and restore, old save default.
{
  const w = World.createNew('SKY-1001');
  step(w, 30);
  w.season.done = ['weavers'];
  w.setSeasonClock(2500, 3);
  w.season.done = ['weavers'];
  const j = JSON.parse(JSON.stringify(w.toJSON()));
  ok(j.season && j.season.t === w.season.t && j.season.year === 3, 'toJSON carries season');
  const r = World.fromJSON(j);
  ok(Math.abs(r.season.t - 2500) < 1e-6 && r.season.year === 3 && r.season.done.join() === 'weavers', 'season restored');
  ok(r.seasonIdx === seasonInfo(2500).idx && Math.abs(r.seasonK[seasonInfo(2500).idx] - seasonWeights(2500)[seasonInfo(2500).idx]) < 1e-9, 'season index and weights restored');
  delete j.season;
  const old = World.fromJSON(j);
  ok(old.season.t === 0 && old.season.year === 0 && old.seasonIdx === 0, 'old save defaults to spring day 0');
  step(old, 5);
}

// 3. Determinism of the festival day (pure function of seed, archetype, year).
{
  for (const arch of ARCH_IDS) for (let y = 0; y < 8; y++) {
    const a = festivalDay(World.createNew('SKY-1002').seed, arch, y); const b = festivalDay(World.createNew('SKY-1002').seed, arch, y);
    ok(a === b && a >= 0 && a < SEASON_DAYS, `festival day ${arch} y${y}: ${a} vs ${b}`);
  }
  const days = new Set();
  for (const s of ['SKY-1', 'SKY-2', 'SKY-3', 'SKY-4', 'SKY-5', 'SKY-6']) for (const arch of ARCH_IDS) days.add(festivalDay(World.createNew(s).seed, arch, 0));
  ok(days.size > 1, 'festival days vary by seed');
}

// 4. Forced festivals: one per archetype per year, on its season and day, deterministic across two worlds.
function prelude(seed) {
  const w = World.createNew(seed);
  let n = 0;
  while (n++ < 4000 && !(storehouse(w.getIsland(0, 0)) && adults(w, w.getIsland(0, 0)).length >= 2)) step(w, 5);
  return w;
}
function forced(seed) {
  const w = prelude(seed);
  const home = w.getIsland(0, 0);
  const log = [];
  let guestsSeen = 0; let guestMax = 0;
  for (let y = 0; y < 2; y++) {
    w.season.done = [];
    for (const arch of ARCH_IDS) {
      const si = SEASON_FESTIVAL[arch];
      const fd = festivalDay(w.seed, arch, y);
      home.arch = arch; home.rung = Math.max(home.rung, 3); home.festival = null;
      // Note: the day before the festival day, at dusk, nothing may happen.
      if (fd > 0) {
        w.setSeasonClock(si * SEASON_LEN + (fd - 1) * DAY_LENGTH + 10, y);
        w.season.done = w.season.done.filter((a) => a !== arch);
        w.todShift = ((0.65 - (w.time / DAY_LENGTH + 0.3)) % 1 + 1) % 1;
        let early = 0;
        step(w, 30, (x) => { for (const e of x.events) if (e.type === 'festival' && e.seasonal && e.arch === arch) early++; x.events.length = 0; });
        ok(early === 0, `${seed} ${arch} festival early on day ${fd - 1} (festival day ${fd})`);
        ok(!w.season.done.includes(arch), `${seed} ${arch} marked done early`);
      }
      w.setSeasonClock(si * SEASON_LEN + fd * DAY_LENGTH + 10, y);
      w.todShift = ((0.65 - (w.time / DAY_LENGTH + 0.3)) % 1 + 1) % 1;
      home.festival = null;
      let n = 0; let first = null;
      step(w, 40, (x) => {
        for (const e of x.events) if (e.type === 'festival' && e.seasonal && e.arch === arch) { n++; first ||= { arch, y, day: seasonInfo(x.season.t).day, season: e.season }; }
        x.events.length = 0;
      });
      ok(n === 1, `${seed} ${arch} y${y}: ${n} festivals`);
      if (first) {
        ok(first.season === SEASON_IDS[si], `${seed} ${arch} festival in ${first.season}`);
        ok(first.day === fd, `${seed} ${arch} festival day ${first.day} != ${fd}`);
        log.push(`${first.arch}/${first.y}/${first.day}`);
      }
      const f = home.festival;
      ok(f && f.arch === arch && f.season && f.s === si && f.t > 0 && f.t <= SEASON_FEST_LEN, `${seed} ${arch} host festival state`);
      for (const g of w.folk) if (g.guestOf) { guestsSeen++; ok(g.guestOf.host === home.id && g.guestOf.home !== home.id, `${seed} guest links`); }
      guestMax = Math.max(guestMax, w.folkOn(home.id).length);
      // Note: a second pass in the same season must not start another one.
      let again = 0;
      home.festival = null;
      step(w, 40, (x) => { for (const e of x.events) if (e.type === 'festival' && e.seasonal && e.arch === arch) again++; x.events.length = 0; });
      ok(again === 0, `${seed} ${arch} second festival in one season`);
    }
  }
  // Note: let everything settle; guests must be home and nobody stuck.
  home.festival = null;
  step(w, 420);
  const stuck = w.folk.filter((f) => f.guestOf && f.guestOf.home !== f.isle && !(f.task && f.task.type === 'festival') && !f.queue);
  ok(stuck.length === 0, `${seed} ${stuck.length} guests stranded`);
  step(w, 200);
  const away = w.folk.filter((f) => f.guestOf);
  ok(away.length <= 1, `${seed} guests still marked after the party: ${away.length}`);
  for (const i of w.revealedIslands()) ok(w.folkOn(i.id).length <= 8 + 6, `${seed} island ${i.id} holds ${w.folkOn(i.id).length}`);
  for (const f of w.folk) ok(Number.isFinite(f.x) && Number.isFinite(f.z), `${seed} folk ${f.id} finite`);
  return { log, guestsSeen, guestMax, links: w.links.filter((l) => l.state === 'done').length };
}
{
  const a = forced('SKY-1003');
  const b = forced('SKY-1003');
  ok(a.log.length === 8 && a.log.join() === b.log.join(), `forced festival days deterministic: ${a.log.join(' ')} | ${b.log.join(' ')}`);
  console.log(`forced festivals: ${a.log.join(' ')} guests seen ${a.guestsSeen}/${b.guestsSeen} peak on host ${a.guestMax} links ${a.links}`);
}

// 4b. Guests: neighbours walk over a finished link, dance, and walk home again.
{
  const { applyTool } = await J('sim.js');
  const { cidx } = await J('island.js');
  const { computeAnchors } = await J('links.js');
  const w = World.createNew('SKY-1001');
  const home = w.getIsland(0, 0);
  for (let t = 0; t < 33000; t++) {
    const min = t / 600;
    if (Math.abs(min - 1) < 0.01) { for (let j = 0; j < cfg.N; j++) for (let i = 0; i < cfg.N; i++) if (home.dep[cidx(i, j)] === 1) { for (let k = 0; k < 40; k++) applyTool(w, home, 'dig', i + 0.5, j + 0.5, 4.5, 0.3); break; } }
    if (min > 2 && min < 6 && t % 5 === 0) {
      let best = null;
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = computeAnchors(home, w.getIsland(x, z)); if (a && (!best || a.gap < best.gap)) best = a; }
      if (best) applyTool(w, home, 'water', best.ai.i + 0.5, best.ai.j + 0.5, 3, 0.3);
    }
    w.step(DT); w.events.length = 0;
  }
  let pair = null;
  for (const l of w.links) {
    if (l.state !== 'done' || pair) continue;
    for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) {
      const H = w.islands.get(a); const G = w.islands.get(b);
      if (!pair && H.revealed && G.revealed && storehouse(H) && storehouse(G) && adults(w, H).length >= 2 && adults(w, G).length >= 2) pair = { H, G, l };
    }
  }
  if (!pair) console.log('guest test skipped: no linked pair with two adults each');
  else {
    const { H, G } = pair;
    H.arch = 'carvers'; H.rung = Math.max(H.rung, 3); H.festival = null;
    const fd = festivalDay(w.seed, 'carvers', w.season.year);
    w.season.done = [];
    w.setSeasonClock(3 * SEASON_LEN + fd * DAY_LENGTH + 10);
    w.todShift = ((0.65 - (w.time / DAY_LENGTH + 0.3)) % 1 + 1) % 1;
    const gAdults = adults(w, G).length + adults(w, H).length;
    let hostId = null; let invited = 0; const asked = new Set(); let arrived = new Set(); let danced = new Set(); let peak = 0; let capBad = 0;
    step(w, 220, (x) => {
      for (const e of x.events) if (e.type === 'festival' && e.seasonal) { invited++; hostId = e.isl.id; }
      x.events.length = 0;
      for (const f of x.folk) if (f.guestOf && f.guestOf.host === hostId) {
        asked.add(f.id);
        if (f.isle === hostId) arrived.add(f.id);
        if (f.isle === hostId && f.task && f.task.type === 'festival' && f.task.phase === 'dance') danced.add(f.id);
      }
      peak = Math.max(peak, hostId ? x.folkOn(hostId).length : 0);
      const resident = (f) => !f.guestOf && !(f.task && (f.task.type === 'trade' || (f.task.type === 'cross' && !f.task.settle)));
      if (hostId && x.folkOn(hostId).filter(resident).length > 8) capBad++;
    });
    ok(invited >= 1, 'guest scenario: festival started');
    // Note: only idle adults are asked when the festival starts, so a visit is expected only if somebody was asked.
    ok(arrived.size >= 1 || asked.size === 0, `guest scenario: ${arrived.size} guests arrived of ${asked.size} asked (${gAdults} adults)`);
    ok(danced.size >= 1 || arrived.size === 0, `guest scenario: ${danced.size} danced`);
    ok(capBad === 0, 'guest scenario: residents over cap');
    H.festival = null;
    step(w, 260);
    const left = w.folk.filter((f) => f.guestOf);
    ok(left.length === 0, `guest scenario: ${left.length} guests never went home [${left.map((f) => `${f.isle}->${f.guestOf.home} ${f.task ? f.task.type + ':' + f.task.phase : '-'}`).join(', ')}]`);
    ok(w.folk.every((f) => Number.isFinite(f.x) && Number.isFinite(f.z)), 'guest scenario: finite positions');
    console.log(`guest scenario: adults on both ends ${gAdults}, arrived ${arrived.size}, danced ${danced.size}, host peak ${peak}, still away ${left.length}`);
  }
}

// 5. Long natural runs: no winter starvation, only age kills, one festival per season per archetype that exists.
for (let s = 0; s < seeds; s++) {
  const seed = `SKY-${2000 + s}`;
  const w = World.createNew(seed);
  const t0 = performance.now();
  const fests = [];
  let minFoodWinter = 9; let winterSteps = 0; let deaths = 0; let badDeaths = 0; let lastDayElig = {}; const streak = {};
  const total = years * YEAR_LEN;
  let steps = 0;
  const seasonNow = { idx: 0, year: 0 };
  step(w, total, (x) => {
    steps++;
    for (const e of x.events) {
      if (e.type === 'festival' && e.seasonal) fests.push(`${e.arch}/${e.year}/${e.season}`);
      if (e.type === 'pass') { deaths++; if (!(e.f.age > e.f.passAt)) badDeaths++; }
    }
    x.events.length = 0;
    const info = seasonInfo(x.season.t);
    if (steps % 10 === 0) {
      const win = x.seasonK[3];
      if (win > 0.5) {
        winterSteps++;
        for (const f of x.folk) minFoodWinter = Math.min(minFoodWinter, f.needs.food / (SEASON_WINTER_FOOD * win));
      }
      // Note: only a host eligible for 20 s straight on the last day must have celebrated.
      for (const arch of ARCH_IDS) {
        const key = `${arch}/${x.season.year}`;
        if (info.day === SEASON_DAYS - 1 && SEASON_FESTIVAL[arch] === info.idx && eligible(x, arch)) { streak[key] = (streak[key] || 0) + 1; if (streak[key] >= 20) lastDayElig[key] = true; } else streak[key] = 0;
      }
      for (const i of x.revealedIslands()) {
        for (let c = 0; c < i.grow.length; c++) if (!(i.grow[c] >= 0) || !Number.isFinite(i.grow[c])) { ok(false, `${seed} grow ${i.grow[c]}`); return; }
      }
    }
    seasonNow.idx = info.idx; seasonNow.year = x.season.year;
  });
  const counts = {};
  for (const f of fests) counts[f] = (counts[f] || 0) + 1;
  ok(Object.values(counts).every((n) => n === 1), `${seed} duplicate festivals ${JSON.stringify(counts)}`);
  for (const k of Object.keys(lastDayElig)) ok(counts[`${k.split('/')[0]}/${k.split('/')[1]}/${SEASON_IDS[SEASON_FESTIVAL[k.split('/')[0]]]}`] === 1, `${seed} ${k} was eligible but never celebrated`);
  ok(minFoodWinter >= 1 - 1e-6 || winterSteps === 0, `${seed} winter food floor broken: ${minFoodWinter}`);
  ok(badDeaths === 0, `${seed} ${badDeaths} deaths before old age`);
  ok(w.folk.length >= 3, `${seed} population collapsed: ${w.folk.length}`);
  ok(w.season.year === years || w.season.year === years - 1, `${seed} year ${w.season.year}`);
  console.log(`${seed}: ${years}y folk=${w.folk.length} deaths=${deaths} winterSamples=${winterSteps} minWinterFood=${(minFoodWinter * SEASON_WINTER_FOOD).toFixed(2)} festivals=[${fests.join(' ')}] eligible=[${Object.keys(lastDayElig).join(' ')}] ${(performance.now() - t0).toFixed(0)}ms`);
}

// 6. Growth: spring gains beat summer, summer beats winter (same island, clock frozen).
{
  const base = prelude('SKY-1004');
  step(base, 120);
  const json = JSON.parse(JSON.stringify(base.toJSON()));
  const gain = (clockT) => {
    const w = World.fromJSON(JSON.parse(JSON.stringify(json)));
    const before = new Map();
    for (const i of w.revealedIslands()) for (let c = 0; c < i.grow.length; c++) if (i.plant[c] && i.grow[c] < 0.7) before.set(`${i.id}:${c}`, [i, c, i.plant[c], i.grow[c]]);
    // Note: every season replays the same growth rolls, so the ratios compare the season weights only.
    rs = 4242;
    for (let t = 0; t < 60; t += DT) { w.setSeasonClock(clockT); w.step(DT); w.events.length = 0; }
    let g = 0;
    for (const [i, c, p, g0] of before.values()) if (i.plant[c] === p && i.grow[c] > g0) g += i.grow[c] - g0;
    return { g, n: before.size };
  };
  const mid = (k) => (k + 0.5) * SEASON_LEN;
  const sp = gain(mid(0)); const su = gain(mid(1)); const wi = gain(mid(3));
  console.log(`growth gain 60s: spring ${sp.g.toFixed(3)} summer ${su.g.toFixed(3)} winter ${wi.g.toFixed(3)} (${sp.n} young plants)`);
  if (su.g > 0.05) {
    ok(sp.g > su.g * 1.05, `spring grows faster: ${sp.g} vs ${su.g}`);
    ok(wi.g < su.g * 0.85, `winter grows slower: ${wi.g} vs ${su.g}`);
  } else console.log('  skipped growth ratio (no growing plants)');
}

// 7. Render side: every festival set builds, animates and frees; the view runs a festival end to end.
{
  const w = prelude('SKY-1005');
  const home = w.getIsland(0, 0);
  const scene = new THREE.Scene();
  const oc = new OrbitCamera(1.6);
  const sky = new Sky(scene, null, false);
  const fx = new Fx(scene);
  const view = new WorldView(scene, w, fx);
  for (const arch of ARCH_IDS) {
    for (const ball of [false, true]) {
      const fe = { arch, season: true, s: SEASON_FESTIVAL[arch], at: festivalPlace(home), t: 100 };
      const set = makeFestivalSet(home, fe, ball);
      ok(set && set.group && set.ready, `${arch} set builds`);
      if (!set) continue;
      let verts = 0; let meshes = 0;
      set.group.traverse((o) => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position; verts += p.count; for (let q = 0; q < p.array.length; q++) if (!Number.isFinite(p.array[q])) { ok(false, `${arch} NaN vertex`); break; } } });
      ok(verts > 100 && meshes > 0 && meshes < 40, `${arch} set size: ${meshes} meshes ${verts} verts`);
      ok(set.lights.length >= 1 && set.lights.length <= 3 && set.lights.every((l) => [l.x, l.y, l.z, l.base].every(Number.isFinite)), `${arch} lights`);
      const c = { fx, dt: 0.05, near: true, wx: home.wx, wz: home.wz, wind: 0.3, windx: 0.4, windz: 0.1 };
      for (let t = 0; t < 400; t++) set.update(t * 0.05, 1, c);
      set.group.traverse((o) => { if (o.isMesh && o.position) ok([o.position.x, o.position.y, o.position.z].every(Number.isFinite), `${arch} mesh position`); });
      if (set.dispose) set.dispose();
    }
  }
  home.arch = 'carvers'; home.rung = Math.max(home.rung, 3);
  w.setSeasonClock(3 * SEASON_LEN + 5);
  home.festival = { t: 30, at: festivalPlace(home), arch: 'carvers', season: true, s: 3 };
  const v = view.viewOf(home.id);
  let sawSet = 0;
  for (let t = 0; t < 90; t += DT) {
    w.step(DT);
    for (const e of w.events.splice(0)) if (e.type === 'reveal') view.onReveal(e.isl);
    oc.update(DT);
    oc.cam.updateMatrixWorld(); oc.cam.matrixWorldInverse.copy(oc.cam.matrixWorld).invert();
    const haze = sky.update(w, DT, oc.target, oc.cam);
    view.update(DT, oc.target, oc.cam, sky, haze);
    fx.update(DT, oc.cam, 900);
    if (v.fes.length) sawSet = Math.max(sawSet, v.fes.length);
  }
  ok(sawSet === 1, `view built the festival set (${sawSet})`);
  ok(v.fes.length === 0, 'view removed the festival set after the party');
  ok(v.snowT.value > 0.5, `winter snow level on terrain: ${v.snowT.value}`);
  console.log(`view festival ok: sets seen ${sawSet}, snow ${v.snowT.value.toFixed(2)}, lights ${view.lightPool.filter((l) => l.intensity > 0).length}`);
}

console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
