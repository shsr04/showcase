// Note: element simulation (water, moisture, plants, fire, snow) and player terrain/sky tools; no rendering.

import { N, PLANTS, PLANT_KINDS, MIN_H, MAX_H, SOIL_MAX, SURF } from './config.js';
import { cidx, vidx, VN, inB, PK } from './island.js';
import { clamp } from './rand.js';
import { isBed } from './rareisles.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const R = Math.random;
const FIRE_SOLID = { hut: 0.7, storehouse: 0.7, campfire: 0, bonfire: 0.1, pad: 0.5, lookout: 0.6, sawmill: 0.7, ropewalk: 0.8, dock: 0.7, loom: 0.8, smokehouse: 0.7, windmill: 0.6, charcoal: 0.05, brickkiln: 0.05, smelter: 0.05, smithy: 0.2, oven: 0.1, lampworks: 0.2, hall: 0.8, council: 0.6, stairs: 0.6 };

// Note: weather events are moving clouds; kind in rain|snow|sun, positions are island-local cell coords.
export function newWeather() {
  return { events: [], wind: { x: 0.3, z: 0.1, s: 0.15, t: 0 }, nat: 120 };
}

export function addWeather(w, ev) {
  w.events.push({ vx: 0, vz: 0, age: 0, ...ev });
  if (w.events.length > 40) w.events.shift();
}

export function stepWeather(w, dt, world) {
  for (const e of w.events) {
    e.age += dt;
    e.x += (e.vx + w.wind.x * w.wind.s * 1.2) * dt;
    e.z += (e.vz + w.wind.z * w.wind.s * 1.2) * dt;
  }
  w.events = w.events.filter((e) => e.age < e.life);
  const wd = w.wind;
  // Note: a player gust fades out over its duration; calm breeze otherwise.
  const calm = clamp(0.09 + 0.06 * Math.sin(world.time * 0.013) + 0.04 * Math.sin(world.time * 0.041), 0.03, 0.2);
  if (wd.t > 0) {
    wd.t = Math.max(0, wd.t - dt);
    const u = wd.t / (wd.dur || 30);
    wd.s = calm + ((wd.peak || 0.6) - calm) * u * u * (3 - 2 * u);
  } else wd.s = calm;
  // Note: now and then a gentle natural drizzle keeps the garden alive without the player.
  w.nat -= dt;
  if (w.nat <= 0) {
    w.nat = 420 + R() * 420;
    const known = world.revealedIslands();
    if (known.length) {
      const isl = known[Math.floor(R() * known.length)];
      addWeather(w, { kind: 'rain', isl: isl.id, x: N * (0.2 + R() * 0.6), z: N * (0.2 + R() * 0.6), r: 5, life: 50, max: 0.55 });
    }
  }
}

function eventAmount(e, x, z) {
  const d = Math.hypot(x - e.x, z - e.z);
  if (d >= e.r) return 0;
  const t = e.age / e.life;
  const env = Math.min(1, t * 6, (1 - t) * 4);
  return (1 - d / e.r) * env * (e.max ?? 1);
}

export function amountAt(w, isl, kind, x, z) {
  let a = 0;
  for (const e of w.events) if (e.isl === isl.id && e.kind === kind) a += eventAmount(e, x, z);
  return Math.min(1.2, a);
}

export function hasPlant(isl, c) { return isl.plant[c] > 0; }
export function plantDef(isl, c) { return PLANTS[PLANT_KINDS[isl.plant[c]]]; }

function buildingAt(isl, c) {
  const b = isl.bld[c];
  return b >= 0 ? isl.buildings[b] : null;
}

export function flammability(isl, c) {
  const b = buildingAt(isl, c);
  if (b) return FIRE_SOLID[b.id] ?? 0.4;
  const p = plantDef(isl, c);
  return p && p.flammable ? p.flammable : 0;
}

// Note: one element tick; dt is typically 0.4 s. Returns events for sound/visual hooks.
export function stepIsland(isl, dt, world, out) {
  const w = world.weather;
  const wind = w.wind;
  const night = world.night;
  const tmp = isl._tmp || (isl._tmp = new Float32Array(N * N));
  const sunBase = Math.max(0, Math.sin((world.tod - 0.25) * Math.PI * 2)) * 0.8;
  const frozen = isl.has('frozen');
  let changedWater = false;
  let changedPlant = false;
  let changedTerr = false;

  // Note: springs and geysers.
  for (const sp of isl.springs) {
    const c = cidx(sp.i, sp.j);
    if (isl.water[c] < 0.55) { isl.water[c] += 0.05 * dt; changedWater = true; }
    isl.moist[c] = 1;
  }
  for (const g of isl.geysers) {
    g.t -= dt;
    if (g.t <= 0) {
      g.t = 25 + R() * 25;
      g.erupt = 4;
      out?.push({ type: 'geyser', isl, i: g.i, j: g.j });
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isl.land(g.i + di, g.j + dj)) { const c = cidx(g.i + di, g.j + dj); isl.water[c] += 0.12; isl.moist[c] = 1; }
      }
      changedWater = true;
    }
    if (g.erupt > 0) g.erupt -= dt;
  }

  // Note: weather inputs per cell: rain adds water and moisture; snow cools; sun dries.
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    const x = i + 0.5; const z = j + 0.5;
    const rain = w.events.length ? amountAt(w, isl, 'rain', x, z) : 0;
    const snow = w.events.length ? amountAt(w, isl, 'snow', x, z) : 0;
    const sun = w.events.length ? amountAt(w, isl, 'sun', x, z) : 0;
    if (rain > 0) {
      isl.water[c] += rain * 0.035 * dt;
      isl.moist[c] = Math.min(1, isl.moist[c] + rain * 0.25 * dt);
      isl.snow[c] = Math.max(0, isl.snow[c] - rain * 0.05 * dt);
      isl.ash[c] = Math.max(0, isl.ash[c] - rain * 0.08 * dt);
      if (isl.fire[c] > 0) isl.fire[c] = Math.max(0, isl.fire[c] - rain * 1.2 * dt);
      changedWater = true;
    }
    // Note: hot pool beds stay free of snow.
    if (snow > 0 && !isBed(isl, i, j)) {
      isl.snow[c] = Math.min(1, isl.snow[c] + snow * 0.12 * dt);
      isl.moist[c] = Math.min(1, isl.moist[c] + snow * 0.05 * dt);
      if (isl.fire[c] > 0) isl.fire[c] = Math.max(0, isl.fire[c] - snow * 0.8 * dt);
      changedTerr = true;
    }
    if (isl.bld[c] >= 0) {
      // Note: rain, snow or standing water puts a campfire out; it stays out until folk relight it.
      const bb = isl.buildings[isl.bld[c]];
      if (bb && (bb.id === 'campfire' || bb.id === 'bonfire') && bb.built) {
        if (rain > 0.05 || snow > 0.1 || isl.water[c] > 0.03) {
          bb.dryT = 0;
          if (bb.lit !== false) { bb.lit = false; out?.push({ type: 'fizzle', isl, b: bb }); }
        } else bb.dryT = (bb.dryT || 0) + dt;
      }
    }
    const heat = sunBase + sun * 1.2;
    const baseMoist = isl.has('misty') ? 0.75 : isl.has('arid') ? 0.12 : 0.45;
    if (isl.water[c] < 0.05) {
      const dry = (0.0012 + 0.003 * heat + sun * 0.03) * dt;
      isl.moist[c] = clamp(isl.moist[c] - dry + (baseMoist - isl.moist[c]) * 0.02 * dt, 0, 1);
    }
    if (isl.snow[c] > 0 && !frozen) {
      const melt = (0.002 + heat * 0.02) * dt;
      isl.snow[c] = Math.max(0, isl.snow[c] - melt);
      isl.water[c] += melt * 0.15;
      changedTerr = true;
    } else if (isl.snow[c] > 0 && sun > 0.1) {
      isl.snow[c] = Math.max(0, isl.snow[c] - sun * 0.03 * dt);
      changedTerr = true;
    }
    if (isl.water[c] > 0 && heat > 0.2 && !(isl.hold && isl.hold[c] > 0)) isl.water[c] = Math.max(0, isl.water[c] - heat * 0.0016 * dt * (isl.has('arid') ? 2 : 1));
    if (isl.ash[c] > 0) isl.ash[c] = Math.max(0, isl.ash[c] - 0.0025 * dt);
    isl.sunMap = isl.sunMap || new Float32Array(N * N);
    isl.sunMap[c] = sun;
  }

  // Note: water flows to lower neighbours; the island rim is a drain (waterfall).
  tmp.fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    const wv = isl.water[c];
    if (wv < 0.004 || !isl.mask[c]) continue;
    const L = isl.cellH(i, j) + wv;
    const held = !!(isl.hold && isl.hold[c] > 0);
    let total = 0;
    const flows = [];
    for (const [di, dj] of D4) {
      const ni = i + di; const nj = j + dj;
      let diff;
      if (!inB(ni, nj) || !isl.mask[cidx(ni, nj)]) diff = held ? wv - isl.hold[c] : wv + 0.6;
      else diff = L - (isl.cellH(ni, nj) + isl.water[cidx(ni, nj)]);
      if (diff > 0.003) { flows.push([ni, nj, diff]); total += diff; }
    }
    if (!total) continue;
    const move = Math.min(wv, Math.max(0, total * 0.22 * Math.min(1, dt * 2.2)));
    for (const [ni, nj, diff] of flows) {
      const amt = move * diff / total;
      tmp[c] -= amt;
      if (inB(ni, nj) && isl.mask[cidx(ni, nj)]) tmp[cidx(ni, nj)] += amt;
      else if (amt > 0.002) isl.falls = (isl.falls || []).concat([[i, j, ni, nj, amt]]).slice(-24);
    }
  }
  for (let c = 0; c < N * N; c++) if (tmp[c] !== 0) { isl.water[c] = Math.max(0, isl.water[c] + tmp[c]); changedWater = true; }
  // Note: held standing water refills toward its set depth.
  if (isl.hold) {
    for (let c = 0; c < N * N; c++) {
      const t = isl.hold[c];
      if (t > 0 && isl.water[c] < t) { isl.water[c] = Math.min(t, isl.water[c] + Math.max(0.002, (t - isl.water[c]) * 0.5) * dt); changedWater = true; }
    }
  }
  for (let c = 0; c < N * N; c++) {
    if (isl.water[c] > 0 && isl.water[c] < 0.008) isl.water[c] = Math.max(0, isl.water[c] - 0.004 * dt);
  }
  if (isl.falls) isl.falls = isl.falls.filter(() => R() < 0.6);

  // Note: moisture spreads outward from wet cells.
  tmp.fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    if (isl.water[c] > 0.04) { isl.moist[c] = 1; continue; }
    let s = 0; let n = 0;
    for (const [di, dj] of D4) {
      const ni = i + di; const nj = j + dj;
      if (inB(ni, nj) && isl.mask[cidx(ni, nj)]) { s += isl.moist[cidx(ni, nj)]; n++; }
    }
    if (n) tmp[c] = (s / n - isl.moist[c]) * 0.06 * dt;
  }
  for (let c = 0; c < N * N; c++) if (isl.mask[c] && tmp[c]) isl.moist[c] = clamp(isl.moist[c] + tmp[c], 0, 1);

  // Note: plants grow, wither, and spread by seed (wind helps).
  const seedChance = 0.0035 * dt;
  const windx = Math.round(wind.x * 1.4);
  const windz = Math.round(wind.z * 1.4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    const pk = isl.plant[c];
    if (!pk) continue;
    const def = PLANTS[PLANT_KINDS[pk]];
    const m = isl.moist[c];
    const submerged = isl.water[c] > (pk === PK.reed ? 0.5 : 0.22);
    if (submerged) {
      isl.grow[c] -= 0.08 * dt;
      if (isl.grow[c] <= 0) { isl.plant[c] = 0; isl.grow[c] = 0; changedPlant = true; }
      continue;
    }
    const cold = isl.snow[c] > 0.3 ? (def.cold ? 0.4 : 0.05) : 1;
    const warm = frozen && !def.cold ? 0.3 : 1;
    const fert = 1 + isl.ash[c] * 0.6 + (isl.has('fertile') ? 0.3 : 0);
    const ok = m >= def.water * 0.7;
    if (ok && isl.grow[c] < 1) {
      isl.grow[c] = Math.min(1, isl.grow[c] + (dt / def.grow) * cold * warm * fert * (0.6 + sunBase * 0.7 + night * 0.2));
      changedPlant = true;
    } else if (m < def.water * 0.35 && pk !== PK.glowcap && R() < 0.01 * dt) {
      isl.grow[c] = Math.max(0, isl.grow[c] - 0.05);
      if (isl.grow[c] <= 0.01) { isl.plant[c] = 0; changedPlant = true; }
    }
    if (isl.grow[c] >= 1 && R() < seedChance * (pk === PK.wheat ? 0.2 : 1) && pk !== PK.wheat) {
      let ni = i + Math.floor(R() * 3) - 1 + (R() < 0.5 ? windx : 0);
      let nj = j + Math.floor(R() * 3) - 1 + (R() < 0.5 ? windz : 0);
      if (R() < 0.05) { ni += (R() < 0.5 ? -2 : 2); }
      if (inB(ni, nj)) {
        const n = cidx(ni, nj);
        if (isl.mask[n] && !isl.plant[n] && !isl.stone[n] && isl.bld[n] < 0 && isl.dep[n] === 0 && isl.water[n] < 0.1 && isl.soil[n] > 0.3 && isl.moist[n] >= def.water * 0.8 && isl.snow[n] < 0.4 && isl.fire[n] === 0) {
          isl.plant[n] = pk; isl.grow[n] = 0.02; changedPlant = true;
        }
      }
    }
  }

  // Note: fire burns plants and buildings, spreads with wind and dryness, never touches folk.
  let burning = 0;
  tmp.fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    const f = isl.fire[c];
    if (f <= 0) continue;
    burning++;
    const fuel = flammability(isl, c);
    const b = buildingAt(isl, c);
    if (isl.water[c] > 0.05 || isl.snow[c] > 0.4) { isl.fire[c] = 0; continue; }
    if (fuel <= 0) { isl.fire[c] = Math.max(0, f - 0.8 * dt); continue; }
    const burn = dt * (0.12 + fuel * 0.1);
    isl.fire[c] = f - burn * 0.5 + 0.0;
    if (b && b.built) b.burn = (b.burn || 0) + dt;
    if (R() < 0.15) out?.push({ type: 'flame', isl, i, j });
    for (const [di, dj] of D4) {
      const ni = i + di; const nj = j + dj;
      if (!inB(ni, nj) || !isl.mask[cidx(ni, nj)]) continue;
      const n = cidx(ni, nj);
      if (isl.fire[n] > 0) continue;
      const fl = flammability(isl, n);
      if (fl <= 0) continue;
      const dryness = 1 - isl.moist[n] * 0.9;
      const wb = 1 + (di * wind.x + dj * wind.z) * wind.s * 5;
      if (R() < 0.35 * fl * dryness * Math.max(0.15, wb) * dt) tmp[n] = 0.9;
    }
    if (isl.fire[c] <= 0.05) {
      isl.fire[c] = 0;
      if (isl.plant[c]) { isl.plant[c] = 0; isl.grow[c] = 0; changedPlant = true; }
      isl.ash[c] = 1;
      changedTerr = true;
      if (b && !b.built) b.burn = (b.burn || 0) + 6;
    } else if (isl.plant[c] && f > 0.5 && R() < 0.2 * dt) {
      isl.grow[c] = Math.max(0, isl.grow[c] - 0.2);
    }
  }
  for (let c = 0; c < N * N; c++) if (tmp[c] > 0 && !isl.fire[c]) isl.fire[c] = tmp[c];
  isl.burning = burning;

  // Note: building damage from fire and flood.
  for (let k = 0; k < isl.buildings.length; k++) {
    const b = isl.buildings[k];
    if (!b || b.gone) continue;
    let wet = 0;
    let fire = 0;
    for (let dj = 0; dj < b.size; dj++) for (let di = 0; di < b.size; di++) {
      const c = cidx(b.x + di, b.y + dj);
      if (isl.water[c] > 0.34) wet++;
      if (isl.fire[c] > 0) fire++;
    }
    if (b.id === 'dock') wet = 0;
    b.wet = wet ? (b.wet || 0) + dt : Math.max(0, (b.wet || 0) - dt * 0.5);
    if ((b.burn || 0) > 7 || b.wet > 14) {
      out?.push({ type: 'collapse', isl, b, by: b.wet > 14 ? 'flood' : 'fire' });
    }
  }

  if (changedWater) isl.touch('water');
  if (changedPlant) isl.touch('plant');
  if (changedTerr) isl.touch('terrain');
  return burning;
}

// Note: ---------- player tools ----------

function brushCells(isl, fx, fz, rad, fn) {
  const i0 = Math.max(0, Math.floor(fx - rad));
  const i1 = Math.min(N - 1, Math.ceil(fx + rad));
  const j0 = Math.max(0, Math.floor(fz - rad));
  const j1 = Math.min(N - 1, Math.ceil(fz + rad));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(i + 0.5 - fx, j + 0.5 - fz);
    if (d > rad) continue;
    const f = 1 - d / (rad + 0.001);
    fn(i, j, f, cidx(i, j));
  }
}

function blockedByBuilding(isl, i, j) {
  return inB(i, j) && isl.bld[cidx(i, j)] >= 0;
}

// Note: terrain brush on vertices; returns true when something changed. Buildings and relics are protected.
function brushVerts(isl, fx, fz, rad, fn) {
  const i0 = Math.max(0, Math.floor(fx - rad));
  const i1 = Math.min(N, Math.ceil(fx + rad));
  const j0 = Math.max(0, Math.floor(fz - rad));
  const j1 = Math.min(N, Math.ceil(fz + rad));
  let any = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(i - fx, j - fz);
    if (d > rad) continue;
    let landAdj = false;
    let blocked = false;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ci = i + di; const cj = j + dj;
      if (!inB(ci, cj)) continue;
      if (isl.mask[cidx(ci, cj)]) landAdj = true;
      if (blockedByBuilding(isl, ci, cj)) blocked = true;
      if (isl.relic && !isl.relic.taken && isl.relic.i === ci && isl.relic.j === cj) blocked = true;
    }
    if (!landAdj || blocked) continue;
    const f = Math.pow(1 - d / (rad + 0.001), 0.8);
    if (fn(i, j, f, vidx(i, j))) any = true;
  }
  return any;
}

function settleCell(isl, i, j) {
  const c = cidx(i, j);
  const cell = isl.cellH(i, j);
  if (isl.bld[c] >= 0) return;
  const p = isl.plant[c];
  if (p && isl.water[c] > 0.3) { isl.plant[c] = 0; isl.grow[c] = 0; }
  for (const k of [c]) if (isl.depTop[k] > 0 && isl.dep[k] === 0) isl.depTop[k] = 0;
}

export const TOOLS = ['raise', 'dig', 'water', 'fire', 'clear', 'rain', 'wind', 'sun', 'snow'];

// Note: applies one tool tick; (fx,fz) island-local cell coords, dt seconds. Returns an info object.
export function applyTool(world, isl, tool, fx, fz, rad, dt, opts = {}) {
  const info = { changed: false };
  if (tool === 'raise' || tool === 'dig') {
    const dir = tool === 'raise' ? 1 : -1;
    const spd = 1.3 * dt;
    info.changed = brushVerts(isl, fx, fz, rad, (i, j, f, v) => {
      const before = isl.h[v];
      let nh = before + dir * spd * f;
      if (dir < 0 && Math.abs(before - isl.under[v] * 0) < 0) nh = before;
      nh = clamp(nh, MIN_H, MAX_H);
      if (nh === before) return false;
      isl.h[v] = nh;
      return true;
    });
    if (info.changed) {
      // Note: soil follows the shape: dug rock becomes rubble, raised ground gains soil.
      brushCells(isl, fx, fz, rad, (i, j, f, c) => {
        if (!isl.mask[c] || isl.bld[c] >= 0) return;
        if (dir > 0) isl.soil[c] = Math.min(SOIL_MAX, isl.soil[c] + 0.5 * f * dt);
        else {
          if (isl.soil[c] > 0.05) isl.soil[c] = Math.max(0, isl.soil[c] - 0.6 * f * dt);
          else if (R() < 0.9 * f * dt && isl.stone[c] < 4) isl.stone[c]++;
          if (isl.plant[c] && f > 0.3 && R() < 0.5) { isl.plant[c] = 0; isl.grow[c] = 0; isl.touch('plant'); }
        }
        if (dir > 0 && isl.plant[c] && isl.cellH(i, j) > MAX_H - 0.05) { isl.plant[c] = 0; isl.touch('plant'); }
        if (isl.water[c] > 0 && dir < 0) isl.water[c] *= 0.995;
        settleCell(isl, i, j);
      });
      isl.touch('terrain');
      isl.touch('water');
    }
  } else if (tool === 'water') {
    brushCells(isl, fx, fz, rad, (i, j, f, c) => {
      if (!isl.mask[c]) return;
      isl.water[c] = Math.min(1.6, isl.water[c] + 0.55 * f * dt);
      info.changed = true;
    });
    if (info.changed) isl.touch('water');
  } else if (tool === 'fire') {
    brushCells(isl, fx, fz, rad, (i, j, f, c) => {
      if (!isl.mask[c] || isl.water[c] > 0.05 || isl.snow[c] > 0.4) return;
      if (R() < f * 2.4 * dt && isl.fire[c] === 0) { isl.fire[c] = 0.95; info.changed = true; }
    });
  } else if (tool === 'clear') {
    brushCells(isl, fx, fz, rad, (i, j, f, c) => {
      if (!isl.mask[c]) return;
      if (isl.plant[c] && R() < f * 6 * dt + 0.1) { isl.plant[c] = 0; isl.grow[c] = 0; info.changed = true; }
      if (isl.snow[c] > 0 && !isl.has('frozen')) { isl.snow[c] = Math.max(0, isl.snow[c] - 1.5 * f * dt); info.changed = true; isl.touch('terrain'); }
      if (isl.ash[c] > 0) { isl.ash[c] = Math.max(0, isl.ash[c] - 1.5 * f * dt); info.changed = true; isl.touch('terrain'); }
    });
    if (info.changed) isl.touch('plant');
  } else if (tool === 'rain' || tool === 'snow' || tool === 'sun') {
    if (opts.drop) addWeather(world.weather, { kind: tool, isl: isl.id, x: fx, z: fz, r: Math.max(3.2, rad * 1.8), life: tool === 'sun' ? 45 : 40, max: 1 });
    info.changed = !!opts.drop;
  } else if (tool === 'wind') {
    const wd = world.weather.wind;
    if (opts.dx !== undefined) {
      const l = Math.hypot(opts.dx, opts.dz) || 1;
      wd.x = opts.dx / l; wd.z = opts.dz / l;
      wd.peak = Math.min(0.9, 0.5 + Math.hypot(opts.dx, opts.dz) * 0.04);
      wd.dur = 30; wd.t = 30; wd.s = wd.peak;
      info.changed = true;
    }
  }
  return info;
}
