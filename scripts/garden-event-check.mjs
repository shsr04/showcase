// Note: node check for the rare event deck (events.js); run from the repo root with `node scripts/garden-event-check.mjs [seeds] [years]`.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { DAY_LENGTH, SIM_DT } = await import('../public/garden/js/config.js');
const EV = await import('../public/garden/js/events.js');

const seeds = Number(process.argv[2] || 3);
const years = Number(process.argv[3] || 2);
const YEAR = 12 * DAY_LENGTH;
let failures = 0;
const fail = (m) => { failures++; if (failures <= 20) console.error('FAIL:', m); };
const ok = (c, m) => { if (!c) fail(m); };

// Note: a real World, then the story pieces the deck needs: a couple, a child, an airdock and a roofed building with props.
function build(seed, opts = {}) {
  rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seed);
  for (let k = 0; k < 150; k++) w.step(0.1);
  const home = w.getIsland(0, 0);
  const folk = [...w.folk].sort((a, b) => a.id - b.id);
  for (const f of folk) { f.stage = 'adult'; f.partner = null; }
  if (opts.couple !== false) { folk[0].partner = folk[1].id; folk[1].partner = folk[0].id; }
  if (opts.child !== false) folk[2].stage = 'child';
  if (opts.dock !== false) home.buildings.push({ id: 'airdock', x: 1, y: 1, size: 3, built: true, flourish: 0, door: { i: 1, j: 4 } });
  if (opts.lookout) home.buildings.push({ id: 'lookout', x: 20, y: 20, size: 1, built: true, flourish: 0, door: { i: 20, j: 21 } });
  for (let k = 0; k < 4; k++) home.buildings.push({ id: 'hut', x: 2 + k, y: 18, size: 2, built: true, flourish: 4, level: 0, door: { i: 2, j: 20 } });
  home.rung = opts.rung ?? 4;
  w.events.length = 0;
  w.time = 0; // Note: the deck runs on its own clock in this check.
  return w;
}

const snapshot = (w) => JSON.stringify({ folk: w.folk.map((f) => [f.id, f.isle, f.stage, f.partner, f.home, f.age]), b: [...w.islands.values()].map((i) => i.buildings.map((b) => b && [b.id, b.built, b.gone, b.level, b.flourish])), stock: [...w.islands.values()].map((i) => i.stock) });

function finite(o, path = '') {
  if (typeof o === 'number') { if (!Number.isFinite(o)) fail(`non finite ${path}`); return; }
  if (o && typeof o === 'object') for (const k of Object.keys(o)) finite(o[k], `${path}.${k}`);
}

// Note: runs the deck for a span; returns the event log with times.
function run(w, from, to, log, dt = SIM_DT, hooks = {}) {
  // Note: integer step index keeps the clock identical between a straight run and a resumed one.
  for (let k = Math.ceil(from / dt - 1e-9); k * dt < to; k++) {
    const t = k * dt;
    w.time = t;
    const out = EV.stepDeck(w, dt);
    for (const e of out) { log.push({ t: Math.round(t * 10) / 10, ...JSON.parse(JSON.stringify(e)) }); finite(e, e.type); }
    if (hooks.each) hooks.each(t, out);
  }
}

function analyse(log, tag, expectKinds) {
  const starts = log.filter((e) => e.type === 'event' && e.phase === 'start');
  const ends = log.filter((e) => e.type === 'event' && e.phase === 'end');
  ok(starts.length >= 5 * years / 2 && starts.length <= 6 * years, `${tag}: ${starts.length} events in ${years} years`);
  ok(starts.length - ends.length <= 1 && starts.length >= ends.length, `${tag}: starts ${starts.length} ends ${ends.length}`);
  let active = null;
  for (const e of log) {
    if (e.type === 'omen' && !e.cancelled) {
      ok(e.at - e.t >= EV.OMEN_LEAD - 0.01 && e.at - e.t <= EV.OMEN_LEAD + 0.5, `${tag}: omen lead ${e.at - e.t}`);
    }
    if (e.type === 'event' && e.phase === 'start') {
      const om = [...log].reverse().find((o) => o.type === 'omen' && !o.cancelled && o.kind === e.kind && o.t <= e.t);
      ok(om && Math.abs(om.at - e.t) < 0.3, `${tag}: ${e.kind} start has no omen`);
      ok(e.t - om.t >= EV.OMEN_LEAD - 0.5 && e.t - om.t <= EV.OMEN_LEAD + 0.5, `${tag}: omen ${e.t - om.t}s before ${e.kind}`);
      ok(!active, `${tag}: ${e.kind} started over ${active}`);
      active = e.kind;
      const def = EV.EVENT_DEF[e.kind];
      ok(e.until - e.t >= def.dur[0] - 0.2 && e.until - e.t <= def.dur[1] + 0.2, `${tag}: ${e.kind} duration ${e.until - e.t}`);
      ok(e.kind !== 'aurora', `${tag}: aurora in the regular deck`);
    }
    if (e.type === 'event' && e.phase === 'end') { ok(active === e.kind, `${tag}: end of ${e.kind} while ${active}`); if (!EV.EVENT_DEF[e.kind].damage) active = null; }
    if (e.type === 'aftermath' && e.phase === 'done') active = null;
  }
  for (const k of expectKinds.absent || []) ok(!starts.some((e) => e.kind === k), `${tag}: ${k} must not occur`);
  return starts;
}

const allKinds = new Set();
for (let s = 0; s < seeds; s++) {
  const seed = `EVT-${s}`;
  // Note: two runs of one seed must give the same log, and the sim state must stay untouched.
  const logs = [];
  let before = '';
  for (let r = 0; r < 2; r++) {
    const w = build(seed);
    before = snapshot(w);
    const log = [];
    run(w, 0, years * YEAR, log);
    ok(snapshot(w) === before, `${seed}: deck changed folk, buildings or stock`);
    logs.push(JSON.stringify(log));
    if (r === 0) {
      const starts = analyse(log, seed, {});
      for (const e of starts) allKinds.add(e.kind);
      // Note: every season of the first year sees about one event: no season is empty for a whole year pair.
      const per = [0, 0, 0, 0];
      for (const e of starts) per[Math.min(3, Math.floor((e.t % YEAR) / (3 * DAY_LENGTH)))]++;
      ok(per.every((n) => n >= 1), `${seed}: a season never had an event ${per}`);
      // Note: storms that ended have damage data of the right shape.
      for (const e of log.filter((x) => x.type === 'aftermath' && x.phase === 'begin')) {
        for (const d of e.damage) ok(typeof d.isl === 'string' && Number.isInteger(d.b) && (d.part === 'roof' || (d.part === 'prop' && 'SCW'.includes(d.prop))), `${seed}: bad damage ${JSON.stringify(d)}`);
        ok(e.repair >= 100 && e.repair <= 160, `${seed}: repair ${e.repair}`);
      }
      console.log(`${seed}: ${starts.length} events ${starts.map((e) => e.kind[0] + e.kind[1]).join(' ')} omens ${log.filter((e) => e.type === 'omen').length}`);
    }
  }
  ok(logs[0] === logs[1], `${seed}: not deterministic`);

  // Note: save roundtrip: a deck cloned at an omen, mid event and mid repair continues with the same events.
  const w = build(seed);
  const log = [];
  const snaps = [];
  run(w, 0, YEAR, log, SIM_DT, {
    each: (t) => {
      const d = w.deck;
      if (!snaps.some((x) => x.tag === 'omen') && d.omen) snaps.push({ tag: 'omen', t, deck: JSON.stringify(d) });
      if (!snaps.some((x) => x.tag === 'active') && d.active && !d.active.data.phase) snaps.push({ tag: 'active', t, deck: JSON.stringify(d) });
      if (!snaps.some((x) => x.tag === 'after') && d.active && d.active.data.phase === 'after') snaps.push({ tag: 'after', t, deck: JSON.stringify(d) });
    },
  });
  ok(snaps.length >= 2, `${seed}: only ${snaps.length} snapshots`);
  for (const sn of snaps) {
    const a = build(seed); const b = build(seed);
    a.deck = JSON.parse(sn.deck); b.deck = EV.normalizeDeck(b, JSON.parse(JSON.stringify(a.deck)));
    const la = []; const lb = [];
    run(a, sn.t + SIM_DT, sn.t + 2500, la); run(b, sn.t + SIM_DT, sn.t + 2500, lb);
    ok(JSON.stringify(la) === JSON.stringify(lb) && la.length > 0, `${seed}: roundtrip from ${sn.tag} diverged (${la.length}/${lb.length})`);
    // Note: the original run saw the same events after the snapshot.
    const orig = log.filter((e) => e.t > sn.t && e.t < sn.t + 2500);
    ok(JSON.stringify(orig) === JSON.stringify(la.filter((e) => e.t > sn.t)), `${seed}: restore differs from the straight run at ${sn.tag}`);
  }
}
ok(allKinds.size >= 5, `kinds seen ${[...allKinds]}`);
console.log('kinds', [...allKinds].join(','));

// Note: eligibility: no couple, child or dock means no wedding, lost child or ship.
{
  const w = build('EVT-E', { couple: false, child: false, dock: false });
  const log = []; run(w, 0, 3 * YEAR, log);
  const kinds = new Set(log.filter((e) => e.type === 'event' && e.phase === 'start').map((e) => e.kind));
  for (const k of ['wedding', 'lostchild', 'rareship']) ok(!kinds.has(k), `ineligible ${k} occurred`);
  ok(kinds.size >= 3, `ineligible world still runs events ${[...kinds]}`);
  // Note: an empty world with no buildings has no storm either, and the deck simply waits.
  const e = build('EVT-E2', { couple: false, child: false, dock: false });
  for (const i of e.islands.values()) i.buildings.length = 0;
  const l2 = []; run(e, 0, YEAR, l2);
  ok(!l2.some((x) => x.type === 'event' && x.kind === 'storm'), 'storm without buildings');
}

// Note: a lost child is found early when a lookout stands, and late otherwise.
for (const lookout of [false, true]) {
  const w = build('EVT-L', { lookout });
  const log = []; run(w, 0, 6 * YEAR, log);
  const ends = log.filter((e) => e.type === 'event' && e.kind === 'lostchild' && e.phase === 'end');
  ok(ends.length > 0, `no lost child (lookout ${lookout})`);
  for (const e of ends) ok(e.data.outcome === (lookout ? 'found' : 'late'), `lostchild outcome ${e.data.outcome} lookout ${lookout}`);
}

// Note: a storm: relief 1 removes all damage, none leaves some; homeless timers pause until the repair is done.
{
  const w = build('EVT-S');
  const home = w.getIsland(0, 0);
  const mk = (relief) => { w.deck = EV.initDeck({ time: 0, seed: 5, islands: w.islands, folk: w.folk }); w.time = 0; w.deck.active = { kind: 'storm', until: 1, data: { isls: [home.id], cells: [], relief: { [home.id]: relief }, phase: 'run' } }; w.deck.next = 1e9; };
  let hit = 0;
  for (let k = 0; k < 40; k++) {
    mk(0); w.time = 2; w.deck.rng = k + 1;
    const out = EV.stepDeck(w, 0.1);
    const am = out.find((e) => e.type === 'aftermath');
    ok(am && am.phase === 'begin', 'storm aftermath begin');
    hit += am ? am.damage.length : 0;
    ok(out.pauseHomeless === true && EV.homelessPaused(w), 'homeless paused during repair');
    w.time = 2 + am.repair + 1;
    const out2 = EV.stepDeck(w, 0.1);
    ok(out2.some((e) => e.type === 'aftermath' && e.phase === 'done') && out2.pauseHomeless === false && !EV.homelessPaused(w), 'repair done releases the flag');
    mk(0); w.time = 0.5; EV.relieve(w, home.id, 0.6); EV.relieve(w, home.id, 0.6);
    ok(w.deck.active.data.relief[home.id] === 1, 'relief caps at 1');
    w.time = 2;
    const o3 = EV.stepDeck(w, 0.1).find((e) => e.type === 'aftermath');
    ok(o3 && o3.damage.length === 0, 'relief 1 leaves no damage');
  }
  ok(hit > 0, 'storms never damaged anything');
  ok(EV.relieve(w, 'nowhere', 1) === 0, 'relieve on a wrong island');
}

// Note: aurora only on occasion; it ends within 150 s and is not repeated at once.
{
  const w = build('EVT-A');
  const log = [];
  let asked = 0;
  run(w, 0, YEAR, log, SIM_DT, { each: (t) => { if (t > 2000 && !asked && !w.deck.omen && !w.deck.active) { const ev = EV.occasion(w, 'aurora'); ok(ev && ev.type === 'omen' && ev.at === w.time + EV.OMEN_LEAD, 'occasion returns the omen'); asked = t; if (ev) log.push({ t, ...ev }); } } });
  const st = log.filter((e) => e.kind === 'aurora' && e.phase === 'start');
  const en = log.filter((e) => e.kind === 'aurora' && e.phase === 'end');
  ok(asked && st.length === 1 && en.length === 1, `aurora on occasion: ${st.length}/${en.length}`);
  ok(en[0] && en[0].t - st[0].t <= 150.3, 'aurora is not permanent');
  ok(EV.occasion(w, 'comet') === null, 'comet is not an occasion kind');
  w.deck.omen = null; w.deck.active = null;
  ok(EV.occasion(w, 'aurora') === null, 'aurora twice in a row refused');
}

// Note: old saves: no deck, a partial deck and garbage all normalise.
{
  const w = build('EVT-O');
  w.deck = undefined; ok(EV.initDeck(w).next > 0 && Array.isArray(w.deck.last), 'no deck');
  w.deck = { next: 99, omen: { kind: 'bogus', at: 1 }, active: { kind: 'comet' }, last: ['comet', 'x'] };
  EV.initDeck(w);
  ok(w.deck.omen === null && w.deck.active === null && w.deck.last.length === 1 && w.deck.next === 99 && Number.isInteger(w.deck.rng), 'partial deck');
  const j = JSON.stringify(w.deck); EV.initDeck(w); ok(JSON.stringify(w.deck) === j, 'initDeck idempotent');
  ok(EV.stepDeck(w, NaN).length === 0, 'NaN dt is ignored');
}

console.log(failures ? `${failures} failures` : 'all ok');
process.exit(failures ? 1 : 0);
