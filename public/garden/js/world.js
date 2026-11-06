// Note: the sky world: islands on a loose grid, folk, links, time, discovery and the fixed-step tick.

import { N, SIM_DT, DAY_LENGTH, SEASON_IDS, SEASON_LEN, YEAR_LEN, SEASON_DAYS, SEASON_GROW, SEASON_FESTIVAL, SEASON_FEST_LEN, SEASON_GUESTS, PLANTS, PLANT_KINDS, KNOWLEDGE, KNOWLEDGE_IDS, START_FOLK, BUILDINGS, LINKS, LINK_IDS, STAIR_MAX, BED_PER_ISLAND_MAX } from './config.js';
import { Island, generateIsland, cidx, inB } from './island.js';
import { hashStr, hash2, clamp } from './rand.js';
import { newWeather, stepWeather, stepIsland } from './sim.js';
import { planIsland, scanResources, scanGaze, storehouse, startBuilding, stockAdd, stockGet, beds, builtOf, live, removeBuilding, cancelBuilding, findSite, findStairSite, awakenIsland, dormantIslands } from './econ.js';
import { createFolk, updateFolk, endTask, stageOf, spawnVisitor } from './folk.js';
import { prepBodies, resolveBodies } from './avoid.js';
import { stepLinks, linkPos, makeLink, linkPoints } from './links.js';
import { planCapital } from './capital.js';
import { planFlight, laneBusy, clearLane } from './flight.js';
import { nearestWalkable, reachMap } from './path.js';
import { updateRung, wearTick, festivalPlace, ARCH_IDS } from './art.js';
import { stepAnimals, topUpAnimals, cargoFor, unloadCargo, animalsToJSON, animalsFromJSON } from './animals.js';
import { slotAt, rareTerrain, knowRelic, relicPlan } from './rareisles.js';
import { newGw, gwToJSON, gwFromJSON, gwDrain } from './greatwork.js';
import { initDeck, stepDeck, homelessPaused, occasion } from './events.js';
import { stepShips, shipsToJSON, shipsFromJSON, visitorFor } from './ships.js';
import { colonyLanded, colonyAborted } from './colony.js';
import { planFleet, selfFed } from './ledger.js';
import { sightingTick } from './sighting.js';
import { legacyEvent, legacyTick, deedsToJSON, deedsFromJSON, recordDeed, deedEvent } from './legacy.js';

const R = Math.random;

// Note: islands that live on shipments stop births and arrivals at three folk.
const SHIPPED_POP = 3;
const popCap = (isl) => (selfFed(isl) ? BED_PER_ISLAND_MAX : Math.min(SHIPPED_POP, BED_PER_ISLAND_MAX));

// Note: season clock helpers; pure functions of the clock seconds, no randomness.
export function seasonWeights(t) {
  const u = ((t % YEAR_LEN) + YEAR_LEN) % YEAR_LEN / SEASON_LEN;
  const w = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    let d = Math.abs(u - (k + 0.5));
    d = Math.min(d, 4 - d);
    const x = clamp((0.75 - d) / 0.5, 0, 1);
    w[k] = x * x * (3 - 2 * x);
  }
  return w;
}

export function seasonInfo(t) {
  const y = ((t % YEAR_LEN) + YEAR_LEN) % YEAR_LEN;
  const idx = Math.min(3, Math.floor(y / SEASON_LEN));
  const day = Math.min(SEASON_DAYS - 1, Math.floor((y - idx * SEASON_LEN) / DAY_LENGTH));
  return { idx, id: SEASON_IDS[idx], day, u: (y - idx * SEASON_LEN) / SEASON_LEN };
}

// Note: the day of its season on which an archetype celebrates; same seed and year give the same day.
export function festivalDay(seed, arch, year) {
  return hash2(seed, hashStr(arch), year) % SEASON_DAYS;
}

// Note: growth multipliers blended by season weights.
export function growMuls(k) {
  let crop = 0; let other = 0;
  for (let i = 0; i < 4; i++) { crop += k[i] * SEASON_GROW.crop[i]; other += k[i] * SEASON_GROW.other[i]; }
  return { crop, other };
}

export class World {
  constructor(seedStr) {
    this.seedStr = seedStr;
    this.seed = hashStr(seedStr);
    this.time = 0;
    this.todShift = 0.02;
    this.todTarget = null;
    this.tod = 0.3;
    this.night = 0;
    this.islands = new Map();
    this.folk = [];
    this.nextFolk = 1;
    this.known = new Set();
    this.sighted = new Set();
    this.ambassador = { sent: false, done: false };
    this.fleetLease = null;
    this.unlocked = new Set();
    this.pendingKnow = new Set();
    this.made = {};
    this.links = [];
    this.weather = newWeather();
    this.events = [];
    this.tradeJobs = [];
    this.acc = 0;
    this.simT = 0;
    this.planT = 0;
    this.worldT = 0;
    this.memorials = [];
    this.arriveT = 150;
    this.arrivals = [];
    this.animals = [];
    this.nextAnimal = 1;
    this.stats = { born: 0, passed: 0 };
    // Note: season clock; t is seconds into the year, done lists archetypes that already celebrated this year.
    this.season = { t: 0, year: 0, done: [] };
    this.seasonIdx = 0;
    this.seasonK = seasonWeights(0);
    this.growM = growMuls(this.seasonK);
    this.grow0 = new Float32Array(N * N);
    // Note: endgame state: Great Work, legacy deeds, airships and the rare event deck.
    this.gw = newGw();
    this.deeds = [];
    this.ships = [];
    this.deck = null;
    this.auroraWait = false;
  }

  static createNew(seedStr) {
    const w = new World(seedStr);
    w.known = new Set(Object.keys(KNOWLEDGE).filter((k) => KNOWLEDGE[k].start));
    w.recomputeUnlocked();
    const home = w.getIsland(0, 0);
    w.reveal(home, true);
    home.stock = { wood: 4, stone: 2 };
    // Note: a free storehouse and a campfire near the island centre.
    const sSite = findSite(w, home, 'storehouse', null, { i: N / 2, j: N / 2 });
    if (sSite) startBuilding(w, home, 'storehouse', sSite.x, sSite.y, { built: true });
    const sv = storehouse(home);
    const cSite = sv ? findSite(w, home, 'campfire', null, { i: sv.x + 2, j: sv.y + 4 }) : null;
    if (cSite) startBuilding(w, home, 'campfire', cSite.x, cSite.y, { built: true });
    // Note: the first settlers already built stairs wherever the start pocket is cut off.
    for (let k = 0; k < 12 && sv; k++) {
      const st = nearestWalkable(home, sv.door.i, sv.door.j, null, 5);
      if (!st) break;
      home.home = { i: st[0], j: st[1] };
      home.reach = reachMap(home, st[0], st[1]);
      const site = findStairSite(home);
      if (!site) break;
      startBuilding(w, home, 'stairs', site.x, site.y, { dx: site.dx, dz: site.dz, door: site.door, built: true });
    }
    const spot = sv ? sv.door : { i: N >> 1, j: N >> 1 };
    for (let k = 0; k < START_FOLK; k++) {
      const sp = nearestWalkable(home, spot.i + (k % 3) - 1, spot.j + Math.floor(k / 3), null, 4) || [N >> 1, N >> 1];
      const f = createFolk(w, home, sp[0], sp[1], 3600 + R() * 4000);
      w.folk.push(f);
    }
    w.planNow(home);
    initDeck(w);
    w.deeds = [];
    legacyTick(w);
    return w;
  }

  getIsland(gx, gz) {
    const id = `${gx},${gz}`;
    let isl = this.islands.get(id);
    if (!isl) {
      // Note: rare slots and the Spire carry no knowledge relic; other rings follow the fixed plan.
      const trait = slotAt(this.seed, gx, gz);
      isl = generateIsland(this.seed, gx, gz, trait ? null : relicPlan(this.seed)[id] || null);
      // Note: rare slots and the Spire get their fixed terrain before any saved state is restored.
      if (trait) rareTerrain(isl, trait);
      this.islands.set(id, isl);
    }
    return isl;
  }

  linkBetween(a, b) {
    return this.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)) || null;
  }

  revealedIslands() { return [...this.islands.values()].filter((i) => i.revealed); }
  folkOn(id) { return this.folk.filter((f) => f.isle === id && !f.link && !f.visitor && !f.aboard); }
  emit(ev) {
    if (ev.type === 'gathered') this.made[ev.good] = (this.made[ev.good] || 0) + 1;
    this.events.push(ev);
  }

  recomputeUnlocked() {
    this.unlocked = new Set();
    for (const k of this.known) {
      const def = KNOWLEDGE[k];
      if (!def) continue;
      if (def.needs && !def.needs.every((g) => (this.made[g] || 0) > 0)) continue;
      for (const u of def.unlocks) this.unlocked.add(u);
    }
  }

  planNow(isl) {
    planIsland(this, isl);
    scanResources(isl);
    scanGaze(this, isl);
  }

  reveal(isl, silent) {
    if (isl.revealed) return;
    isl.revealed = true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.getIsland(isl.gx + dx, isl.gz + dz);
    if (!silent) this.emit({ type: 'reveal', isl });
  }

  // Note: folk reaching a relic learn its knowledge; reaching a new island lifts its fog.
  discover(isl, f) {
    if (!isl.revealed) this.reveal(isl);
    isl.explored = true;
    const kr = knowRelic(isl);
    if (kr && !kr.taken) {
      kr.taken = true;
      this.learn(isl, kr.know);
    }
  }

  // Note: adds one knowledge; returns false when it is unknown to the game or already known. `by` marks a teacher that is not a relic.
  learn(isl, k, by) {
    if (!k || !KNOWLEDGE[k] || this.known.has(k)) return false;
    this.known.add(k);
    this.emit(by ? { type: 'discover', isl, know: k, by } : { type: 'discover', isl, know: k });
    this.recomputeUnlocked();
    if (!KNOWLEDGE[k].unlocks.every((u) => this.unlocked.has(u))) this.pendingKnow.add(k);
    return true;
  }

  pass(f, isl) {
    const i = clamp(Math.floor(f.x), 0, N - 1); const j = clamp(Math.floor(f.z), 0, N - 1);
    const at = nearestWalkable(isl, i, j, null, 3) || [i, j];
    (isl.memorials || (isl.memorials = [])).push({ i: at[0], j: at[1], kind: R() < 0.5 ? 'lantern' : 'tree' });
    const k = this.folk.indexOf(f);
    if (k >= 0) this.folk.splice(k, 1);
    if (f.task) endTask(this, f, isl);
    // Note: the survivor mourns for two days, visits the memorial, and may pair again later.
    const mate = f.partner !== null && f.partner !== undefined ? this.folk.find((o) => o.id === f.partner) : null;
    if (mate) {
      mate.partner = null;
      mate.mourn = this.time + 2 * DAY_LENGTH;
      if (mate.isle === isl.id && !mate.link && mate.stage !== 'child') {
        mate.queue = { type: 'mourn', phase: 'go', t: 0, at: { i: at[0], j: at[1] } };
        if (mate.task && !['sleep', 'cross'].includes(mate.task.type)) endTask(this, mate, isl);
      }
    }
    this.stats.passed++;
    this.emit({ type: 'pass', isl, f });
  }

  // Note: link travel: folk board at an anchor and ride the polyline to the other island.
  // Note: a walkable link takes one direction at a time, and a same-way rider only once the one before is a gap ahead.
  canBoard(link, fromId) {
    if (link.type !== 'vine' && link.type !== 'ropebridge') return true;
    const rev = link.b === fromId;
    const gap = 0.9 / Math.max(2, link.len);
    for (const o of this.folk) if (o.link && o.link.l === link && (o.link.rev !== rev || o.link.t < gap)) return false;
    for (const a of this.animals) if (a.link && a.link.l === link && (a.link.rev !== rev || a.link.t < gap)) return false;
    return true;
  }

  // Note: true when a same-way rider on a walkable link is closer than 0.6 ahead of this one.
  ahead(L, self) {
    if (L.l.type !== 'vine' && L.l.type !== 'ropebridge') return false;
    const len = Math.max(2, L.l.len);
    for (const o of this.folk) if (o !== self && o.link && o.link.l === L.l && o.link.rev === L.rev && o.link.t > L.t && (o.link.t - L.t) * len < 0.6) return true;
    for (const a of this.animals) if (a !== self && a.link && a.link.l === L.l && a.link.rev === L.rev && a.link.t > L.t && (a.link.t - L.t) * len < 0.6) return true;
    return false;
  }

  boardLink(f, link, fromId) {
    const rev = link.b === fromId;
    f.link = { l: link, t: 0, rev };
    f.carryHold = f.carry;
    this.emit({ type: 'board', f, link });
  }

  moveOnLink(f, dt) {
    const L = f.link;
    // Note: a balloon waits at the station while an arrival crosses its lane.
    if (L.t <= 0 && L.l.type === 'balloon') { if (laneBusy(this, L.l)) return; clearLane(this, L.l); }
    if (this.ahead(L, f)) return;
    const spd = (LINKS[L.l.type]?.speed || 1) * 1.7;
    L.t += dt * spd / Math.max(2, L.l.len);
    if (L.t >= 1) {
      const toId = L.rev ? L.l.a : L.l.b;
      const to = this.islands.get(toId);
      const an = L.rev ? L.l.ai : L.l.bi;
      f.isle = toId;
      f.x = an.i + 0.5; f.z = an.j + 0.5;
      f.link = null;
      f.path = null;
      if (!to.revealed) { this.reveal(to); }
      this.emit({ type: 'land', f, isl: to });
    }
  }

  folkWorldPos(f) {
    if (f.link) {
      const p = linkPos(f.link.l, f.link.t, f.link.rev);
      return p;
    }
    const isl = this.islands.get(f.isle);
    const y = isl.heightAt(f.x, f.z);
    return { x: isl.wx + f.x - N / 2, y, z: isl.wz + f.z - N / 2 };
  }

  setTod(t) { this.todTarget = t; }

  step(dt) {
    const e0 = this.events.length;
    this.time += dt;
    if (this.todTarget !== null) {
      const cur = ((this.time / DAY_LENGTH) + 0.3 + this.todShift) % 1;
      let d = this.todTarget - cur;
      d = ((d + 1.5) % 1) - 0.5;
      const mv = Math.sign(d) * Math.min(Math.abs(d), dt * 0.35);
      this.todShift += mv;
      if (Math.abs(d) < 0.003) this.todTarget = null;
    }
    this.tod = (((this.time / DAY_LENGTH) + 0.3 + this.todShift) % 1 + 1) % 1;
    const sunH = Math.sin((this.tod - 0.25) * Math.PI * 2);
    this.sunH = sunH;
    this.night = clamp(0.5 - sunH * 1.3, 0, 1);
    this.stepSeason(dt);
    stepWeather(this.weather, dt, this);
    this.simT += dt;
    this.planT += dt;
    this.worldT += dt;
    const out = [];
    if (this.simT >= 0.4) {
      const sdt = this.simT; this.simT = 0;
      const gm = this.growM;
      const seasonal = Math.abs(gm.crop - 1) > 0.005 || Math.abs(gm.other - 1) > 0.005;
      for (const isl of this.islands.values()) {
        if (!isl.revealed) continue;
        if (seasonal) this.grow0.set(isl.grow);
        stepIsland(isl, sdt, this, out);
        if (seasonal) this.seasonGrow(isl, gm);
      }
      for (const e of out) this.handleSim(e);
    }
    if (this.planT >= 2.5) {
      this.planT = 0;
      for (const isl of this.islands.values()) if (isl.revealed) { this.planNow(isl); }
      this.pruneBuildings();
    }
    // Note: the deck and the airships run every step; ships carry real positions that the view draws.
    const dev = stepDeck(this, dt);
    const sev = stepShips(this, dt, dev);
    for (const e of dev) { this.emit(e); this.markStorm(e); }
    for (const e of sev) this.emit(e);
    this.pauseHomeless = !!dev.pauseHomeless || homelessPaused(this);
    prepBodies(this);
    for (const f of [...this.folk]) updateFolk(this, f, dt);
    stepLinks(this, dt);
    this.stepArrivals(dt);
    stepAnimals(this, dt);
    resolveBodies(this, dt);
    if (this.worldT >= 4) { this.worldT = 0; this.worldTick(4); }
    this.afterEvents(e0);
  }

  // Note: storm damage is a mark on the building (b.damage = {part, prop}); the aftermath end clears every mark.
  markStorm(e) {
    if (e.type !== 'aftermath') return;
    if (e.phase === 'begin') {
      for (const d of e.damage || []) {
        const isl = this.islands.get(d.isl);
        const b = isl && isl.buildings[d.b];
        if (b && !b.gone && b.id === d.bid) b.damage = { part: d.part, prop: d.prop || null };
      }
    } else if (e.phase === 'done') {
      for (const isl of this.islands.values()) for (const b of isl.buildings) if (b && b.damage) b.damage = null;
    }
  }

  // Note: walks the events of this step (extras included) once: legacy deeds, explorer reveals, relic keys, the aurora.
  afterEvents(e0) {
    for (let k = e0; k < this.events.length; k++) {
      const ev = this.events[k];
      for (const x of legacyEvent(this, ev)) this.emit(x);
      if (ev.type === 'shipland' && ev.ship && ev.ship.colony && ev.ship.state === 'ground') colonyLanded(this, ev.ship);
      else if (ev.type === 'colonyabort') colonyAborted(this, ev.ship);
      else if (ev.type === 'shipland' && ev.ship && ev.ship.visit && ev.ship.visit.who === 'explorer') {
        for (const id of ev.reveal || []) { const t = this.islands.get(id); if (t) this.reveal(t); }
        const d = dormantIslands(this)[0];
        if (d) awakenIsland(this, d);
      } else if (ev.type === 'gwlit') this.auroraWait = true;
      else if (ev.type === 'visitor' && ev.kind === 'ambassador' && ev.isl) {
        // Note: the rare islands become known and targetable, not explored and not awake; the visit is a deed at the dock.
        for (const id of ev.reveal || []) { const t = this.islands.get(id); if (t) this.reveal(t); }
        const sh = this.ships.find((s) => s.visit && s.visit.who === 'ambassador' && s.from === ev.isl.id);
        const db = sh && ev.isl.buildings[sh.dock];
        const d = recordDeed(this, 'ambassador', { isl: ev.isl, ...(db && db.door ? { i: db.door.i, j: db.door.j } : {}), t: this.time });
        if (d) this.emit(deedEvent(this, d));
      } else if (ev.type === 'visitor' && ev.isl && (ev.kind === 'merchant' || ev.kind === 'frigate')) {
        // Note: the figure stands at the hull's dock; the swap itself is done in ships.js.
        const sh = this.ships.find((s) => s.visit && s.from === ev.isl.id && s.state === 'unload');
        const db = sh && ev.isl.buildings[sh.dock];
        if (db && db.door) spawnVisitor(this, ev.isl, ev.kind, { from: db.door, ship: sh.id });
      } else if (ev.type === 'song') {
        // Note: a pilgrim's song wakes the first sleeping rare island that is already revealed.
        const d = dormantIslands(this)[0];
        if (d) awakenIsland(this, d);
      }
    }
  }

  // Note: advances the season clock; weights are recomputed each step, a change of season emits an event.
  stepSeason(dt) {
    const s = this.season;
    s.t += dt;
    if (s.t >= YEAR_LEN) { s.t -= YEAR_LEN; s.year++; s.done = []; }
    this.seasonK = seasonWeights(s.t);
    this.growM = growMuls(this.seasonK);
    const idx = seasonInfo(s.t).idx;
    if (idx !== this.seasonIdx) {
      this.seasonIdx = idx;
      this.emit({ type: 'season', season: SEASON_IDS[idx], idx, year: s.year });
    }
  }

  // Note: the sim grew plants by its own rate; this rescales that step's gain by the season (sim.js stays untouched).
  seasonGrow(isl, gm) {
    const g = isl.grow; const g0 = this.grow0;
    for (let c = 0; c < N * N; c++) {
      const d = g[c] - g0[c];
      const pk = isl.plant[c];
      if (d <= 0 || !pk) continue;
      g[c] = Math.min(1, g0[c] + d * (PLANTS[PLANT_KINDS[pk]].crop ? gm.crop : gm.other));
    }
  }

  // Note: sets the clock; keeps index and weights in step (used by loading and by tests).
  setSeasonClock(t, year = this.season.year) {
    this.season.t = ((t % YEAR_LEN) + YEAR_LEN) % YEAR_LEN;
    this.season.year = year;
    this.seasonIdx = seasonInfo(this.season.t).idx;
    this.seasonK = seasonWeights(this.season.t);
    this.growM = growMuls(this.seasonK);
  }

  handleSim(e) {
    if (e.type === 'collapse') {
      const b = e.b;
      if (b.gone) return;
      removeBuilding(e.isl, b);
      this.emit({ type: 'collapse', isl: e.isl, b, by: e.by });
    } else this.emit(e);
  }

  pruneBuildings() {
    for (const isl of this.islands.values()) {
      if (!isl.revealed) continue;
      for (const b of isl.buildings) {
        if (!b || b.gone) continue;
        if (b.id === 'dock') {
          let wet = false;
          for (let dj = -1; dj <= b.size; dj++) for (let di = -1; di <= b.size; di++) if (inB(b.x + di, b.y + dj) && isl.water[cidx(b.x + di, b.y + dj)] >= 0.25) wet = true;
          if (!wet && b.built) { removeBuilding(isl, b); this.emit({ type: 'collapse', isl, b, by: 'dry' }); }
        } else if (b.id === 'stairs' && !b.gone) {
          // Note: a stair needs a partner cell within reach of its rise; digging or raising can break it.
          const pi = b.x + b.dx; const pj = b.y + b.dz;
          const dh = inB(pi, pj) && isl.land(pi, pj) && isl.land(b.x, b.y) ? Math.abs(isl.cellH(b.x, b.y) - isl.cellH(pi, pj)) : 99;
          if (dh > STAIR_MAX) { const was = b.built; b.progress = was ? 1 : b.progress; cancelBuilding(isl, b); if (was) this.emit({ type: 'collapse', isl, b, by: 'moved' }); }
        } else if (!b.built) {
          // Note: a site that floods is abandoned and its goods return.
          let wet = false;
          for (let dj = 0; dj < b.size; dj++) for (let di = 0; di < b.size; di++) if (isl.water[cidx(b.x + di, b.y + dj)] > 0.1) wet = true;
          if (wet) cancelBuilding(isl, b);
        }
      }
    }
  }

  // Note: starts an arrival on the first pad with a clear flight (see flight.js); null when every pad is blocked now.
  spawnArrival(isl) {
    const free = popCap(isl) - this.folkOn(isl.id).length - this.inboundTo(isl.id);
    const n = Math.max(0, Math.min(free, 1 + Math.floor(R() * (this.known.has('ballooning') ? 3 : 2))));
    for (const pad of builtOf(isl, 'pad')) {
      if (pad.gone) continue;
      const proto = { n, cargo: cargoFor(this, isl), dur: 34, stay: 10, lift: 30, landed: false };
      const fl = planFlight(this, isl, pad, proto, (R() - 0.5) * 1.2);
      if (!fl) continue;
      const ar = { isl, pad, ...proto, t: 0, ...fl };
      this.arrivals.push(ar);
      this.emit({ type: 'balloon', isl, b: pad });
      return ar;
    }
    return null;
  }

  // Note: a balloon descends from off-map; the settlers step out of it at the pad.
  stepArrivals(dt) {
    for (const ar of this.arrivals) {
      ar.t += dt;
      if (!ar.landed && ar.t >= ar.dur) {
        ar.landed = true;
        const isl = ar.isl;
        if (ar.pad.gone) { ar.t = ar.dur + ar.stay + 99; continue; }
        this.emit({ type: 'touchdown', isl, b: ar.pad });
        unloadCargo(this, ar);
        for (let k = 0; k < ar.n; k++) {
          if (this.folkOn(isl.id).length + this.inboundTo(isl.id) >= popCap(isl)) break;
          const f = createFolk(this, isl, ar.pad.door.i, ar.pad.door.j, 4000 + R() * 3000);
          f.x += (R() - 0.5) * 0.4; f.z += (R() - 0.5) * 0.4;
          this.folk.push(f);
          this.emit({ type: 'arrive', isl, f });
        }
        // Note: now and then a wanderer or pilgrim steps out too; the pick and the chance come from the seed, not from the RNG.
        const salt = Math.floor(this.time) + hashStr(isl.id);
        if (hash2(this.seed, salt, 77) % 100 < 18) spawnVisitor(this, isl, visitorFor(this, isl, 'pad', salt), { from: ar.pad.door });
      }
    }
    this.arrivals = this.arrivals.filter((ar) => ar.t < ar.dur + ar.stay + ar.lift + 2);
  }

  // Note: an unpaired content man and woman on one island become a couple, court, and share a hut.
  coupleUp(isl, adults) {
    const byId = new Map(this.folk.map((f) => [f.id, f]));
    const away = (f) => f.link || (f.queue && f.queue.type === 'cross') || (f.task && f.task.type === 'cross') || f.guestOf || (f.queue && f.queue.guest);
    for (const f of this.folkOn(isl.id)) {
      if (f.partner === undefined || f.partner === null) continue;
      const p = byId.get(f.partner);
      // Note: a couple that travels together keeps its bond while one of them is still on the way.
      if (!p || (p.isle !== f.isle && !away(f) && !away(p))) f.partner = null;
    }
    const single = adults.filter((f) => (f.partner === null || f.partner === undefined) && f.mood > 0.5 && !(f.mourn > this.time) && !away(f));
    const men = single.filter((f) => f.sex === 'm'); const women = single.filter((f) => f.sex === 'f');
    if (men.length && women.length && R() < 0.3) {
      const pool = R() < 0.5 ? men : women; const other = pool === men ? women : men;
      const a = pool[Math.floor(R() * pool.length)];
      let b = other[0]; let bd = 1e9;
      for (const f of other) { const d = Math.hypot(f.x - a.x, f.z - a.z); if (d < bd) { bd = d; b = f; } }
      a.partner = b.id; b.partner = a.id;
      a.nextBirth = b.nextBirth = this.time + 30 + R() * 60;
      const idle = (f) => !f.queue && (!f.task || ['wander', 'gaze', 'social', 'gather', 'eat'].includes(f.task.type));
      if (idle(a) && idle(b)) {
        const at = { i: Math.floor(a.x), j: Math.floor(a.z) };
        a.queue = { type: 'court', phase: 'wait', mate: b.id, at, t: 0 };
        b.queue = { type: 'court', phase: 'go', mate: a.id, at, t: 0 };
        for (const f of [a, b]) if (f.task) endTask(this, f, isl);
      }
    }
    // Note: the couple moves in together when either hut has room, else into a hut with two free beds.
    const cap = (k) => { const hb = isl.buildings[k]; return hb && !hb.gone && hb.built ? BUILDINGS.hut.beds + (hb.level || 0) : 0; };
    const occ = (k) => this.folk.filter((o) => o.isle === isl.id && o.home === k).length;
    for (const a of adults) {
      const b = a.partner !== null && a.partner !== undefined ? byId.get(a.partner) : null;
      if (!b || a.id > b.id || b.isle !== a.isle || (a.home >= 0 && a.home === b.home)) continue;
      if (a.home >= 0 && occ(a.home) < cap(a.home)) b.home = a.home;
      else if (b.home >= 0 && occ(b.home) < cap(b.home)) a.home = b.home;
      else if (a.home < 0 && b.home < 0) {
        for (let k = 0; k < isl.buildings.length; k++) {
          const hb = isl.buildings[k];
          if (hb && !hb.gone && hb.id === 'hut' && hb.built && cap(k) - occ(k) >= 2) { a.home = b.home = k; break; }
        }
      }
    }
  }

  // Note: a child needs a couple sharing a hut, room on the island, enough food, content parents and a cooldown.
  birthTick(isl, adults, folk, room) {
    if (folk.length >= room) return;
    const byId = new Map(adults.map((f) => [f.id, f]));
    const food = stockGet(isl, 'bread') + stockGet(isl, 'smoked') + stockGet(isl, 'fruit') + stockGet(isl, 'fish') + stockGet(isl, 'egg');
    if (food < Math.max(2, folk.length * 0.5)) return;
    if (folk.length >= SHIPPED_POP && !selfFed(isl)) return;
    for (const f of adults) {
      const p = byId.get(f.partner);
      if (!p || f.id > p.id || f.home < 0 || f.home !== p.home || f.link || p.link) continue;
      if (this.time < (f.nextBirth || 0) || (f.mood + p.mood) / 2 < 0.6) continue;
      const hut = isl.buildings[f.home];
      if (!hut || hut.gone || !hut.built || !hut.door) continue;
      // Note: the carrying parent is the mother; the birth waits until she is near the hut and free to carry.
      const mom = f.sex === 'f' ? f : p;
      if (Math.hypot(mom.x - hut.door.i, mom.z - hut.door.j) > 10 || mom.anim === 'sleep' || mom.carry) continue;
      const c = createFolk(this, isl, hut.door.i, hut.door.j, 0);
      c.needs = { food: 0.9, shelter: 0.9, rest: 0.9, company: 0.9, wonder: 0.8, explore: 0.4 + Math.random() * 0.6, industry: 0.6, belonging: 0.9 };
      // Note: the child takes a bed when one is free, else a bedroll.
      c.home = this.folk.filter((o) => o.isle === isl.id && o.home === f.home).length < BUILDINGS.hut.beds + (hut.level || 0) ? f.home : -1;
      c.pars = [mom.id, (mom === f ? p : f).id];
      const par = c.sex === f.sex ? f : p;
      const top = Object.keys(par.talent).reduce((m, k) => (par.talent[k] > par.talent[m] ? k : m));
      c.talent[top] = Math.min(1.6, c.talent[top] + 0.15);
      f.kids = (f.kids || 0) + 1; p.kids = f.kids;
      f.nextBirth = p.nextBirth = this.time + 150 + R() * 120;
      this.folk.push(c);
      this.stats.born++;
      this.emit({ type: 'born', isl, f: c });
      // Note: she carries the baby out; nearby neighbours turn to look.
      c.queue = { type: 'follow', phase: 'go', par: mom.id, t: 9, gap: 0.7 };
      mom.queue = { type: 'proud', phase: 'go', t: 0 };
      if (mom.task) endTask(this, mom, isl);
      const sp = nearestWalkable(isl, hut.door.i, hut.door.j + 2, null, 3);
      const st = nearestWalkable(isl, hut.door.i + 1, hut.door.j + 3, null, 3);
      let seen = 0;
      for (const o of folk) {
        if (seen >= 2 || !sp || !st || o === mom || o === f || o === p || o === c || o.stage === 'child' || o.queue || o.link || o.anim === 'sleep') continue;
        if (Math.hypot(o.x - hut.door.i, o.z - hut.door.j) > 8 || (o.task && !['wander', 'gaze', 'social'].includes(o.task.type))) continue;
        o.queue = { type: 'gaze', phase: 'go', t: 0, spot: { i: st[0], j: st[1], fi: sp[0] + 0.5, fj: sp[1] + 0.5, w: 1, why: 'baby' } };
        if (o.task) endTask(this, o, isl);
        seen++;
      }
      return;
    }
  }

  // Note: settlers on their way to an island and its own explorers and traders still away, counted against its room.
  inboundTo(id) {
    return this.folk.filter((o) => {
      const q = o.queue && o.queue.type === 'cross' ? o.queue : o.task && o.task.type === 'cross' ? o.task : null;
      if (q && (q.link.a === id || q.link.b === id) && o.isle !== id) return true;
      // Note: a trader on a link is in neither folkOn list, so it still counts against its home island.
      if (o.task && o.task.type === 'trade' && o.task.job && o.task.job.from === id && (o.isle !== id || o.link)) return true;
      // Note: a festival guest on the road still counts against its home island.
      if (o.guestOf && o.guestOf.home === id && (o.isle !== id || o.link)) return true;
      // Note: folk aboard a colony hull count against the island the hull flies to.
      if (o.aboard) { const sh = this.ships.find((s) => s.id === o.aboard); return !!sh && sh.to === id && sh.from !== id; }
      return false;
    }).length;
  }

  // Note: adults homeless for three days with no hut being built take a link to the neighbour with the most free beds.
  emigrate(isl, adults) {
    if (live(isl, 'hut').some((b) => !b.built)) return;
    const need = adults.filter((f) => (f.homelessT || 0) > 3 * DAY_LENGTH && !f.queue && !f.link && (!f.task || !['sleep', 'pass', 'flee', 'cross', 'proud', 'court', 'festival'].includes(f.task.type)));
    if (!need.length) return;
    const free = (to) => {
      let cap = 0;
      for (const b of builtOf(to, 'hut')) cap += BUILDINGS.hut.beds + (b.level || 0);
      return cap - this.folk.filter((o) => o.isle === to.id && o.home >= 0).length;
    };
    let best = null; let bf = 0;
    for (const l of this.links) {
      if (l.state !== 'done' || (l.a !== isl.id && l.b !== isl.id)) continue;
      const to = this.islands.get(l.a === isl.id ? l.b : l.a);
      if (!to || !to.revealed) continue;
      // Note: settlers already on their way count against the island's room.
      const inbound = this.inboundTo(to.id);
      if (this.folkOn(to.id).length + inbound >= popCap(to)) continue;
      const fr = Math.min(free(to) - inbound, BED_PER_ISLAND_MAX - this.folkOn(to.id).length - inbound);
      if (fr > bf) { bf = fr; best = l; }
    }
    if (!best) return;
    const f = need[0];
    const mate = f.partner !== null && f.partner !== undefined ? this.folk.find((o) => o.id === f.partner) : null;
    const go = [f];
    if (mate && mate.isle === isl.id && mate.stage === 'adult' && !mate.queue && !mate.link && bf >= 2 && (!mate.task || !['sleep', 'pass', 'flee', 'cross'].includes(mate.task.type))) go.push(mate);
    for (const o of go) {
      o.queue = { type: 'cross', link: best, phase: 'go', t: 0, settle: true, kit: null };
      o.homelessT = 0;
      if (o.task) endTask(this, o, isl);
    }
  }

  // Note: slow world logic: births, arrivals, links, trade, voyages, inventions.
  worldTick(dt) {
    for (const isl of this.islands.values()) {
      if (!isl.revealed) continue;
      const folk = this.folkOn(isl.id);
      const adults = folk.filter((f) => f.stage === 'adult');
      // Note: islands with a pad keep two beds free for settlers.
      const reserve = builtOf(isl, 'pad').length ? 2 : 0;
      this.coupleUp(isl, adults);
      this.birthTick(isl, adults, folk, BED_PER_ISLAND_MAX - reserve - this.inboundTo(isl.id));
      this.emigrate(isl, adults);
      updateRung(this, isl, dt);
      wearTick(isl, dt);
    }
    this.arriveT -= dt;
    if (this.arriveT <= 0) {
      const ready = this.revealedIslands().filter((i) => storehouse(i) && builtOf(i, 'pad').length && (selfFed(i) || this.folkOn(i.id).length + this.inboundTo(i.id) < SHIPPED_POP) && builtOf(i, 'bonfire').some((b) => b.lit !== false) && (this.folkOn(i.id).length + this.inboundTo(i.id) < BED_PER_ISLAND_MAX || cargoFor(this, i).length));
      let top = 0;
      for (const i of ready) top = Math.max(top, i.rung);
      // Note: higher rungs and a known balloon craft shorten the wait.
      const wait = (210 - top * 22) * (this.known.has('ballooning') ? 0.7 : 1);
      // Note: nobody ready: look again soon instead of waiting a full cycle.
      this.arriveT = ready.length ? wait * (0.8 + R() * 0.4) : 15;
      // Note: islands waiting for animals (dogs, hens, sheep) come first.
      const wantsAnimals = ready.filter((i) => cargoFor(this, i).length);
      const best = wantsAnimals.length ? wantsAnimals : ready.filter((i) => i.rung === top);
      if (best.length) {
        // Note: an island whose pads have no clear flight is skipped; if all are blocked the next try comes soon.
        const k0 = Math.floor(R() * best.length);
        let made = null;
        for (let k = 0; k < best.length && !made; k++) made = this.spawnArrival(best[(k0 + k) % best.length]);
        if (!made) this.arriveT = 8;
      }
    }
    planCapital(this);
    sightingTick(this);
    planFleet(this);
    if (this.skillNeed && this.known.has(this.skillNeed)) this.skillNeed = null;
    // Note: inventions: known knowledge whose needed goods have been made.
    if (this.pendingKnow.size) {
      const before = this.unlocked.size;
      this.recomputeUnlocked();
      for (const k of [...this.pendingKnow]) {
        if (KNOWLEDGE[k].unlocks.every((u) => this.unlocked.has(u))) { this.pendingKnow.delete(k); this.emit({ type: 'invent', know: k }); }
      }
    }
    this.seasonFestivals();
    this.planTrade();
    topUpAnimals(this);
    for (const e of legacyTick(this)) this.emit(e);
    // Note: the Spire isle hands every needed good in its stock to the Great Work.
    for (const isl of this.islands.values()) {
      if (isl.special !== 'spire' || !isl.revealed) continue;
      for (const e of gwDrain(this.gw, isl.stock || (isl.stock = {}), this.time).events) this.emit(e);
    }
    // Note: the aurora omen waits for a quiet deck.
    if (this.auroraWait) { const ev = occasion(this, 'aurora'); if (ev) { this.auroraWait = false; this.emit(ev); } else if (!this.deck || !this.deck.omen && !this.deck.active) this.auroraWait = false; }
  }

  // Note: each archetype celebrates once a year in its season, at dusk, on a seed-fixed day; the best island of that archetype hosts.
  seasonFestivals() {
    const sn = this.season;
    const info = seasonInfo(sn.t);
    for (const arch of ARCH_IDS) {
      if (SEASON_FESTIVAL[arch] !== info.idx || sn.done.includes(arch)) continue;
      if (info.day < festivalDay(this.seed, arch, sn.year)) continue;
      // Note: dusk, or the last day of the season whatever the hour.
      const dusk = this.tod >= 0.6 && this.tod < 0.8;
      if (!dusk && info.day < SEASON_DAYS - 1) continue;
      let host = null;
      for (const isl of this.islands.values()) {
        if (!isl.revealed || isl.arch !== arch || isl.rung < 2 || isl.festival || !storehouse(isl)) continue;
        if (this.folkOn(isl.id).filter((f) => f.stage === 'adult').length < 2) continue;
        if (!host || isl.rung > host.rung || (isl.rung === host.rung && isl.id < host.id)) host = isl;
      }
      if (!host) continue;
      sn.done.push(arch);
      host.festival = { t: SEASON_FEST_LEN, at: festivalPlace(host), arch, season: true, s: info.idx };
      this.emit({ type: 'festival', isl: host, rung: host.rung, season: SEASON_IDS[info.idx], arch, seasonal: true, year: sn.year });
      this.inviteGuests(host);
    }
  }

  // Note: idle adults of each linked, revealed neighbour walk over the link to the festival.
  inviteGuests(host) {
    for (const l of this.links) {
      if (l.state !== 'done' || (l.a !== host.id && l.b !== host.id)) continue;
      const home = this.islands.get(l.a === host.id ? l.b : l.a);
      if (!home || !home.revealed || !storehouse(home)) continue;
      const ok = (f) => f.stage === 'adult' && !f.queue && !f.link && !f.guestOf && f.needs.food > 0.3 && (!f.task || ['wander', 'gaze', 'social', 'gather', 'wonder', 'eat'].includes(f.task.type));
      const pool = this.folkOn(home.id).filter(ok).sort((a, b) => a.id - b.id);
      const room = Math.max(0, BED_PER_ISLAND_MAX + 6 - this.folkOn(host.id).length);
      for (const f of pool.slice(0, Math.min(SEASON_GUESTS, room))) {
        f.guestOf = { home: home.id, host: host.id, link: l };
        f.queue = { type: 'festival', guest: true, phase: 'toLink', link: l, home: home.id, t: 0 };
        if (f.task) endTask(this, f, home);
      }
    }
  }

  planTrade() {
    this.tradeJobs = this.tradeJobs.filter((j) => !j.done && !(j.taken && !this.folk.some((f) => f.task && f.task.job === j)));
    for (const l of this.links) {
      if (l.state !== 'done') continue;
      for (const [fromId, toId] of [[l.a, l.b], [l.b, l.a]]) {
        const from = this.islands.get(fromId); const to = this.islands.get(toId);
        if (!from.revealed || !to.revealed || !storehouse(from) || !storehouse(to)) continue;
        if (this.tradeJobs.some((j) => j.link === l && j.from === fromId)) continue;
        for (const g of Object.keys(to.want || {})) {
          const gap = (to.want[g] || 0) - stockGet(to, g);
          const keep = Math.max(from.want?.[g] || 0, 2);
          const spare = stockGet(from, g) - keep;
          if (gap > 0 && spare > 0) {
            this.tradeJobs.push({ link: l, from: fromId, to: toId, good: g, n: Math.min(3, spare, Math.ceil(gap)), taken: false, done: false });
            break;
          }
        }
      }
    }
  }

  toJSON() {
    return {
      v: 2, seed: this.seedStr, time: this.time, todShift: this.todShift, nextFolk: this.nextFolk,
      known: [...this.known], sighted: [...this.sighted], ambassador: { ...this.ambassador }, lease: this.fleetLease ? { ...this.fleetLease } : null, made: this.made, pendingKnow: [...this.pendingKnow], stats: this.stats,
      wind: this.weather.wind,
      season: { t: this.season.t, year: this.season.year, done: this.season.done.slice() },
      islands: [...this.islands.values()].filter((i) => i.revealed).map((i) => ({ ...i.toJSON(), explored: !!i.explored, memorials: i.memorials || [], anchors: i.anchors || [] })),
      animals: animalsToJSON(this),
      gw: gwToJSON(this.gw), deeds: deedsToJSON(this), ships: shipsToJSON(this), deck: this.deck,
      links: this.links.map((l) => ({ id: l.id, a: l.a, b: l.b, ai: l.ai, bi: l.bi, type: l.type, state: l.state, progress: l.progress, gap: l.gap, work: l.work, tier: l.tier | 0, benchEnd: l.benchEnd ? 1 : 0, adPaid: !!l.adPaid, adProgress: l.adProgress || 0 })),
      folk: this.folk.filter((f) => !f.visitor).map((f) => ({
        id: f.id, isle: f.isle, x: f.x, z: f.z, age: f.age, needs: f.needs, talent: f.talent, passAt: f.passAt, speedMul: f.speedMul,
        sex: f.sex, partner: f.partner ?? null, kids: f.kids || 0, nb: Math.max(0, (f.nextBirth || 0) - this.time),
        pars: f.pars || null, ab: f.aboard || 0, mourn: Math.max(0, (f.mourn || 0) - this.time), homelessT: f.homelessT || 0,
        link: f.link ? { id: f.link.l.id, t: f.link.t, rev: f.link.rev } : null,
        gh: f.guestOf ? { home: f.guestOf.home, host: f.guestOf.host, l: f.guestOf.link.id } : null,
        cr: f.crew ? f.crew.home : null,
      })),
    };
  }

  static fromJSON(o) {
    // Note: saves of another version start a fresh world (save.js catches the throw).
    if (!o || o.v !== 2) throw new Error('save version');
    const w = new World(o.seed);
    w.time = o.time; w.todShift = o.todShift; w.nextFolk = o.nextFolk;
    w.known = new Set(o.known); w.sighted = new Set(o.sighted || []);
    w.ambassador = { sent: !!(o.ambassador && o.ambassador.sent), done: !!(o.ambassador && o.ambassador.done) };
    w.fleetLease = o.lease && Number.isFinite(o.lease.until) ? { until: o.lease.until, extra: o.lease.extra | 0 } : null; w.made = o.made || {}; w.pendingKnow = new Set(o.pendingKnow || []); w.stats = o.stats || w.stats;
    if (o.wind) Object.assign(w.weather.wind, o.wind);
    // Note: old saves carry no season clock; they start in spring on day 0.
    if (o.season) { w.season.done = Array.isArray(o.season.done) ? o.season.done.slice() : []; w.setSeasonClock(+o.season.t || 0, o.season.year | 0); }
    for (const io of o.islands) {
      const isl = w.getIsland(io.gx, io.gz);
      isl.restore(io);
      isl.explored = io.explored; isl.memorials = io.memorials || []; isl.anchors = io.anchors || [];
      w.reveal(isl, true);
    }
    w.recomputeUnlocked();
    // Note: old saves carry no deck, Great Work, deeds or ships; every loader accepts undefined.
    w.deck = o.deck; initDeck(w);
    w.gw = gwFromJSON(o.gw);
    w.deeds = deedsFromJSON(o.deeds);
    for (const lo of o.links) {
      const A = w.islands.get(lo.a); const B = w.islands.get(lo.b);
      if (!A || !B) continue;
      const l = makeLink(w, A, B) || {};
      Object.assign(l, lo, { x: lo.ai.i, y: lo.ai.j, size: 1, door: { i: lo.ai.i, j: lo.ai.j }, claims: 0, built: lo.state === 'done', isLink: true });
      // Note: old saves carry no tier fields.
      l.tier = Math.max(0, Math.min(4, lo.tier | 0)); l.benchEnd = lo.benchEnd ? 1 : 0; l.adPaid = !!lo.adPaid; l.adProgress = lo.adProgress || 0;
      if (l.type) l.pts = linkPoints(w, l);
      w.links.push(l);
    }
    for (const fo of o.folk) {
      const isl = w.islands.get(fo.isle);
      if (!isl) continue;
      const f = createFolk(w, isl, 0, 0, fo.age);
      Object.assign(f, { id: fo.id, x: fo.x, z: fo.z, needs: { explore: 0.7, industry: 0.6, belonging: 0.7, ...fo.needs }, talent: fo.talent, passAt: fo.passAt, speedMul: fo.speedMul, partner: fo.sex ? fo.partner ?? null : null, kids: fo.kids || 0, nextBirth: w.time + (fo.nb || 0) });
      if (fo.sex) f.sex = fo.sex;
      if (fo.ab) f.aboard = fo.ab;
      f.pars = fo.pars || null; f.mourn = fo.mourn ? w.time + fo.mourn : 0; f.homelessT = fo.homelessT || 0;
      stageOf(f);
      if (fo.link) { const l = w.links.find((q) => q.id === fo.link.id); if (l && l.pts) f.link = { l, t: fo.link.t, rev: fo.link.rev }; }
      if (fo.gh) { const gl = w.links.find((q) => q.id === fo.gh.l); if (gl) f.guestOf = { home: fo.gh.home, host: fo.gh.host, link: gl }; }
      // Note: a traveller keeps its home island; the bed index is not saved and is chosen anew back home.
      if (fo.cr) f.crew = { home: fo.cr, idx: -1 };
      w.folk.push(f);
    }
    animalsFromJSON(w, o.animals);
    for (const isl of w.islands.values()) if (isl.revealed) w.planNow(isl);
    shipsFromJSON(w, o.ships);
    for (const e of legacyTick(w)) w.emit(e);
    return w;
  }
}
