// Note: the work board: the island planner's state becomes orders; folk score orders and personal desires with one number.
// Note: sim only. An order is { key, kind, skill, pressure, seats, res, open(), elig(f), task(f, r) }; claims are the folk whose task carries order = key.

import { BUILDINGS, FLOURISH_IDS } from './config.js';
import { goalDistLink, relicFor } from './rareisles.js';
import { HOME_ID, EXPEDITION, councilBuilding, councilFlourishTarget, residentsOf, routeOver } from './capital.js';
import { cidx } from './island.js';
import { live, builtOf, stockGet, storehouse, canAfford, flourishCost, flourishTarget, linkCap, GOAL_P } from './econ.js';
import { herdPlanCached } from './animals.js';
import { nearestRes, adornCd } from './folk.js';

const REFRESH = 1.5;
const EDIBLE = ['bread', 'smoked', 'egg', 'fruit', 'fish', 'wheat'];
// Note: the kinds that are productive work; they ease the industry desire and are lifted by it.
export const WORK_KINDS = new Set(['build', 'adorn', 'link', 'craft', 'tend', 'herd', 'gather', 'fish', 'relight', 'plant', 'trade', 'dock', 'stock']);
// Note: goods that idle hands keep in the larder even when no building asks for them, with the stock they aim for.
const SINK_RAW = { wood: 12, stone: 6, fiber: 6, clay: 4, reed: 4 };
const SINK_CRAFT = { plank: 6, rope: 4, charcoal: 3, brick: 3 };

export { EXPEDITION };

// Note: folk of this island that are away on an expedition or a crew; the cap keeps the economy running.
export function awayFrom(world, id) {
  let n = 0;
  for (const o of world.folk) {
    const q = (o.task && o.task.type === 'cross' ? o.task : null) || (o.queue && o.queue.type === 'cross' ? o.queue : null);
    if ((q && q.fromIsle === id) || (!q && o.crew && o.crew.home === id && o.isle !== id)) n++;
  }
  return n;
}

// Note: how much nearer to a rare island or the Spire an island is than another, in grid steps (positive = closer).
const gainToward = (world, from, to) => goalDistLink(world.seed, from.gx, from.gz) - goalDistLink(world.seed, to.gx, to.gz);

// Note: a gather order has a seat for every trip still missing, at about two goods a trip, up to six hands.
const GATHER_YIELD = 2;
const gatherSeats = (deficit) => Math.min(6, Math.max(1, Math.ceil(deficit / GATHER_YIELD)));

const larder = (isl) => EDIBLE.reduce((s, g) => s + stockGet(isl, g), 0);

// Note: the folk who hold seats on orders right now, by order key.
function claimCounts(world) {
  const m = new Map();
  for (const o of world.folk) {
    const k = (o.task && o.task.order) || (o.queue && o.queue.order);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// Note: whether f may leave on an expedition from isl: adult, fed, the island keeps two adults, one in four away at most, a larder to spare.
export function mayLeave(world, isl, f, joining) {
  if (f.stage !== 'adult' || f.guestOf || f.link || f.needs.food < 0.3 || f.aboard) return false;
  const folk = residentsOf(world, isl.id);
  const adults = folk.filter((o) => o.stage === 'adult').length;
  const away = awayFrom(world, isl.id);
  // Note: the second settler of a party joins one that already left, so the cap counts the party once.
  if (!joining && away >= Math.floor(folk.length / EXPEDITION.cap)) return false;
  if (adults - away - 1 < EXPEDITION.keep) return false;
  return larder(isl) >= folk.length * EXPEDITION.larder;
}

// Note: builds the orders of one island from its planner state.
function generate(world, isl) {
  const out = [];
  const push = (o) => out.push(o);
  const pop = residentsOf(world, isl.id).length;

  // build: unfinished buildings and upgrades
  live(isl).forEach((b) => {
    if (b.built && !(b.upgrading && b.upProgress < 1)) return;
    push({ key: `build:${isl.buildings.indexOf(b)}`, kind: 'build', skill: 'build', pressure: b.id === 'pad' ? GOAL_P.pad : Math.max(GOAL_P.build, (isl.stationP || {})[b.id] || 0), open: () => !b.gone && (b.claims || 0) < 3 && (!b.built || (b.upgrading && b.upProgress < 1)), task: () => ({ type: 'build', phase: 'go', b, t: 0 }) });
  });
  // adorn: flourishes after real building work
  const adTarget = flourishTarget(isl);
  if (adTarget > 0) {
    for (const b of live(isl)) {
      if (!b.built || b.upgrading || !FLOURISH_IDS.has(b.id) || b.id === 'council') continue;
      push({
        key: `adorn:${isl.buildings.indexOf(b)}`, kind: 'adorn', skill: 'build', pressure: 1.4,
        open: () => b.built && !b.gone && !b.upgrading && (b.flourish | 0) < flourishTarget(isl) && (b.claims || 0) < 1 && (b.adPaid || ((c) => !!c && canAfford(isl, c, GOAL_P.spend))(flourishCost(isl, b.flourish | 0))),
        task: () => ({ type: 'build', phase: 'go', b, t: 0, adorn: true }),
      });
    }
  }
  // adorn: the council hall is raised tier by tier at the home island's rung, free of goods
  if (isl.id === HOME_ID) {
    const b = councilBuilding(world);
    if (b && b.built) {
      push({
        key: `council:${isl.buildings.indexOf(b)}`, kind: 'adorn', skill: 'build', pressure: 1.6,
        open: () => b.built && !b.gone && !b.upgrading && (b.flourish | 0) < councilFlourishTarget(world) && (b.claims || 0) < 1,
        task: () => ({ type: 'build', phase: 'go', b, t: 0, adorn: true }),
      });
    }
  }
  // links: tiers on done links and construction of building ones
  for (const l of world.links) {
    if (l.a !== isl.id && l.b !== isl.id) continue;
    if (l.state === 'done' || l.state === 'building') {
      const end = l.a === isl.id ? l.ai : l.bi;
      push({
        key: `ladorn:${l.id}`, kind: 'adorn', skill: 'build', pressure: 1.5,
        open: () => l.state === 'done' && (l.tier | 0) < linkCap(world, l) && (l.claims || 0) < 1 && !!isl.reach && !!isl.reach[cidx(end.i, end.j)] && !((adornCd.get(l) || {})[isl.id] > world.time) && (l.adPaid || ((c) => !!c && canAfford(isl, c, GOAL_P.spend))(flourishCost(isl, l.tier | 0))),
        task: () => ({ type: 'build', phase: 'go', b: l, t: 0, adorn: true }),
      });
    }
    if (l.state === 'building' && l.type !== 'vine' && l.a === isl.id) {
      const toward = gainToward(world, isl, world.islands.get(l.a === isl.id ? l.b : l.a) || isl) > 0;
      push({ key: `link:${l.id}`, kind: 'link', skill: 'build', pressure: toward ? GOAL_P.linkToward : GOAL_P.link, open: () => l.state === 'building' && (l.claims || 0) < 3, task: () => ({ type: 'build', phase: 'go', b: l, t: 0 }) });
    }
  }
  // craft: stations whose output the island wants, plus a floor of basics so idle hands have stock to make
  if (isl.want && storehouse(isl)) {
    for (const b of builtOf(isl)) {
      const def = BUILDINGS[b.id];
      if (!def.recipe) continue;
      [def.recipe, def.recipe2].forEach((rec, ri) => {
        if (!rec) return;
        const outG = Object.keys(rec.out)[0];
        const floor = SINK_CRAFT[outG] || 0;
        push({
          key: `craft:${isl.buildings.indexOf(b)}:${ri}`, kind: 'craft', skill: 'craft', pressure: 2.8,
          press: () => ((((isl.want || {})[outG] || 0) > stockGet(isl, outG) || ((isl.treeTarget || {})[outG] || 0) > stockGet(isl, outG)) ? Math.max(2.8, (isl.goodP || {})[outG] || 0) : 0.9),
          open: () => !b.busy && !(b.burn > 3) && !b.gone && ((((isl.want || {})[outG]) || 0) > stockGet(isl, outG) || ((isl.treeTarget || {})[outG] || 0) > stockGet(isl, outG) || stockGet(isl, outG) < floor) && canAfford(isl, rec.in, Math.max(2.8, (isl.goodP || {})[outG] || 0)) && !(b.id === 'windmill' && world.weather.wind.s < 0.08),
          task: () => ({ type: 'craft', phase: 'fetch', b, rec, t: 0 }),
        });
      });
    }
  }
  // tend: eggs, feed and wool
  if (storehouse(isl)) {
    for (const b of [...builtOf(isl, 'coop'), ...builtOf(isl, 'pen')]) {
      const bi = isl.buildings.indexOf(b);
      const have = () => { let n = 0; let ready = 0; for (const a of world.animals) if (a.home === b) { n++; if (a.wool >= 1) ready++; } return { n, ready }; };
      if (b.id === 'pen') {
        push({ key: `tend:${bi}:shear`, kind: 'tend', skill: 'craft', pressure: 2.0, open: () => !b.tender && ((h) => h.n > 0 && h.ready > 0 && stockGet(isl, 'wool') < 8)(have()), task: () => ({ type: 'tend', phase: 'go', mode: 'shear', b, t: 0 }) });
        continue;
      }
      push({ key: `tend:${bi}:eggs`, kind: 'tend', skill: 'gather', pressure: 2.0, open: () => !b.tender && have().n > 0 && (b.eggs || 0) >= 3, task: () => ({ type: 'tend', phase: 'go', mode: 'eggs', b, t: 0 }) });
      push({ key: `tend:${bi}:feed`, kind: 'tend', skill: 'gather', pressure: 2.4, open: () => !b.tender && have().n > 0 && (b.feed || 0) < 1 && stockGet(isl, 'wheat') >= 1, task: () => ({ type: 'tend', phase: 'go', mode: 'feed', b, t: 0 }) });
      push({ key: `tend:${bi}:shrug`, kind: 'tend', skill: null, pressure: 0.6, open: () => !b.tender && have().n > 0 && (b.feed || 0) <= 0.02 && stockGet(isl, 'wheat') < 1 && (b.shrugT || 0) < world.time, task: () => ({ type: 'tend', phase: 'go', mode: 'shrug', b, t: 0 }) });
    }
  }
  // herd: lead surplus animals over a bridge
  push({ key: 'herd', kind: 'herd', skill: 'gather', pressure: 2.6, elig: (f) => !f.carry, open: () => !!herdPlanCached(world, isl), task: () => { const hp = herdPlanCached(world, isl); return hp ? { type: 'herd', phase: 'go', plan: { ...hp, members: [...hp.members] }, t: 0 } : null; } });
  // fish: the fisher angles whenever the larder runs low
  push({ key: 'fish', kind: 'fish', skill: 'gather', pressure: 2.4, res: (x) => x.kind === 'fish', elig: (f) => !!f.fisher, open: () => stockGet(isl, 'fish') < Math.max(4, pop * 2), task: (f, r) => ({ type: 'gather', phase: 'go', r, t: 0 }) });
  // gather: the goal trees' raw nodes (seats by the amount still missing), then wanted goods, then the stock idle hands keep up
  const treeRaw = new Set();
  for (const n of isl.tree || []) {
    if (n.kind !== 'gather') continue;
    treeRaw.add(n.good);
    push({
      key: `tg:${n.good}`, kind: 'gather', skill: 'gather', pressure: n.pressure, res: (x) => x.good === n.good,
      press: () => n.pressure, seats: () => gatherSeats(n.target - stockGet(isl, n.good)),
      open: () => stockGet(isl, n.good) < n.target,
      task: (f, r) => ({ type: 'gather', phase: 'go', r, t: 0 }),
    });
  }
  for (const g of Object.keys(isl.want || {})) {
    if (treeRaw.has(g)) continue;
    push({
      key: `gather:${g}`, kind: 'gather', skill: 'gather', pressure: 1.3, res: (x) => x.good === g,
      press: () => Math.max(1.3 + Math.min(Math.max(0, (isl.want[g] || 0) - stockGet(isl, g)), 6) * 0.22, (isl.goodP || {})[g] || 0),
      seats: () => gatherSeats((isl.want[g] || 0) - stockGet(isl, g)),
      open: () => (isl.want[g] || 0) - stockGet(isl, g) > 0,
      task: (f, r) => ({ type: 'gather', phase: 'go', r, t: 0 }),
    });
  }
  if (storehouse(isl)) {
    for (const g of Object.keys(SINK_RAW)) {
      push({ key: `stock:${g}`, kind: 'stock', skill: 'gather', pressure: 0.9, res: (x) => x.good === g, seats: () => Math.min(3, gatherSeats(SINK_RAW[g] - stockGet(isl, g))), open: () => stockGet(isl, g) < SINK_RAW[g] && !((isl.want || {})[g] > stockGet(isl, g)), task: (f, r) => ({ type: 'gather', phase: 'go', r, t: 0 }) });
    }
  }
  // relight: a rained-out campfire is lit again once it is dry
  for (const b of [...builtOf(isl, 'campfire'), ...builtOf(isl, 'bonfire')]) {
    push({ key: `relight:${isl.buildings.indexOf(b)}`, kind: 'relight', skill: 'gather', pressure: 3.0, open: () => b.lit === false && (b.dryT || 0) > 12 && !b.relighting && stockGet(isl, 'wood') >= 1, task: () => ({ type: 'relight', phase: 'go', b, t: 0 }) });
  }
  // plant: folk sow what the island lacks
  for (const w of Object.keys(isl.plantWant || {})) {
    const base = w === 'flower' ? 0.45 : w === 'vine' ? 2.6 : 1.5;
    push({
      key: `plant:${w}`, kind: 'plant', skill: 'gather', pressure: base,
      press: () => Math.max(base + Math.min((isl.plantWant || {})[w] || 0, 5) * 0.18, (isl.plantP || {})[w] || 0),
      elig: (f) => f.stage !== 'child',
      open: () => !!(isl.plantWant && isl.plantWant[w]) && !((isl.noPlant && isl.noPlant[w] > world.time) || (isl.planting && isl.planting[w] >= 2)),
      task: () => ({ type: 'plant', phase: 'go', want: w, t: 0 }),
    });
  }
  // trade: a porter takes a waiting trade job
  (world.tradeJobs || []).forEach((j, ji) => {
    if (j.from !== isl.id) return;
    push({ key: `trade:${ji}`, kind: 'trade', skill: 'porter', pressure: 2.2, elig: (f) => f.stage === 'adult', open: () => !j.taken, task: () => ({ type: 'trade', phase: 'fetch', job: j }) });
  });
  // dock: porters at an airdock carry crates while a hull loads
  push({
    key: 'dock', kind: 'dock', skill: 'porter', pressure: 2.6,
    elig: (f) => f.stage === 'adult' && !f.carry && !!storehouse(isl) && !((isl.dockCd || 0) > world.time),
    open: () => !!dockShipOf(world, isl),
    task: () => { const s = dockShipOf(world, isl); return s ? { type: 'dockwork', phase: 'go', ship: s.id, t: 0, age: 0 } : null; },
  });
  // capital: the council's scouts, settlers and link crews for this island's folk; the planner posts the data, the order keeps the live checks
  const cap = world.cap;
  if (cap) {
    for (const e of cap.exp) {
      const to = e.src === isl.id ? world.islands.get(e.to) : null;
      if (!to) continue;
      push({
        key: e.key, kind: 'expedition', skill: 'wonder', press: () => 2.0 + gainToward(world, isl, to) + e.urgent * 2.5 + (world.skillNeed && relicFor(to, world.skillNeed) ? 2.5 : 0), pressure: 2.0 + gainToward(world, isl, to) + e.urgent * 2.5,
        seats: EXPEDITION.scout, elig: (f) => mayLeave(world, isl, f), open: () => !to.revealed || !to.explored,
        task: () => { const route = routeOver(world, isl.id, to.id); return route && route.length ? { type: 'cross', link: route[0].link, route, hop: 0, phase: 'farewell', t: 0, fromIsle: isl.id, dest: to.id } : null; },
      });
    }
    for (const e of cap.settle) {
      const to = e.src === isl.id ? world.islands.get(e.to) : null;
      if (!to) continue;
      push({
        key: e.key, kind: 'expedition', skill: 'wonder', pressure: 2.0 + gainToward(world, isl, to), seats: EXPEDITION.party, settle: true,
        elig: (f, used) => mayLeave(world, isl, f, used > 0),
        // Note: the lead claims the island and the kit; a second settler may still join the party that left.
        open: (used) => !storehouse(to) && !world.folkOn(to.id).length && (used > 0 || (!to.hasSettlers && !world.inboundTo(to.id) && stockGet(isl, 'wood') >= 3)),
        task: (f, r, n) => { const route = routeOver(world, isl.id, to.id); return route && route.length ? { type: 'cross', link: route[0].link, route, hop: 0, phase: 'farewell', t: 0, fromIsle: isl.id, dest: to.id, settle: true, lead: n === 0, kit: null } : null; },
      });
    }
    for (const e of cap.crew) {
      const l = e.src === isl.id ? world.links.find((q) => q.id === e.link) : null;
      const X = l ? world.islands.get(e.to) : null;
      if (!X) continue;
      push({
        key: e.key, kind: 'link', skill: 'build', pressure: GOAL_P.linkToward, seats: 1,
        elig: (f) => mayLeave(world, isl, f, true),
        open: () => l.state === 'building' && (l.claims || 0) < 3 && !residentsOf(world, X.id).some((o) => o.stage !== 'child'),
        task: () => { const route = routeOver(world, isl.id, X.id); return route && route.length ? { type: 'cross', link: route[0].link, route, hop: 0, phase: 'go', t: 0, fromIsle: isl.id, dest: X.id, then: l } : null; },
      });
    }
  }
  return out;
}

// Note: a hull loading or unloading at one of this island's docks; at most two porters per hull.
export function dockShipOf(world, isl) {
  for (const s of world.ships || []) {
    if (s.from !== isl.id || (s.state !== 'load' && s.state !== 'unload') || s.dock < 0) continue;
    const db = isl.buildings[s.dock];
    if (!db || db.gone || !db.door) continue;
    let n = 0;
    for (const o of world.folk) if (o.task && o.task.type === 'dockwork' && o.task.ship === s.id) n++;
    if (n < 2) return s;
  }
  return null;
}

// Note: the island's orders, regenerated at most every REFRESH seconds; keys stay stable so claims survive a refresh.
export function ordersOf(world, isl) {
  const b = isl.board || (isl.board = { t: -1e9, orders: [] });
  if (world.time - b.t >= REFRESH) { b.orders = generate(world, isl); b.t = world.time; }
  return b.orders;
}

// Note: every order f may take as scored candidates { s, t }; the caller picks the highest.
export function boardCandidates(world, isl, f) {
  const counts = claimCounts(world);
  const cands = [];
  const ind = f.needs.industry === undefined ? 0.6 : f.needs.industry;
  const exp = f.needs.explore === undefined ? 0.7 : f.needs.explore;
  const bel = f.needs.belonging === undefined ? 0.7 : f.needs.belonging;
  for (const o of ordersOf(world, isl)) {
    const used = counts.get(o.key) || 0;
    const cap = typeof o.seats === 'function' ? o.seats() : o.seats;
    if (cap !== undefined && used >= cap) continue;
    if (o.elig && !o.elig(f, used)) continue;
    if (o.open && !o.open(used)) continue;
    let r = null; let d = 0;
    if (o.res) { r = nearestRes(isl, f, o.res); if (!r) continue; d = Math.hypot(r.i + 0.5 - f.x, r.j + 0.5 - f.z); }
    const t = o.task(f, r, used);
    if (!t) continue;
    t.order = o.key;
    let p = o.press ? o.press(f) : o.pressure;
    if (o.kind === 'expedition') {
      // Note: the explore urge lifts it, a bed and small children hold the folk home.
      const small = world.folk.some((c) => c.stage === 'child' && c.pars && c.pars.includes(f.id));
      p = Math.max(0.05, p + 6 * (1 - exp) * (1 - exp) - 1.2 * bel * (f.home >= 0 ? 1 : 0.5) - (small ? 0.6 : 0));
    } else if (WORK_KINDS.has(o.kind)) p += 1.5 * (1 - ind) * (1 - ind);
    let s = p * (o.skill ? f.talent[o.skill] : 1);
    if (o.res) s *= (6 / (3 + d)) * 1.2;
    cands.push({ s, t });
  }
  return cands;
}

