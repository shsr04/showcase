// Note: builds a band (or the tutorial level) from a seed: highway, rivers, back roads, terrain, sites and entities.

import { BAND_W, BAND_H, CHUNK, TILE, FINE, CELL } from './config.js';
import { T, TILE_PROPS, OBSTACLE } from './tiles.js';
import { seedFromString, rng, noise1, fbm2, clamp } from './rand.js';
import { TEMPLATES, MARKER_FACTION, compileTemplate, compileSite } from './sites.js';
import { VEHICLE } from './vehicles.js';
import { actOf } from './acts.js';
import { BIOMES } from './biomes.js';
import { SLOTS } from './parts.js';

const HALF_ROAD = 3.5;
const SHOULDER = 4.5;
const CLEAR = 254;

const WET = new Set([T.DEEP, T.WATER, T.MARSH, T.REEDS]);

function weightedModel(r, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r.next() * total;
  for (const [id, w] of entries) {
    x -= w;
    if (x <= 0) return id;
  }
  return entries[0][0];
}

// Note: wreck parts skew worn; a third of slots are already stripped.
export function wreckParts(r, model) {
  const parts = {};
  for (const slot of SLOTS) {
    if (slot === 'armor') {
      parts.armor = r.chance(0.08) ? Math.round(r.range(20, 70)) : null;
      continue;
    }
    if (!VEHICLE[model].slots[slot] || r.chance(0.34)) {
      parts[slot] = null;
      continue;
    }
    const roll = r.next();
    parts[slot] = Math.round(roll < 0.45 ? r.range(4, 34) : roll < 0.8 ? r.range(35, 59) : roll < 0.96 ? r.range(60, 84) : r.range(85, 98));
  }
  return parts;
}

function makeWreck(r, id, model, x, y, a, rich = 0) {
  return {
    id, kind: 'wreck', model, x, y, a,
    fuel: r.chance(0.35 + rich * 0.2) ? Math.round(r.range(0.5, 4 + rich * 3) * 10) / 10 : 0,
    water: r.chance(0.12 + rich * 0.15) ? r.int(1, 3) : 0,
    ammo: r.chance(0.18 + rich * 0.15) ? r.int(2, 8 + rich * 6) : 0,
    cans: r.chance(0.08) ? 1 : 0,
    parts: wreckParts(r, model),
  };
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildHighway(world) {
  const s = world.seed;
  const ys = new Float32Array(world.bw + 2);
  for (let x = 0; x < ys.length; x++) {
    ys[x] = BAND_H * 0.5 + (noise1(s + 11, x / 480) - 0.5) * 70 + (noise1(s + 12, x / 150) - 0.5) * 12;
  }
  world.hy = ys;
}

// Note: holds the highway level under roadside sites so their lots meet the shoulder.
function flattenHighway(world, x0, x1) {
  const ys = world.hy;
  const mid = Math.round((x0 + x1) / 2);
  const target = ys[clamp(mid, 0, ys.length - 1)];
  const m = 30;
  for (let x = Math.max(0, x0 - m); x <= Math.min(ys.length - 1, x1 + m); x++) {
    const k = x < x0 ? smoothstep(x0 - m, x0, x) : x > x1 ? 1 - smoothstep(x1, x1 + m, x) : 1;
    ys[x] = ys[x] + (target - ys[x]) * k;
  }
}

// Note: highway centre in public space: the x tile column of the road at public row y.
export const roadX = (world, y) => hwyY(world, y);

function hwyY(world, x) {
  const ys = world.hy;
  if (!ys) return -9999;
  const xi = clamp(Math.floor(x), 0, ys.length - 2);
  const t = clamp(x - xi, 0, 1);
  return ys[xi] + (ys[xi + 1] - ys[xi]) * t;
}

function riverX(world, river, y) {
  return river.x + (noise1(world.seed + 31 + river.x, y / 46) - 0.5) * 22;
}

function riverAt(world, x, y) {
  for (const rv of world.rivers) {
    if (Math.abs(x - rv.x) > rv.w + 16) continue;
    const d = Math.abs(x - riverX(world, rv, y));
    if (d < rv.w / 2 + 1.5) return { rv, d };
  }
  return null;
}

function addChunkRef(map, x0, y0, x1, y1, ref) {
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
      const k = `${cx},${cy}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ref);
    }
  }
}

function placeSite(world, plan, r) {
  const tpl = TEMPLATES[plan.type];
  const c = compileSite(tpl);
  const flip = plan.side === 's';
  let x = Math.round(plan.x + r.range(-40, 40));
  // Note: keep sites clear of river channels.
  for (const rv of world.rivers) {
    const lo = rv.x - rv.w - 30 - c.w;
    const hi = rv.x + rv.w + 30;
    if (x > lo && x < hi) x = x - lo < hi - x ? lo : hi;
  }
  x = clamp(x, 70, world.bw - c.w - 10);
  if (tpl.roadside) flattenHighway(world, x - 2, x + c.w + 2);
  let y;
  if (tpl.roadside) {
    const hy = hwyY(world, x + c.w / 2);
    y = flip ? Math.round(hy + SHOULDER) : Math.round(hy - SHOULDER) - c.h;
  } else {
    const hy = hwyY(world, x + c.w / 2);
    const dist = r.range(34, 62);
    y = flip ? Math.round(hy + dist) : Math.round(hy - dist - c.h);
    y = clamp(y, 8, world.bh - c.h - 8);
  }
  const grid = new Uint8Array(c.w * c.h);
  for (let ty = 0; ty < c.h; ty++) {
    const sy = flip ? c.h - 1 - ty : ty;
    for (let tx = 0; tx < c.w; tx++) grid[ty * c.w + tx] = c.grid[sy * c.w + tx];
  }
  // Note: public grid is the transpose of the band grid, so public (x, y) = band (y, x).
  const pub = new Uint8Array(c.w * c.h);
  for (let by = 0; by < c.h; by++) for (let bx = 0; bx < c.w; bx++) pub[bx * c.h + by] = grid[by * c.w + bx];
  const site = {
    id: world.act === 1 ? plan.id : `a${world.act}-${plan.id}`, type: plan.type, name: plan.name || tpl.name, faction: plan.faction || 'none',
    story: plan.story || null, flip, off: !!plan.off, calm: !!plan.calm, weapon: plan.weapon || null,
    b: { x, y, w: c.w, h: c.h, grid },
    x: y, y: x, w: c.h, h: c.w, grid: pub,
    spawns: c.spawns.map((sp) => {
      const by = flip ? c.h - 1 - sp.y : sp.y;
      return { ...sp, y: by, px: (x + sp.x + 0.5) * TILE, py: (y + by + 0.5) * TILE };
    }),
  };
  world.sites.push(site);
  // Note: building blocks go to public cell grids, flipped and transposed like the tiles; their markers join the spawns.
  const H = c.h * FINE;
  c.builds.forEach((b, k) => {
    const bandCy = (j) => (flip ? y * FINE + H - 1 - (b.ay + j) : y * FINE + b.ay + j);
    const px0 = flip ? y * FINE + H - (b.ay + b.h) : y * FINE + b.ay;
    const st = { id: `${site.id}:b${k}`, site: site.id, type: site.type, x: px0, y: x * FINE + b.ax, w: b.h, h: b.w, grid: new Uint8Array(b.w * b.h) };
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) st.grid[i * st.w + (bandCy(j) - px0)] = b.grid[j * b.w + i];
    addStruct(world, st);
    for (const sp of b.spawns) site.spawns.push({ ...sp, px: (x * FINE + b.ax + sp.x + 0.5) * CELL, py: (bandCy(sp.y) + 0.5) * CELL });
  });
  addChunkRef(world.siteChunks, x - 3, y - 3, x + c.w + 3, y + c.h + 3, site);
  return site;
}

// Note: back roads are polylines in tile units, 3 tiles wide.
function addBackRoad(world, pts, kind = 'dirt') {
  const road = { pts, kind, w: 3 };
  world.backRoads.push(road);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const seg = { ax, ay, bx, by, road };
    addChunkRef(world.roadChunks, Math.min(ax, bx) - 4, Math.min(ay, by) - 4, Math.max(ax, bx) + 4, Math.max(ay, by) + 4, seg);
  }
  return road;
}

function connectSite(world, site, r) {
  const sb = site.b;
  const ex = sb.x + Math.floor(sb.w / 2) + 0.5;
  const ey = site.flip ? sb.y - 0.5 : sb.y + sb.h + 0.5;
  const sx = ex + r.range(-24, 24);
  const sy = hwyY(world, sx) + (site.flip ? SHOULDER : -SHOULDER);
  const pts = [[sx, sy]];
  const n = 3;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([sx + (ex - sx) * t + r.range(-8, 8), sy + (ey - sy) * t]);
  }
  pts.push([ex, ey]);
  pts.push([ex, ey + (site.flip ? 2 : -2)]);
  addBackRoad(world, pts, 'dirt');
}

// Note: an old parallel road gives a slower route that cools trail heat.
function addOldRoad(world, r, x0, x1, side) {
  const pts = [];
  const off = side === 's' ? 1 : -1;
  pts.push([x0, hwyY(world, x0) + off * SHOULDER]);
  for (let x = x0 - 24; x > x1 + 24; x -= 36) {
    const y = clamp(hwyY(world, x) + off * r.range(24, 34), 10, world.bh - 10);
    pts.push([x + r.range(-6, 6), y]);
  }
  pts.push([x1, hwyY(world, x1) + off * SHOULDER]);
  addBackRoad(world, pts, 'gravel');
}

function segDist(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - s.ax) * dx + (py - s.ay) * dy) / l2, 0, 1);
  const qx = s.ax + dx * t - px;
  const qy = s.ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function backRoadDist(world, x, y) {
  const list = world.roadChunks.get(`${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`);
  if (!list) return null;
  let best = null;
  for (const s of list) {
    const d = segDist(x, y, s);
    if (!best || d < best.d) best = { d, road: s.road };
  }
  return best;
}

function siteAt(world, tx, ty) {
  const list = world.siteChunks.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`);
  if (!list) return null;
  let near = null;
  for (const site of list) {
    const s = site.b;
    if (tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h) {
      const t = s.grid[(ty - s.y) * s.w + (tx - s.x)];
      return { site, tile: t === 255 ? CLEAR : t };
    }
    if (tx >= s.x - 3 && tx < s.x + s.w + 3 && ty >= s.y - 3 && ty < s.y + s.h + 3) near = site;
  }
  return near ? { site: near, tile: CLEAR, near: true } : null;
}

// Note: band space runs east-west (x = along the corridor, y = across); the public world is its transpose.
function sampleBand(world, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const d = y - hwyY(world, x);
  const ad = Math.abs(d);
  const B = BIOMES[world.biome];
  if (tx >= world.bw - 2) return ad < SHOULDER ? T.FENCE : B.edge;
  if (world.deadEnd && tx < world.deadEnd) return tx >= world.deadEnd - 2 && ad < SHOULDER + 1 ? T.FENCE : B.edge;
  // Note: the far west end is fenced like the east end, for a courier who turns up there without the case.
  if (tx < 0) return ad < SHOULDER + 1 ? T.FENCE : B.edge;
  const edge = 4 + noise1(world.seed + 51, x / 9) * 5;
  if (ty < edge || ty >= world.bh - edge) return ad < SHOULDER + 1 ? T.GRAVEL : B.edge;
  const site = siteAt(world, tx, ty);
  if (site && site.tile !== CLEAR) return site.tile;
  const river = riverAt(world, x, y);
  if (ad < SHOULDER) {
    if (river) return ad < HALF_ROAD ? T.BRIDGE : T.RAIL;
    if (ad < HALF_ROAD) return fbm2(world.seed + 52, x / 30, y / 6, 2) > 0.6 ? T.CRACKED : T.ASPHALT;
    return T.GRAVEL;
  }
  const br = backRoadDist(world, x, y);
  if (br && br.d < br.road.w / 2) {
    if (river && river.d < river.rv.w / 2) return T.WATER;
    return br.road.kind === 'gravel' ? T.GRAVEL : T.DIRT;
  }
  if (river) {
    const half = river.rv.w / 2;
    if (river.d < half * 0.62) return T.DEEP;
    if (river.d < half) return T.WATER;
    return T.MUD;
  }
  let t = B.terrain(world, x, y, tx, ty);
  const clearRoad = ad < 7 || (br && br.d < 3.2);
  if (site || clearRoad) {
    if (OBSTACLE.has(t)) t = B.clear;
    if (site && WET.has(t)) t = B.clear;
    if (clearRoad && t === T.DEEP) t = T.WATER;
  }
  return t;
}

// Note: x and y are public tile units (floats allowed for sub-tile painting); west is up, so band x becomes y.
export function sampleTile(world, x, y) {
  if (world.kind === 'level') return levelSample(world, x, y);
  return sampleBand(world, y, x);
}

function levelSample(world, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return T.TREE;
  const t = world.grid[ty * world.w + tx];
  return t === 255 || t === CLEAR ? world.fill : t;
}

export function chunkTiles(world, cx, cy) {
  const k = `${cx},${cy}`;
  let tiles = world.tileCache.get(k);
  if (tiles) return tiles;
  tiles = new Uint8Array(CHUNK * CHUNK);
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      tiles[y * CHUNK + x] = sampleTile(world, cx * CHUNK + x + 0.5, cy * CHUNK + y + 0.5);
    }
  }
  world.tileCache.set(k, tiles);
  return tiles;
}

export function tileAt(world, tx, ty) {
  const cx = Math.floor(tx / CHUNK);
  const cy = Math.floor(ty / CHUNK);
  const tiles = chunkTiles(world, cx, cy);
  return tiles[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)];
}

export const tileAtPx = (world, px, py) => tileAt(world, Math.floor(px / TILE), Math.floor(py / TILE));
export const propsAtPx = (world, px, py) => TILE_PROPS[tileAtPx(world, px, py)];

// Note: true on dirt or gravel back roads away from the highway; used to cool trail heat.
export function onBackRoad(world, px, py) {
  if (world.kind === 'level') return false;
  if (Math.abs(px / TILE - hwyY(world, py / TILE)) < SHOULDER + 2) return false;
  const t = tileAtPx(world, px, py);
  return t === T.DIRT || t === T.GRAVEL;
}

function spawnSiteEntities(world, site, r) {
  let n = 0;
  for (const sp of site.spawns) {
    const id = `${site.id}:${sp.kind}${n++}`;
    const x = sp.px;
    const y = sp.py;
    const ent = { id, site: site.id, x, y };
    switch (sp.kind) {
      case 'loot':
        world.loot.push({
          ...ent, kind: 'crate',
          water: r.chance(0.5) ? r.int(1, 4) : 0,
          ammo: r.chance(0.45) ? r.int(3, 12) : 0,
          fuel: 0,
          cans: r.chance(site.type === 'gas' ? 0.6 : 0.12) ? 1 : 0,
          canFuel: r.chance(0.5) ? Math.round(r.range(1, 4) * 10) / 10 : 0,
          parts: r.chance(0.3) ? { [r.pick(['battery', 'tires', 'radiator'])]: Math.round(r.range(30, 90)) } : {},
          partFrom: r.pick(['cvpi03', 'grandmarquis03', 'f150-01', 'camry04', 'silverado02']),
        });
        // Note: a planned weapon lies in the first crate of its site.
        if (site.weapon && !site.weaponPlaced) {
          world.loot.at(-1).weapon = site.weapon;
          site.weaponPlaced = true;
        }
        break;
      case 'wreck':
        world.wrecks.push(makeWreck(r, id, weightedModel(r, world.wreckWeights), x, y, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + r.range(-0.2, 0.2), 1));
        break;
      case 'runner':
        if (r.chance(site.type === 'farm' ? 0.5 : 0.3)) {
          const model = r.pick(['f150-01', 'silverado02', 'grandmarquis03', 'camry04', 'tahoe03', 'explorer03', 'civic03']);
          world.runners.push({ ...ent, kind: 'runner', model, a: site.flip ? Math.PI / 2 : -Math.PI / 2, fuel: Math.round(r.range(1, 3.5) * 10) / 10, parts: wreckParts(r, model) });
        }
        break;
      case 'mechanic':
        world.npcs.push({ ...ent, kind: 'mechanic', role: 'mechanic', faction: site.faction });
        site.garage = { mechanic: id, x, y };
        break;
      case 'npc':
        world.npcs.push({ ...ent, kind: 'npc', role: site.type === 'church' ? 'preacher' : site.type === 'motel' ? 'clerk' : 'local', faction: site.faction });
        break;
      case 'elder':
      case 'doc':
        world.npcs.push({ ...ent, kind: 'npc', role: sp.kind, faction: site.faction, story: site.story });
        break;
      case 'buyer':
        world.npcs.push({ ...ent, kind: 'npc', role: 'buyer', faction: MARKER_FACTION[sp.ch] });
        break;
      case 'guard':
        if (site.type === 'farm' && !r.chance(0.6)) break;
        world.guards.push({
          ...ent, kind: 'guard', faction: MARKER_FACTION[sp.ch] || (site.faction === 'none' ? 'drifters' : site.faction),
          a: r.range(-Math.PI, Math.PI), calm: site.calm,
        });
        break;
      case 'story':
        world.story.push({ ...ent, kind: 'story', story: site.story });
        break;
      case 'player':
        world.start = { x, y };
        break;
      case 'park':
        site.park = { x, y };
        break;
      case 'fire':
        world.lights.push({ ...ent, kind: 'fire', r: 70 });
        break;
      case 'lamp':
        world.lights.push({ ...ent, kind: 'lamp', r: 90 });
        break;
      default:
        break;
    }
  }
}

function blankWorld(seedStr, kind) {
  return {
    kind, seedStr, seed: seedFromString(seedStr),
    w: BAND_H, h: BAND_W, bw: BAND_W, bh: BAND_H, act: 1, biome: 'bayou',
    hy: null, rivers: [], sites: [], backRoads: [],
    siteChunks: new Map(), roadChunks: new Map(), tileCache: new Map(), structs: [], structChunks: new Map(),
    wrecks: [], runners: [], loot: [], npcs: [], guards: [], story: [], lights: [],
    start: null,
  };
}

// Note: Act 1 keeps the plain seed so pass 1 seeds and saves rebuild the same band; later acts derive their own.
export function makeBand(seedStr, act = 1) {
  const A = actOf(act);
  const world = blankWorld(A.n === 1 ? seedStr : `${seedStr}:a${A.n}`, 'band');
  world.act = A.n;
  world.biome = A.biome;
  world.exitX = A.exitX;
  world.deadEnd = A.deadEnd || 0;
  world.wreckWeights = A.wrecks;
  const r = rng(world.seed);
  world.rivers = A.rivers.map((rv) => ({ ...rv, x: rv.exit ? rv.x : Math.round(rv.x + r.range(-30, 30)) }));
  buildHighway(world);
  // Note: roadside sites first, because they bend the highway that off-road sites connect to.
  for (const plan of A.plan.filter((p) => TEMPLATES[p.type].roadside)) placeSite(world, plan, r);
  for (const plan of A.plan.filter((p) => !TEMPLATES[p.type].roadside)) connectSite(world, placeSite(world, plan, r), r);
  // Note: one or two old parallel roads, chosen per seed.
  for (const [a, b] of A.oldRoads) if (r.chance(0.6)) addOldRoad(world, r, a, b, r.chance(0.5) ? 'n' : 's');
  for (const site of world.sites) spawnSiteEntities(world, site, r);
  // Note: roadside wrecks along the highway, skipping sites and bridges.
  let n = 0;
  for (let x = world.bw - 90; x > 70; x -= r.range(22, 64)) {
    if (world.sites.some((s) => !s.off && x > s.b.x - 6 && x < s.b.x + s.b.w + 6)) continue;
    if (world.rivers.some((rv) => Math.abs(x - rv.x) < rv.w + 10)) continue;
    const lane = r.next();
    const off = lane < 0.55 ? r.pick([-1, 1]) * r.range(4.6, 6.5) : r.range(-2.6, 2.6);
    const y = (hwyY(world, x) + off) * TILE;
    const a = lane < 0.55 ? r.pick([0, Math.PI]) + r.range(-0.5, 0.5) : r.range(-Math.PI, Math.PI);
    world.wrecks.push(makeWreck(r, `hw${n++}`, weightedModel(r, world.wreckWeights), x * TILE, y, a));
    if (r.chance(0.12)) {
      world.wrecks.push(makeWreck(r, `hw${n++}`, weightedModel(r, world.wreckWeights), (x - 2.2) * TILE, y + r.range(-20, 20), r.range(-Math.PI, Math.PI)));
    }
  }
  // Note: ensure the band holds at least one running car, at a farm when there is one.
  if (!world.runners.length) {
    const farm = world.sites.find((s) => s.type === 'farm') || world.sites.find((s) => s.spawns.some((p) => p.kind === 'runner'));
    const sp = farm.spawns.find((p) => p.kind === 'runner');
    world.runners.push({
      id: `${farm.id}:runner-forced`, site: farm.id, kind: 'runner', model: 'f150-01',
      x: sp.px, y: sp.py, a: -Math.PI / 2, fuel: 2.2, parts: wreckParts(r, 'f150-01'),
    });
  }
  // Note: later acts start on the highway at the east edge.
  if (!world.start) {
    const bx = world.bw - 40;
    world.start = { x: bx * TILE, y: hwyY(world, bx) * TILE };
  }
  for (const rp of world.runners) for (const slot of ['engine', 'transmission']) if (!rp.parts[slot] || rp.parts[slot] < 25) rp.parts[slot] = 25 + Math.round(r.range(0, 40));
  transposeEntities(world);
  return world;
}

// Note: swaps band coordinates into public ones; a heading (cos a, sin a) becomes (sin a, cos a).
function transposeEntities(world) {
  const swap = (e) => {
    if (!e) return;
    const t = e.x;
    e.x = e.y;
    e.y = t;
    if (typeof e.a === 'number') e.a = Math.PI / 2 - e.a;
  };
  for (const list of [world.wrecks, world.runners, world.loot, world.npcs, world.guards, world.story, world.lights]) list.forEach(swap);
  swap(world.start);
  for (const s of world.sites) {
    swap(s.park);
    swap(s.garage);
  }
  world.w = world.bh;
  world.h = world.bw;
}

// Note: a fixed authored level (the tutorial) built from one template; builds are cell-grid blocks in public space.
export function makeLevel(seedStr, rows, legend, markers, fill = T.GRASS, builds = []) {
  const world = blankWorld(seedStr, 'level');
  const c = compileTemplate(rows, legend, markers);
  world.w = c.w;
  world.h = c.h;
  world.grid = c.grid;
  world.fill = fill;
  world.spawns = c.spawns;
  builds.forEach((b, k) => {
    const bc = compileTemplate(b.rows, legend, markers);
    addStruct(world, { id: `level:b${k}`, site: 'level', type: 'level', x: b.at[0], y: b.at[1], w: bc.w, h: bc.h, grid: bc.grid });
  });
  return world;
}

const structKey = (cx, cy) => (cy + 64) * 4096 + (cx + 64);

// Note: indexes a building block by every chunk its cells touch.
function addStruct(world, st) {
  world.structs.push(st);
  const span = CHUNK * FINE;
  for (let cy = Math.floor(st.y / span); cy <= Math.floor((st.y + st.h - 1) / span); cy++) {
    for (let cx = Math.floor(st.x / span); cx <= Math.floor((st.x + st.w - 1) / span); cx++) {
      const k = structKey(cx, cy);
      if (!world.structChunks.has(k)) world.structChunks.set(k, []);
      world.structChunks.get(k).push(st);
    }
  }
}

// Note: the building class of a public cell, or 255 where no block covers it.
export function structAt(world, cx, cy) {
  const span = CHUNK * FINE;
  const list = world.structChunks.get(structKey(Math.floor(cx / span), Math.floor(cy / span)));
  if (!list) return 255;
  for (const st of list) {
    const lx = cx - st.x;
    const ly = cy - st.y;
    if (lx < 0 || ly < 0 || lx >= st.w || ly >= st.h) continue;
    const v = st.grid[ly * st.w + lx];
    if (v !== 255) return v;
  }
  return 255;
}

// Note: cells are the collision grid: a building cell where one stands, else the tile beneath.
export function cellAt(world, cx, cy) {
  const v = structAt(world, cx, cy);
  return v !== 255 ? v : tileAt(world, Math.floor(cx / FINE), Math.floor(cy / FINE));
}

export const cellAtPx = (world, px, py) => cellAt(world, Math.floor(px / CELL), Math.floor(py / CELL));
export const cellPropsAtPx = (world, px, py) => TILE_PROPS[cellAtPx(world, px, py)];

export function siteById(world, id) {
  return world.sites.find((s) => s.id === id) || null;
}

export function siteAtPx(world, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  return world.sites.find((s) => tx >= s.x - 2 && tx < s.x + s.w + 2 && ty >= s.y - 2 && ty < s.y + s.h + 2) || null;
}
