// Note: money, supplies, ammunition, wages and treatment: prices, purchases, consumption, shortage escalation, payroll and the ammunition pool. Pure, no DOM or Phaser.

import {
  PLACES, GOODS, SELL_FACTOR, TRANSPORT, LODGING_CENTS_PER_DAY, WATER_LITRES_PER_DAY, FOOD_PER_DAY,
} from './world.js';
import {
  clamp, dice, partyOf, charById, sheriffOf, logLine, dollars, round2, own, finite,
} from './base.js';
import {
  activeInjuries, mood, wantsToLeave, kill, refuses,
} from './crew.js';
import { WEAPONS, AMMO_TYPES, BASE_AMMO } from '../weapons.js';
import { stockedModels, slotOf, canCarry, orderLoadout } from './arsenal.js';
import { wearOf } from './progress.js';
import { hasTrait, note } from './traits.js';

// Note: the most spare rounds of one cartridge a person takes into a scene.
export const RESERVE_CAP = 36;

export const hasStore = (placeId) => !!(PLACES[placeId] && PLACES[placeId].services.store);
export const hasLivery = (placeId) => !!(PLACES[placeId] && PLACES[placeId].services.livery);

// Note: R1-2: goods are found by their own keys only, so 'constructor' or '__proto__' is no good.
const goodOf = (goodId) => (own(GOODS, goodId) ? GOODS[goodId] : null);

export function priceOf(placeId, goodId) {
  const g = goodOf(goodId);
  const p = PLACES[placeId];
  if (!g || !p) return null;
  return Math.max(1, Math.round(g.cents * (p.services.store || 1)));
}

// Note: how much a party of n can carry on a kind of transport; stock never goes past it.
export function capacityOf(kind, n) {
  const wagon = kind === 'wagon';
  const m = Math.max(1, n);
  return { food: 8 * m + (wagon ? 40 : 0), water: 8 * m + (wagon ? 80 : 0), feed: kind === 'foot' ? 0 : 6 * m + (wagon ? 12 : 0) };
}

// Note: R1-1: who rides out of a town: the sheriff, plus the chosen ids when given, else everyone with the party or in the party's town; those who refuse stay behind. On the road it is the party.
export function departing(state, ids) {
  if (!state.at || state.journey) return partyOf(state);
  const here = state.crew.filter((c) => c.where === 'party' || c.where === state.at);
  const sheriff = sheriffOf(state);
  const out = sheriff ? [sheriff] : [];
  for (const id of Array.isArray(ids) ? ids : here.map((c) => c.id)) {
    const c = here.find((x) => x.id === id);
    if (c && !out.includes(c) && !refuses(state, c)) out.push(c);
  }
  return out;
}

// Note: shop(), prepare() and depart() all size the load by departing(), so they agree on what the party can carry.
export const capacity = (state, ids) => capacityOf(state.transport.kind, departing(state, ids).length);

export function sellValue(state, placeId, goodId) {
  const g = goodOf(goodId);
  const price = priceOf(placeId, goodId);
  return g && price != null ? Math.round(price * (SELL_FACTOR[g.kind] || 0.5)) : 0;
}

export function shop(state, placeId) {
  const p = PLACES[placeId];
  if (!p || (!p.services.store && !p.services.livery)) return [];
  return Object.values(GOODS)
    .filter((g) => (g.kind === 'transport' ? p.services.livery : p.services.store) && stocks(p, g, state))
    .map((g) => ({ id: g.id, label: g.label, kind: g.kind, lot: g.lot, cents: priceOf(placeId, g.id), sells: g.kind === 'transport' ? state.transport.kind === g.transport : g.kind !== 'weapon' }));
}

// Note: item 365: a store stocks the models of its size and region and the cartridges they and the region's guns take.
function stocks(p, g, state) {
  // Note: item 471: the gunsmith the office has found sells every model in the roster.
  if (g.kind === 'weapon' && state.rewards.gunsmith === p.id) return true;
  if (g.kind === 'weapon') return stockedModels(p.size ?? 3, p.region).includes(g.weapon.id);
  // Note: item 499: only an office whose player has earned the Ironman reward finds dynamite on the shelves.
  if (g.kind === 'explosive') return !!state.unlocks?.dynamite;
  if (g.kind !== 'ammo') return true;
  return BASE_AMMO.includes(g.ammoType) || stockedModels(Math.max(2, p.size ?? 3), p.region).some((id) => WEAPONS[id].ammoTypes.includes(g.ammoType));
}

// Note: whole lots cost the lot price; a part lot costs by the part, rounded up to a cent.
export const supplyCost = (price, lot, amount) => Math.max(1, Math.ceil(price * amount / lot - 1e-9));

export function buy(state, placeId, goodId, qty = 1, opts = {}) {
  const g = goodOf(goodId);
  const p = PLACES[placeId];
  if (!g || !p || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'Nothing to buy.' };
  if ((g.kind === 'transport' ? !p.services.livery : !p.services.store) || !stocks(p, g, state)) return { ok: false, reason: `${p.name} does not sell that.` };
  let cost = priceOf(placeId, goodId) * qty;
  const events = [];
  if (g.kind === 'transport') {
    qty = 1;
    cost = priceOf(placeId, goodId);
    if (state.transport.kind === g.transport) return { ok: false, reason: 'The party already has them.' };
    // Note: the old animals are taken in trade at the selling price.
    if (state.transport.kind !== 'foot') cost -= sellValue(state, placeId, state.transport.kind);
  }
  let amount = g.lot * qty;
  if (g.kind === 'supply') {
    const room = round2(capacity(state)[g.stock] - state.stock[g.stock]);
    if (room <= 0) return { ok: false, reason: 'The party cannot carry any more.' };
    // Note: asking for more than fits buys what fits, the last lot priced by the part taken, so one press fills the party up.
    amount = Math.min(amount, room);
    qty = round2(amount / g.lot);
    cost = supplyCost(priceOf(placeId, goodId), g.lot, amount);
  }
  if (state.cents <= 0 || state.cents < cost) return { ok: false, reason: state.cents <= 0 ? 'There is no money to spend.' : 'You cannot afford that.' };
  if (g.kind === 'supply') {
    state.stock[g.stock] = round2(state.stock[g.stock] + amount);
  } else if (g.kind === 'ammo') {
    state.ammo[g.ammoType] = (state.ammo[g.ammoType] || 0) + g.lot * qty;
  } else if (g.kind === 'explosive') {
    state.dynamite = (state.dynamite || 0) + qty;
  } else if (g.kind === 'weapon') {
    const who = opts.forId ? charById(state, opts.forId) : sheriffOf(state);
    if (!who) return { ok: false, reason: 'No one to carry it.' };
    // Note: item 367: within the carry limits it is carried; a further long gun stays with the transport or in the office; no one carries a third handgun or a second pocket pistol.
    const spare = slotOf(g.weapon) === 'long' && !canCarry(who.loadout, g.weapon);
    if (qty !== 1 || (!spare && !canCarry(who.loadout, g.weapon))) return { ok: false, reason: `${who.name} cannot carry another.` };
    (spare ? (who.stowed ||= []) : who.loadout).push({ ...g.weapon });
    if (!spare) orderLoadout(who.loadout);
    // Note: item 475: buying a model already bought before counts toward a favourite gun.
    who.gunBuys[g.weapon.id] = (who.gunBuys[g.weapon.id] || 0) + 1;
    if (who.gunBuys[g.weapon.id] >= 2) note(state, who, 'favorite-guns', events, { favorite: g.weapon.id });
  } else if (g.kind === 'transport') {
    state.transport = { kind: g.transport, name: g.transport === 'horse' ? 'the horses' : g.transport === 'mule' ? 'the mules' : 'the wagon' };
    // Note: the new animals need feed the party may not have; capacity() already follows the kind.
    for (const k of ['food', 'water', 'feed']) state.stock[k] = Math.min(state.stock[k], capacity(state)[k]);
  }
  state.cents -= cost;
  logLine(state, `Bought ${g.label.toLowerCase()}${qty > 1 ? ` x${qty}` : ''} for ${dollars(cost)}.`);
  return { ok: true, cost, qty, amount, events };
}

// Note: the order is the one a party dies in: water first, then rations, then feed; ammunition has no limit to fill to.
const REFILL_ORDER = ['water', 'food', 'feed'];

// Note: what "refill all" in the store would buy: whole lots up to the carrying capacity, in that order, as far as the purse reaches; the screen buys each line with a normal buy.
export function refillPlan(state, placeId) {
  const p = PLACES[placeId];
  if (!p || !p.services.store) return { lines: [], cents: 0, short: [] };
  const cap = capacity(state);
  let purse = Math.max(0, state.cents);
  const lines = [];
  const short = [];
  for (const id of REFILL_ORDER) {
    const g = GOODS[id];
    const room = round2(cap[g.stock] - state.stock[g.stock]);
    if (room <= 0) continue;
    const price = priceOf(placeId, id);
    const full = supplyCost(price, g.lot, room);
    // Note: with the purse for all of it the line asks for the whole room (the last lot part-priced); else whole lots as far as the purse reaches.
    const all = purse >= full;
    const whole = all ? Math.ceil(room / g.lot - 1e-9) : Math.floor(purse / price);
    if (!all) short.push(id);
    if (whole < 1) continue;
    const cents = all ? full : price * whole;
    lines.push({ id, label: g.label, qty: whole, amount: all ? room : whole * g.lot, cents });
    purse -= cents;
  }
  return { lines, cents: Math.max(0, state.cents) - purse, short };
}

// Note: what "refill ammo" would buy: whole boxes so the pool covers what a fight hands out (every gun loaded plus RESERVE_CAP spare per person and cartridge), as far as the purse reaches; cartridges the store does not sell are listed as missing.
export function ammoRefillPlan(state, placeId) {
  const p = PLACES[placeId];
  if (!p || !p.services.store) return { lines: [], cents: 0, short: [], missing: [] };
  const want = {};
  for (const c of state.crew) {
    if (c.where !== 'party' && c.where !== state.at) continue;
    const types = new Set();
    for (const w of c.loadout || []) {
      want[w.ammoType] = (want[w.ammoType] || 0) + WEAPONS[w.id].cap;
      types.add(w.ammoType);
    }
    for (const t of types) want[t] += RESERVE_CAP;
  }
  let purse = Math.max(0, state.cents);
  const lines = [];
  const short = [];
  const missing = [];
  for (const [type, n] of Object.entries(want)) {
    const g = GOODS[`ammo-${type}`];
    const need = n - (state.ammo[type] || 0);
    if (need <= 0) continue;
    if (!g || !stocks(p, g, state)) {
      missing.push(type);
      continue;
    }
    const price = priceOf(placeId, g.id);
    const boxes = Math.min(Math.ceil(need / g.lot), Math.floor(purse / price));
    if (boxes < Math.ceil(need / g.lot)) short.push(type);
    if (boxes < 1) continue;
    lines.push({ id: g.id, label: g.label, qty: boxes, amount: boxes * g.lot, cents: price * boxes });
    purse -= price * boxes;
  }
  return { lines, cents: Math.max(0, state.cents) - purse, short, missing };
}

export function sell(state, placeId, goodId, qty = 1, opts = {}) {
  const g = goodOf(goodId);
  const p = PLACES[placeId];
  if (!g || !p || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'Nothing to sell.' };
  if (g.kind === 'transport' ? !p.services.livery : !p.services.store) return { ok: false, reason: `${p.name} does not buy that.` };
  let take = 0;
  if (g.kind === 'supply') {
    take = Math.min(qty * g.lot, Math.floor(state.stock[g.stock] / g.lot) * g.lot);
    if (take < g.lot) return { ok: false, reason: 'You have none to sell.' };
    state.stock[g.stock] = round2(state.stock[g.stock] - take);
    qty = take / g.lot;
  } else if (g.kind === 'ammo') {
    const lots = Math.min(qty, Math.floor(state.ammo[g.ammoType] / g.lot));
    if (lots < 1) return { ok: false, reason: 'You have none to sell.' };
    state.ammo[g.ammoType] -= lots * g.lot;
    qty = lots;
  } else if (g.kind === 'explosive') {
    qty = Math.min(qty, state.dynamite || 0);
    if (qty < 1) return { ok: false, reason: 'You have none to sell.' };
    state.dynamite -= qty;
  } else if (g.kind === 'weapon') {
    // Note: item 365: weapons are neither sold nor traded in.
    return { ok: false, reason: 'The store does not buy weapons.' };
  } else if (g.kind === 'transport') {
    if (state.transport.kind !== g.transport) return { ok: false, reason: 'The party does not have them.' };
    state.transport = { kind: 'foot', name: 'on foot' };
    for (const k of ['food', 'water', 'feed']) state.stock[k] = Math.min(state.stock[k], capacity(state)[k]);
    qty = 1;
  }
  const gain = sellValue(state, placeId, goodId) * qty;
  state.cents += gain;
  logLine(state, `Sold ${g.label.toLowerCase()} for ${dollars(gain)}.`);
  return { ok: true, gain, qty };
}

const THIRST = [180, 720, 1440];
const HUNGER = [2880, 7200, 14400];
const FEED_WEAK = 1440;
const STAGE_FATIGUE = { water: [0, 0.04, 0.1, 0.16], food: [0, 0.03, 0.08, 0.12] };
const STAGE_TEXT = {
  water: ['', 'The party is thirsty.', 'The party is dehydrated and unsteady.', 'The party is dying of thirst.'],
  food: ['', 'The party is hungry.', 'The party is starving and weak.', 'The party is starving to death.'],
};

// Note: on the road the party eats, drinks and feeds its animals; in town it lodges (see lodging) and the stock is untouched. activity is ride, walk, wagon, camp or fight.
export function consume(state, minutes, ctx) {
  const out = { events: [], deaths: [] };
  const party = partyOf(state);
  if (!ctx.road || !party.length) {
    state.dry = { food: 0, water: 0, feed: 0 };
    state.stage = { food: 0, water: 0, feed: 0 };
    return out;
  }
  const d = dice(state);
  const n = party.length;
  const w = ctx.weather || { water: 1, fatigue: 1 };
  const work = ctx.activity === 'camp' ? 0.85 : 1;
  const need = {
    food: (n * FOOD_PER_DAY * minutes) / 1440,
    water: (n * WATER_LITRES_PER_DAY * w.water * work * minutes) / 1440,
    feed: state.transport.kind === 'foot' ? 0 : (n * TRANSPORT[state.transport.kind].feed * minutes) / 1440,
  };
  for (const k of ['food', 'water', 'feed']) {
    if (need[k] <= 0) continue;
    if (state.stock[k] >= need[k]) {
      state.stock[k] = round2(state.stock[k] - need[k]);
      state.dry[k] = 0;
    } else {
      // Note: the supply runs out part way through the step; only the short part counts as dry time.
      const short = need[k] > 0 ? (1 - state.stock[k] / need[k]) * minutes : minutes;
      state.stock[k] = 0;
      state.dry[k] += short;
    }
  }
  const stageOf = (mins, table) => (mins >= table[2] ? 3 : mins >= table[1] ? 2 : mins >= table[0] ? 1 : 0);
  const now = { water: stageOf(state.dry.water, THIRST), food: stageOf(state.dry.food, HUNGER), feed: state.dry.feed >= FEED_WEAK ? 1 : 0 };
  for (const k of ['water', 'food', 'feed']) {
    if (now[k] !== state.stage[k]) {
      if (now[k] > state.stage[k]) {
        out.events.push({ type: 'shortage', what: k, stage: now[k], text: k === 'feed' ? 'The animals are weak for want of feed; the party moves slower.' : STAGE_TEXT[k][now[k]] });
        logLine(state, k === 'feed' ? 'The animals are weak for want of feed.' : STAGE_TEXT[k][now[k]]);
      }
      state.stage[k] = now[k];
    }
  }
  // Note: shortage tires everyone; the worst stage also kills, by the hour, with water far deadlier than hunger (item 130).
  const extra = (STAGE_FATIGUE.water[now.water] + STAGE_FATIGUE.food[now.food]) * (minutes / 60);
  for (const c of party) c.fatigue = clamp(c.fatigue + extra * wearOf(c), 0, 1);
  const hours = minutes / 60;
  const heat = w.water >= 1.5 ? 1.5 : 1;
  const mort = (now.water === 3 ? Math.min(0.5, 0.04 + 0.02 * ((state.dry.water - THIRST[2]) / 60)) * heat : 0)
    + (now.food === 3 ? Math.min(0.2, 0.005 + 0.002 * ((state.dry.food - HUNGER[2]) / 60)) : 0);
  if (mort > 0) {
    for (const c of party.slice()) {
      if (d.chance(1 - Math.pow(1 - mort, hours))) out.deaths.push({ char: c, cause: now.water === 3 ? 'thirst' : 'starvation' });
    }
  }
  return out;
}

// Note: animals short of feed slow the party; the animals themselves are never hurt (item 165).
export const mountsWeak = (state) => state.dry.feed >= FEED_WEAK;

// Note: a place offers board and lodging when it has a store, a livery, a saloon or a doctor; any other place is a camp.
export const hasLodging = (placeId) => {
  const s = PLACES[placeId] && PLACES[placeId].services;
  return !!s && !!(s.store || s.livery || s.saloon || s.doctor);
};

// Note: town time costs lodging for the party, taken from cash as far as it goes; the result says whether it was paid.
export function lodging(state, minutes) {
  const n = partyOf(state).length;
  state.boardOwed = (state.boardOwed || 0) + (LODGING_CENTS_PER_DAY * n * minutes) / 1440;
  const due = Math.floor(state.boardOwed);
  if (due <= 0) return true;
  state.boardOwed -= due;
  if (state.cents >= due) {
    state.cents -= due;
    return true;
  }
  state.cents = 0;
  return false;
}

export const doctorCare = (placeId) => (PLACES[placeId] ? PLACES[placeId].services.doctor || 0 : 0);

export function treatQuote(state, placeId, c) {
  const care = doctorCare(placeId);
  const list = activeInjuries(c).filter((i) => !i.treated && i.healed < 1);
  if (!care || !list.length) return null;
  const cents = list.reduce((s, i) => s + Math.round((150 + 900 * i.severity) * (0.8 + 0.4 * care)), 0);
  const minutes = Math.round(list.reduce((s, i) => s + 60 + 150 * i.severity, 0));
  return { cents, minutes, care, injuries: list.length };
}

// Note: results depend on the injury and on the doctor; a poor doctor cannot do much for a bad wound.
export function treat(state, placeId, c) {
  const q = treatQuote(state, placeId, c);
  if (!q) return { ok: false, reason: doctorCare(placeId) ? `${c.name} needs no treatment.` : 'There is no doctor here.' };
  if (state.cents < q.cents) return { ok: false, reason: 'You cannot pay the doctor.' };
  state.cents -= q.cents;
  let helped = 0;
  for (const i of activeInjuries(c)) {
    if (i.treated || i.healed >= 1) continue;
    const power = q.care * (1.1 - 0.5 * i.severity);
    if (power >= 0.3) {
      i.treated = true;
      i.healed = Math.min(1, i.healed + 0.1 + 0.2 * power);
      helped++;
    } else i.healed = Math.min(1, i.healed + 0.05);
  }
  logLine(state, `${c.name} sees the doctor for ${dollars(q.cents)}.`);
  return { ok: true, cents: q.cents, minutes: q.minutes, helped, all: q.injuries };
}

const WEEK = 7 * 1440;

function deferDeparture(state, c, why) {
  // Note: the duelist and the lender of the revolver each keep one slot; a second reason for the same person does not replace the first.
  if (state.duel?.phase === 'exchange' && (state.duel.charId === c.id || state.duel.weapon?.owner === c.id)) {
    state.duel.deferredDepartures ||= [];
    if (!state.duel.deferredDepartures.some((d) => d.charId === c.id)) state.duel.deferredDepartures.push({ charId: c.id, why });
    return true;
  }
  if (state.brawl?.phase === 'fight' && state.brawl.fighters.some((f) => f.crew && f.id === c.id)) {
    if (!state.brawl.deferredDepartures.some((d) => d.charId === c.id)) state.brawl.deferredDepartures.push({ charId: c.id, why });
    return true;
  }
  return false;
}

// Note: carries out the departures a scene held back, one per person, for those still in the crew; a record holds the list only once someone was held back.
export function settleDepartures(state, record, events) {
  const gone = new Set();
  for (const departure of record.deferredDepartures ?? []) {
    const person = charById(state, departure.charId);
    if (!person || gone.has(person.id)) continue;
    gone.add(person.id);
    leave(state, person, departure.why, events);
  }
}

// Note: pays every ongoing wage that has fallen due, including for teammates left in town; a wage that cannot be paid may drive the teammate away.
export function payroll(state, events) {
  const d = dice(state);
  const depart = (c, why) => {
    if (!deferDeparture(state, c, why)) leave(state, c, why, events);
  };
  for (const c of state.crew.slice()) {
    if (c.wageDueMin == null || !(c.terms.wageCentsPerWeek > 0)) continue;
    while (c.wageDueMin != null && state.min >= c.wageDueMin && state.crew.includes(c)) {
      const wage = c.terms.wageCentsPerWeek;
      c.wageDueMin += WEEK;
      if (state.cents >= wage) {
        state.cents -= wage;
        // Note: item 350: a teammate's own money, from which his drinks are paid.
        c.earned = (c.earned || 0) + wage;
        c.unpaid = Math.max(0, c.unpaid - 1);
        c.loyalty = clamp(c.loyalty + 1, 0, 100);
        events.push({ type: 'wage', charId: c.id, cents: wage });
      } else {
        c.unpaid += 1;
        // Note: item 468: a grudge-holder takes a missed wage harder; item 475: missed wages are how a grudge grows.
        c.loyalty = clamp(c.loyalty - (hasTrait(c, 'resentment') ? 9 : 6), 0, 100);
        logLine(state, `${c.name} goes unpaid.`);
        note(state, c, 'resentment', events);
        events.push({ type: 'unpaid', charId: c.id });
        const p = clamp(0.8 - mood(state, c) * 1.5, 0, 0.9);
        if (d.chance(p)) {
          depart(c, 'quits for want of pay');
          break;
        }
      }
      if (state.crew.includes(c) && wantsToLeave(state, c)) {
        depart(c, 'leaves the office');
        break;
      }
    }
  }
}

export function leave(state, c, why, events) {
  const i = state.crew.indexOf(c);
  if (i < 0) return;
  state.crew.splice(i, 1);
  logLine(state, `${c.name} ${why}.`);
  events.push({ type: 'left', charId: c.id, name: c.name, why });
}

// Note: a hand hired for one case is paid when that case is completed and then goes on his way; otherwise he simply leaves.
export function settleCaseHires(state, caseId, completed) {
  const out = [];
  for (const c of state.crew.slice()) {
    if (c.terms.kind !== 'case' || c.terms.caseId !== caseId) continue;
    let paid = 0;
    if (completed) {
      paid = Math.min(c.terms.casePayCents || 0, state.cents);
      state.cents -= paid;
    }
    out.push({ charId: c.id, name: c.name, paid });
    const why = `finishes the case${paid ? ` and is paid ${dollars(paid)}` : ' and moves on'}`;
    if (!deferDeparture(state, c, why)) {
      state.crew.splice(state.crew.indexOf(c), 1);
      logLine(state, `${c.name} ${why}.`);
    }
  }
  return out;
}

// Note: hands out ammunition for a team: loaded rounds are charged for each weapon taken along, the rest of the pool is shared as reserve.
export function allocateAmmo(state, team) {
  const avail = { ...state.ammo };
  const members = team.map((c) => ({ charId: c.id, loadout: [], reserve: Object.fromEntries(AMMO_TYPES.map((t) => [t, 0])) }));
  const warnings = [];
  team.forEach((c, k) => {
    for (const w of c.loadout) {
      const cap = WEAPONS[w.id].cap;
      // Note: a short pool still loads what is left; a weapon with nothing to load stays behind.
      const take = Math.min(cap, avail[w.ammoType] || 0);
      if (take > 0) {
        avail[w.ammoType] -= take;
        members[k].loadout.push({ id: w.id, ammoType: w.ammoType, loaded: take });
        if (take < cap) warnings.push(`${c.name} can load only ${take} rounds in the ${WEAPONS[w.id].name}.`);
      } else warnings.push(`${c.name} has no ammunition to load the ${WEAPONS[w.id].name}.`);
    }
  });
  for (const type of AMMO_TYPES) {
    let left = members.filter((m) => m.loadout.some((w) => w.ammoType === type));
    let pool = avail[type] || 0;
    // Note: even shares, capped per person; what a person cannot carry goes round again.
    while (pool > 0 && left.length) {
      const share = Math.max(1, Math.floor(pool / left.length));
      const next = [];
      for (const m of left) {
        const give = Math.min(share, RESERVE_CAP - m.reserve[type], pool);
        if (give <= 0) continue;
        m.reserve[type] += give;
        pool -= give;
        if (m.reserve[type] < RESERVE_CAP) next.push(m);
      }
      left = next;
    }
    avail[type] = pool;
  }
  const charged = Object.fromEntries(AMMO_TYPES.map((t) => [t, 0]));
  members.forEach((m) => {
    for (const w of m.loadout) charged[w.ammoType] += w.loaded ?? WEAPONS[w.id].cap;
    for (const t of Object.keys(charged)) charged[t] += m.reserve[t];
  });
  for (const t of Object.keys(charged)) if (charged[t]) state.ammo[t] -= charged[t];
  // Note: the reserve lists only the cartridges a member carries, as before the roster grew.
  for (const m of members) m.reserve = Object.fromEntries(Object.entries(m.reserve).filter(([t, n]) => n > 0 || BASE_AMMO.includes(t)));
  return { members, charged, warnings };
}

// Note: ammunition back into the pool after a scene; a survivor's rounds always return, a dead man's only when the fight was won.
export function returnAmmo(state, alloc, report, success, deadIds) {
  const held = Object.fromEntries(AMMO_TYPES.map((t) => [t, 0]));
  const seen = new Set();
  for (const l of report.lawmen || []) {
    seen.add(l.charId);
    if (deadIds.has(l.charId) && !success) continue;
    // Note: R1-4: a count of rounds that is not a finite number returns nothing.
    for (const t of Object.keys(held)) held[t] += l.rounds && finite(l.rounds[t]) ? clamp(Math.floor(l.rounds[t]), 0, 1000) : 0;
  }
  // Note: a member the report does not mention (a gap in the report) gets his allocation back.
  for (const m of alloc.members) {
    if (seen.has(m.charId)) continue;
    for (const w of m.loadout) held[w.ammoType] += w.loaded ?? WEAPONS[w.id].cap;
    for (const t of Object.keys(m.reserve)) held[t] += m.reserve[t];
  }
  for (const t of Object.keys(held)) if (held[t] || state.ammo[t] !== undefined) state.ammo[t] = (state.ammo[t] || 0) + held[t];
  return held;
}

const keyOf = (w) => `${w.id}:${w.ammoType}`;

// Note: a weapon dropped on the ground is picked up again after a win and lost after a loss; only weapons that were taken along can be lost.
export function settleLoadout(c, held, success, taken = c.loadout) {
  if (success) return [];
  const have = new Map();
  for (const w of held || []) have.set(keyOf(w), (have.get(keyOf(w)) || 0) + 1);
  const lost = [];
  for (const w of taken) {
    const k = keyOf(w);
    if ((have.get(k) || 0) > 0) have.set(k, have.get(k) - 1);
    else lost.push(w);
  }
  for (const w of lost) {
    const i = c.loadout.findIndex((x) => keyOf(x) === keyOf(w));
    if (i >= 0) c.loadout.splice(i, 1);
  }
  return lost;
}

// Note: shared by the shortage and the fight paths so a death always follows the same route.
export function applyDeaths(state, deaths) {
  for (const x of deaths) kill(state, x.char, x.cause);
}
