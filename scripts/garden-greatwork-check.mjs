// Note: node check for the pure Great Work stage machine; run with `node scripts/garden-greatwork-check.mjs`.

import {
  GW_FOUNDATION, GW_RARE, GW_SLOTS, newGw, gwNeeds, gwDeliver, gwDrain, gwStageCount, gwLit, gwBuildStage, gwAccepts,
  gwFlags, gwWhaleWeight, gwFarBonus, gwFarGood, gwToJSON, gwFromJSON, gwPhase, gwProgress,
} from '../public/garden/js/greatwork.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };

// Note: seeded generator so every failure replays; the module itself holds no RNG.
function lcg(s) { let a = s >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }

function perms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => { for (const p of perms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}

const COST_TOTAL = Object.values(GW_FOUNDATION).reduce((a, b) => a + b, 0) + GW_RARE.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Note: runs one full game; noise injects early rares, repeats, over-deliveries and unknown goods between real deliveries.
function play(order, seed) {
  const rnd = lcg(seed);
  const gw = newGw();
  const events = []; let taken = 0; let lastCount = 0; let boundOk = true; let monotone = true;
  const accepted = [];
  const feed = (g, n) => {
    const r = gwDeliver(gw, g, n, 100);
    taken += r.taken; events.push(...r.events);
    if (r.taken && GW_RARE.includes(g)) accepted.push(g);
    const c = gwStageCount(gw);
    if (c < lastCount) monotone = false;
    lastCount = c;
    for (const k in gw.paid) {
      const cap = GW_FOUNDATION[k] ?? 1;
      if (gw.paid[k] > cap) boundOk = false;
    }
    return r;
  };
  const noise = () => {
    const x = rnd();
    if (x < 0.3) feed(GW_RARE[Math.floor(rnd() * 6)], 1 + Math.floor(rnd() * 3));
    else if (x < 0.5) feed('stone', Math.floor(rnd() * 9));
    else if (x < 0.6) feed('wheat', 3);
    else if (x < 0.7) feed('plank', -2);
  };
  let early = 0;
  for (let k = 0; k < 3; k++) { const r = gwDeliver(gw, GW_RARE[k], 1); if (r.taken) early++; }
  ok(early === 0 && gwStageCount(gw) === 0 && !gw.lit, `seed ${seed}: rares are refused before the foundation`);
  const found = Object.entries(GW_FOUNDATION).flatMap(([g, n]) => Array(n + 3).fill(g));
  for (let i = found.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [found[i], found[j]] = [found[j], found[i]]; }
  for (const g of found) { feed(g, 1 + Math.floor(rnd() * 3)); noise(); }
  for (const g of order) { noise(); feed(g, 1 + Math.floor(rnd() * 2)); feed(g, 1); noise(); }
  const late = gwDeliver(gw, 'prism', 1);
  const late2 = gwDeliver(gw, 'stone', 1);
  return { gw, events, taken, boundOk, monotone, late, late2, accepted };
}

// Note: 1) every order of the six rare goods completes
const all = perms(GW_RARE);
ok(all.length === 720, 'there are 720 permutations');
let n = 0;
for (const order of all) {
  const r = play(order, 1000 + n++);
  const st = r.events.filter((e) => e.type === 'gwstage');
  const tag = order.join(',');
  ok(r.gw.lit && gwLit(r.gw) && gwStageCount(r.gw) === GW_SLOTS, `${tag}: completes lit`);
  ok(st.length === 7, `${tag}: exactly 7 gwstage events (${st.length})`);
  ok(new Set(st.map((e) => e.index)).size === 7 && st[0].index === 0, `${tag}: each slot once, foundation first`);
  // Note: noise may deliver a rare good early; the accepted order, not the plan, is the truth.
  ok(same(st.slice(1).map((e) => e.good), r.accepted) && same([...r.accepted].sort(), [...GW_RARE].sort()), `${tag}: events follow the accepted order, each good once`);
  ok(same(st.map((e) => e.count), [1, 2, 3, 4, 5, 6, 7]), `${tag}: counts rise by one`);
  ok(r.events.filter((e) => e.type === 'gwlit').length === 1, `${tag}: gwlit exactly once`);
  ok(r.events[r.events.length - 1].type === 'gwlit', `${tag}: gwlit is last`);
  ok(r.taken === COST_TOTAL, `${tag}: no double count, took ${r.taken} of ${COST_TOTAL}`);
  ok(r.boundOk && r.monotone, `${tag}: paid never exceeds cost, count never drops`);
  ok(r.late.taken === 0 && r.late2.taken === 0 && r.late.reason === 'lit', `${tag}: nothing accepted after lit`);
  ok(Object.keys(gwNeeds(r.gw)).length === 0 && gwBuildStage(r.gw) === 7, `${tag}: no needs left`);
  ok(same(r.gw.order, r.accepted), `${tag}: order list kept`);
}

// Note: 1b) clean runs: the exact player order is kept, with no noise
for (const order of all) {
  const gw = newGw(); const ev = [];
  for (const [g, c] of Object.entries(GW_FOUNDATION)) for (let k = 0; k < c; k++) ev.push(...gwDeliver(gw, g, 1).events);
  for (const g of order) ev.push(...gwDeliver(gw, g, 1).events);
  const goods = ev.filter((e) => e.type === 'gwstage').map((e) => e.good);
  ok(same(goods, ['foundation', ...order]) && gw.lit && same(gw.order, order), `${order.join(',')}: clean run keeps the order`);
}

// Note: 2) needs and phases
{
  const gw = newGw();
  ok(same(gwNeeds(gw), GW_FOUNDATION) && gwPhase(gw) === 'foundation', 'start needs the foundation goods only');
  ok(!gwAccepts(gw, 'moonpearl') && gwAccepts(gw, 'stone') && !gwAccepts(gw, 'wheat'), 'accepts only foundation goods at start');
  for (const [g, c] of Object.entries(GW_FOUNDATION)) gwDeliver(gw, g, c);
  ok(gwPhase(gw) === 'rare' && gwStageCount(gw) === 1 && gwProgress(gw) === 1 / 7, 'foundation done is stage 1 of 7');
  ok(Object.keys(gwNeeds(gw)).length === 6 && GW_RARE.every((g) => gwNeeds(gw)[g] === 1), 'all six rare goods wanted');
  ok(!gwAccepts(gw, 'stone'), 'common goods refused after the foundation');
  const r = gwDeliver(gw, 'sunstone', 5);
  ok(r.taken === 1 && gwNeeds(gw).sunstone === undefined && Object.keys(gwNeeds(gw)).length === 5, 'a rare good is taken once and over-delivery is returned');
  ok(gwDeliver(gw, 'sunstone', 1).reason === 'done', 'a repeat rare good is refused');
  const p = gwDeliver(newGw(), 'stone', 4);
  ok(p.taken === 4 && p.events.length === 0, 'partial foundation delivery raises no stage');
  const g2 = newGw(); gwDeliver(g2, 'stone', 100);
  ok(g2.paid.stone === 6, 'delivery is capped at what is owed');
}

// Note: 3) drain from a stock object
{
  const gw = newGw();
  const stock = { stone: 10, plank: 4, brick: 2, moonpearl: 2, prism: 1, wheat: 5 };
  const r = gwDrain(gw, stock, 5);
  ok(gwStageCount(gw) === 0 && stock.brick === 0 && gw.paid.brick === 2 && !gw.stage[0], 'drain stops short of the foundation without enough brick');
  ok(stock.moonpearl === 2 && stock.prism === 1, 'rare goods stay in stock before the foundation');
  stock.brick = 3;
  const r2 = gwDrain(gw, stock, 6);
  ok(gw.stage[0] && gw.stage[1] && gw.stage[2] && gwStageCount(gw) === 3, 'drain finishes the foundation then takes held rare goods');
  ok(stock.stone === 4 && stock.plank === 0 && stock.brick === 2 && stock.moonpearl === 1 && stock.prism === 0 && stock.wheat === 5, 'drain leaves surplus in stock');
  ok(r.events.length === 0 && r2.events.filter((e) => e.type === 'gwstage').length === 3, 'drain returns the stage events');
  const full = { stone: 6, plank: 4, brick: 3, ...Object.fromEntries(GW_RARE.map((g) => [g, 1])) };
  const r3 = gwDrain(newGw(), full, 9);
  ok(r3.events.filter((e) => e.type === 'gwlit').length === 1 && Object.values(full).every((v) => v === 0), 'one drain can finish everything');
}

// Note: 4) save roundtrip at every step
{
  const order = ['obsidian', 'moonpearl', 'sunstone', 'prism', 'everbloom', 'sulphur'];
  const gw = newGw();
  const steps = [...Object.entries(GW_FOUNDATION).flatMap(([g, c]) => Array(c).fill(g)), ...order];
  let bad = 0;
  for (const g of steps) {
    gwDeliver(gw, g, 1, 77);
    const back = gwFromJSON(JSON.parse(JSON.stringify(gwToJSON(gw))));
    if (!same(gwToJSON(back), gwToJSON(gw))) bad++;
    // Note: contract-only fields must restore the same stages and paid goods.
    const lean = gwFromJSON({ stage: gw.stage, paid: gw.paid, lit: gw.lit });
    if (!same(lean.stage, gw.stage) || !same(gwToJSON(lean).paid, gwToJSON(gw).paid) || lean.lit !== gw.lit) bad++;
  }
  ok(bad === 0, `save roundtrip equals at all ${steps.length} steps (${bad} bad)`);
  const back = gwFromJSON(gwToJSON(gw));
  ok(back.lit && back.litAt === 77 && same(back.order, order), 'lit time and player order survive');
  ok(gwDeliver(back, 'prism', 1).taken === 0 && gwDeliver(back, 'stone', 1).taken === 0, 'a restored lit monument takes nothing');
  const mid = gwFromJSON({ stage: [true, false, true, false, false, false, false], paid: { stone: 6, plank: 4, brick: 3, prism: 1 } });
  ok(mid.stage[2] && gwStageCount(mid) === 2 && gwNeeds(mid).prism === undefined && gwNeeds(mid).moonpearl === 1, 'a half-built save keeps the chosen stage');
  // Note: inconsistent saves are reconciled, not trusted.
  const bogus = gwFromJSON({ stage: [false, true, true, true, true, true, true], paid: { prism: 1 }, lit: false });
  ok(gwStageCount(bogus) === 0 && !bogus.lit && !bogus.paid.prism, 'rare stages without a foundation are dropped');
  const over = gwFromJSON({ stage: [], paid: { stone: 99, plank: -3, brick: 'x' } });
  ok(over.paid.stone === 6 && !over.paid.plank && !over.paid.brick, 'paid is clamped');
  const litOnly = gwFromJSON({ stage: [], paid: {}, lit: true });
  ok(litOnly.lit && gwStageCount(litOnly) === 7, 'a lit save counts as built');
  for (const junk of [null, undefined, 5, 'x', {}, { stage: 'no', paid: 3 }]) ok(gwStageCount(gwFromJSON(junk)) === 0, `junk ${JSON.stringify(junk)} restores empty`);
  const dup = gwFromJSON({ stage: [true, true, false, false, false, false, false], paid: {}, order: ['prism', 'prism', 'nope', 'moonpearl'] });
  ok(same(dup.order, ['moonpearl']), 'order keeps only delivered rare goods once');
}

// Note: 5) determinism
{
  const a = play(GW_RARE, 4242); const b = play(GW_RARE, 4242);
  ok(same(gwToJSON(a.gw), gwToJSON(b.gw)) && same(a.events, b.events), 'same sequence gives same state and events');
  const c = play([...GW_RARE].reverse(), 4242);
  ok(!same(gwToJSON(a.gw).order, gwToJSON(c.gw).order) && gwStageCount(c.gw) === 7, 'a different order differs only in order');
}

// Note: 6) post-completion flags
{
  const gw = newGw();
  const f0 = gwFlags(gw);
  ok(!f0.lit && !f0.whaleClouds && !f0.farRarer && f0.farRing === Infinity && gwWhaleWeight(gw) === 0, 'no post flags before lit');
  ok(gwFarBonus(gw, 5).rareChance === 0 && gwFarGood(gw, 5, 'stone', 0) === 'stone', 'no far bonus before lit');
  const r = play(GW_RARE, 7);
  const f1 = gwFlags(r.gw);
  ok(f1.lit && f1.beacon && f1.whaleClouds && f1.farRarer && f1.farRing === 4 && gwWhaleWeight(r.gw) === 1, 'post flags after lit');
  ok(gwFarBonus(r.gw, 3).rareChance === 0 && gwFarBonus(r.gw, 4).rareChance > 0 && gwFarBonus(r.gw, 6).yieldMul > 1, 'far bonus only from the far ring');
  ok(gwFarGood(r.gw, 5, 'stone', 0.01) === 'crystal' && gwFarGood(r.gw, 5, 'stone', 0.9) === 'stone' && gwFarGood(r.gw, 2, 'stone', 0.01) === 'stone' && gwFarGood(r.gw, 5, 'wood', 0.01) === 'wood', 'far roll upgrades only mapped goods in far rings');
}

console.log(failures ? `garden-greatwork-check: ${failures} failure(s)` : 'garden-greatwork-check: ok');
process.exit(failures ? 1 : 0);
