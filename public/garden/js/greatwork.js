// Note: pure Great Work stage machine; no world, view or RNG, callers apply the returned events.
// Note: seven slots: 0 = foundation from common goods, 1..6 = the six rare goods in fixed contract order.
// Attention: the player picks the delivery order, so slot k is bound to its good, not to the k-th delivery.

import { GW_FOUNDATION, GW_STAGES } from './content/defs.js';

// Note: the stage table lives in content/defs.js; slot k is GW_STAGES[k].
export { GW_FOUNDATION, GW_STAGES };
export const GW_RARE = GW_STAGES.slice(1).map((s) => s.good);
export const GW_RARE_COST = 1;
export const GW_SLOTS = GW_STAGES.length;
export const GW_FAR_RING = 4;
export const GW_FAR_RARE_CHANCE = 0.2;
export const GW_FAR_YIELD_MUL = 1.5;
// Note: far-ring raw goods that can come out as a rarer good after the beacon is lit.
export const GW_FAR_RARER = { stone: 'crystal', ore: 'crystal', clay: 'crystal' };

const FOUNDATION_IDS = Object.keys(GW_FOUNDATION);

export function newGw() {
  return { stage: new Array(GW_SLOTS).fill(false), paid: {}, lit: false, litAt: null, order: [] };
}

const paidOf = (gw, g) => gw.paid[g] || 0;
const foundationDone = (gw) => FOUNDATION_IDS.every((g) => paidOf(gw, g) >= GW_FOUNDATION[g]);

// Note: derives every stage bool from paid, so no inconsistent state survives.
function sync(gw) {
  const fd = foundationDone(gw);
  gw.stage[0] = fd;
  for (let k = 0; k < GW_RARE.length; k++) gw.stage[k + 1] = fd && paidOf(gw, GW_RARE[k]) >= GW_RARE_COST;
  if (gw.stage.every(Boolean)) gw.lit = true;
}

export function gwStageCount(gw) { return gw.stage.reduce((n, s) => n + (s ? 1 : 0), 0); }
export function gwLit(gw) { return !!gw.lit; }
// Note: the Spire mesh stage 0..7 equals the number of finished stages.
export function gwBuildStage(gw) { return gwStageCount(gw); }
export function gwProgress(gw) { return gwStageCount(gw) / GW_SLOTS; }
export function gwPhase(gw) { return gw.lit ? 'lit' : gw.stage[0] ? 'rare' : 'foundation'; }
export function gwStageGood(slot) { return slot === 0 ? null : GW_RARE[slot - 1] || null; }

// Note: goods still accepted now, as {good: remaining}; rare goods only after the foundation, each once.
export function gwNeeds(gw) {
  const out = {};
  if (gw.lit) return out;
  if (!gw.stage[0]) {
    for (const g of FOUNDATION_IDS) { const r = GW_FOUNDATION[g] - paidOf(gw, g); if (r > 0) out[g] = r; }
    return out;
  }
  for (const g of GW_RARE) { const r = GW_RARE_COST - paidOf(gw, g); if (r > 0) out[g] = r; }
  return out;
}

// Note: only the rare goods of gwNeeds, in contract order; empty until the foundation stands. The fleet ledger fetches these.
export function gwRareNeeds(gw) {
  const all = gwNeeds(gw);
  const out = {};
  for (const g of GW_RARE) if (all[g] > 0) out[g] = all[g];
  return out;
}

export function gwAccepts(gw, good) { return (gwNeeds(gw)[good] || 0) > 0; }

// Note: takes at most what is still owed; the caller keeps the rest. Events are returned, never emitted.
export function gwDeliver(gw, good, n = 1, t = null) {
  const res = { taken: 0, events: [], reason: null };
  if (gw.lit) { res.reason = 'lit'; return res; }
  const rare = GW_RARE.includes(good);
  if (!rare && !FOUNDATION_IDS.includes(good)) { res.reason = 'unknown'; return res; }
  if (rare && !gw.stage[0]) { res.reason = 'foundation'; return res; }
  const owed = (gwNeeds(gw)[good] || 0);
  if (owed <= 0) { res.reason = 'done'; return res; }
  const take = Math.min(Math.max(0, Math.floor(n)), owed);
  if (take <= 0) { res.reason = 'none'; return res; }
  const before = gw.stage.slice();
  const wasLit = gw.lit;
  gw.paid[good] = paidOf(gw, good) + take;
  res.taken = take;
  sync(gw);
  for (let s = 0; s < GW_SLOTS; s++) {
    if (!before[s] && gw.stage[s]) {
      if (s > 0) gw.order.push(GW_RARE[s - 1]);
      res.events.push({ type: 'gwstage', index: s, good: s === 0 ? 'foundation' : GW_RARE[s - 1], count: gwStageCount(gw) });
    }
  }
  if (!wasLit && gw.lit) { gw.litAt = t; res.events.push({ type: 'gwlit' }); }
  return res;
}

// Note: moves every accepted good out of a plain stock object {good: n}; loops so a finished foundation frees rare goods in the same pass.
export function gwDrain(gw, stock, t = null) {
  const out = { moved: {}, events: [] };
  for (let guard = 0; guard < 64; guard++) {
    let progress = false;
    const need = gwNeeds(gw);
    for (const g of [...FOUNDATION_IDS, ...GW_RARE]) {
      const have = stock[g] || 0;
      if (!need[g] || have <= 0) continue;
      const r = gwDeliver(gw, g, have, t);
      if (r.taken <= 0) continue;
      stock[g] = have - r.taken;
      out.moved[g] = (out.moved[g] || 0) + r.taken;
      out.events.push(...r.events);
      progress = true;
      break;
    }
    if (!progress) break;
  }
  return out;
}

// Note: post-completion flags; all derive from lit, so they need no save field of their own.
export function gwFlags(gw) {
  const lit = !!gw.lit;
  return { lit, beacon: lit, whaleClouds: lit, farRarer: lit, farRing: lit ? GW_FAR_RING : Infinity };
}
// Note: the deck weight multiplier for the whale-cloud event; zero until the beacon burns.
export function gwWhaleWeight(gw) { return gw.lit ? 1 : 0; }
export function gwFarBonus(gw, ring) {
  if (!gw.lit || ring < GW_FAR_RING) return { rareChance: 0, yieldMul: 1 };
  return { rareChance: GW_FAR_RARE_CHANCE, yieldMul: GW_FAR_YIELD_MUL };
}
// Note: roll is a caller-supplied 0..1 value; the module itself holds no RNG.
export function gwFarGood(gw, ring, good, roll) {
  const b = gwFarBonus(gw, ring);
  return roll < b.rareChance && GW_FAR_RARER[good] ? GW_FAR_RARER[good] : good;
}

export function gwToJSON(gw) {
  // Note: paid keys come out in contract order, so equal states give equal JSON.
  const paid = {};
  for (const g of [...FOUNDATION_IDS, ...GW_RARE]) if (gw.paid[g] > 0) paid[g] = gw.paid[g];
  return { stage: gw.stage.slice(), paid, lit: !!gw.lit, litAt: gw.litAt ?? null, order: gw.order.slice() };
}

// Note: restores from the contract fields alone; paid and stage are reconciled, order and litAt are optional.
export function gwFromJSON(o) {
  const gw = newGw();
  if (!o || typeof o !== 'object') return gw;
  const st = Array.isArray(o.stage) ? o.stage : [];
  const paid = o.paid && typeof o.paid === 'object' ? o.paid : {};
  for (const g of FOUNDATION_IDS) { const v = Math.max(0, Math.min(GW_FOUNDATION[g], Math.floor(Number(paid[g]) || 0))); if (v > 0) gw.paid[g] = v; }
  if (st[0]) for (const g of FOUNDATION_IDS) gw.paid[g] = GW_FOUNDATION[g];
  if (foundationDone(gw)) {
    for (let k = 0; k < GW_RARE.length; k++) {
      const g = GW_RARE[k];
      if (st[k + 1] || (Number(paid[g]) || 0) >= GW_RARE_COST) gw.paid[g] = GW_RARE_COST;
    }
  }
  // Warning: a lit save without full stages is trusted; the whole monument counts as built.
  if (o.lit) {
    for (const g of FOUNDATION_IDS) gw.paid[g] = GW_FOUNDATION[g];
    for (const g of GW_RARE) gw.paid[g] = GW_RARE_COST;
  }
  sync(gw);
  gw.litAt = gw.lit && typeof o.litAt === 'number' ? o.litAt : null;
  const seen = new Set();
  for (const g of Array.isArray(o.order) ? o.order : []) if (GW_RARE.includes(g) && gw.paid[g] >= GW_RARE_COST && !seen.has(g)) { seen.add(g); gw.order.push(g); }
  // Note: rare goods missing from a short or absent order keep fixed contract order.
  for (const g of GW_RARE) if (gw.paid[g] >= GW_RARE_COST && !seen.has(g)) { seen.add(g); gw.order.push(g); }
  return gw;
}
