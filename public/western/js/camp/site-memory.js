// Note: item 488: what a case site keeps between visits: changed doors and windows, things left on the ground and, for a while, the dead; plain JSON for the save.

import { makeWeapon, WEAPONS } from '../weapons.js';
import { inMap, setTile } from '../map.js';
import { TILE_PROPS } from '../tiles.js';

// Note: bodies of the fallen lie where they fell for two days; after that their friends or the undertaker have taken them away.
export const BODY_KEEP_MIN = 2 * 1440;
const MAX_CELLS = 400;
const MAX_TILES = 400;
const MAX_ITEMS = 40;
const MAX_BODIES = 12;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Note: a stored memory reduced to its whole parts, so a damaged save cannot break the scene.
export function cleanMemory(m) {
  if (!m || typeof m !== 'object') return null;
  const cells = (Array.isArray(m.cells) ? m.cells : []).filter((c) => Array.isArray(c) && c.length === 4 && c.every((v) => Number.isInteger(v) && v >= 0)).slice(0, MAX_CELLS);
  // Note: tiles a blast replaced, as [floor, x, y, tile, state]; only tiles the game knows are kept.
  const tiles = (Array.isArray(m.tiles) ? m.tiles : []).filter((c) => Array.isArray(c) && c.length === 5 && c.every((v) => Number.isInteger(v) && v >= 0) && TILE_PROPS[c[3]]).slice(0, MAX_TILES);
  const items = (Array.isArray(m.items) ? m.items : []).filter((it) => it && num(it.x) && num(it.y) && Number.isInteger(it.floor) && WEAPONS[it.id] && typeof it.ammoType === 'string').slice(0, MAX_ITEMS);
  const bodies = (Array.isArray(m.bodies) ? m.bodies : []).filter((b) => b && num(b.x) && num(b.y) && Number.isInteger(b.floor) && num(b.min)).slice(0, MAX_BODIES);
  return { cells, tiles, items, bodies, at: num(m.at) ? m.at : 0 };
}

// Note: the dead still lying at the site at minute min.
export const lyingAt = (memory, min) => (memory ? memory.bodies.filter((b) => min - b.min <= BODY_KEEP_MIN) : []);

// Note: lays the kept door and window states and the demolished tiles on a freshly generated site, before the Sim copies its map.
export function applyMemory(site, memory) {
  if (!memory) return site;
  for (const [f, x, y, state] of memory.cells) if (f < site.map.floors.length && inMap(site.map, x, y)) site.map.floors[f].state[y * site.map.W + x] = state;
  for (const [f, x, y, tile, state] of memory.tiles || []) if (f < site.map.floors.length && inMap(site.map, x, y)) setTile(site.map, f, x, y, tile, state);
  return site;
}

// Note: puts the kept things and the dead into a new Sim and records the map it starts from, so the end of the scene can tell what changed.
export function restoreScene(sim, memory) {
  if (memory) {
    for (const it of memory.items) {
      const weapon = makeWeapon(it.id, it.ammoType);
      weapon.loaded = Math.max(0, Math.min(WEAPONS[it.id].cap, Math.floor(it.loaded || 0)));
      sim.items.push({ id: sim.nextItem++, weapon, x: it.x, y: it.y, floor: it.floor, from: { x: it.x, y: it.y }, t: -1, by: -1 });
    }
    for (const b of memory.bodies) {
      const a = sim.add(b.role === 'civilian' ? 'civilian' : 'hostile', { x: b.x, y: b.y, floor: b.floor }, { name: b.name || 'Body', facing: num(b.facing) ? b.facing : 0, loadout: [] });
      Object.assign(a, { status: 'dead', cause: 'earlier', diedAt: -1, remains: true, diedMin: b.min, stance: 'prone' });
    }
  }
  sim.siteBase = sim.map.floors.map((f) => f.state.slice());
  sim.siteTiles = sim.map.floors.map((f) => f.tile.slice());
  return sim;
}

// Note: what the scene changed, as the campaign keeps it: every state byte and every tile that differs from the start, what lies on the ground and who lies dead.
export function captureSite(sim, min = 0) {
  const base = sim.siteBase;
  const cells = [];
  const tiles = [];
  if (base) {
    sim.map.floors.forEach((f, fi) => {
      for (let i = 0; i < f.state.length; i++) {
        const at = [fi, i % sim.map.W, Math.floor(i / sim.map.W)];
        // Note: a replaced tile carries its own state, so it is not also kept as a state change.
        if (f.tile[i] !== sim.siteTiles[fi][i]) tiles.push([...at, f.tile[i], f.state[i]]);
        else if (f.state[i] !== base[fi][i]) cells.push([...at, f.state[i]]);
      }
    });
  }
  const items = sim.items.map((it) => ({ id: it.weapon.id, ammoType: it.weapon.ammoType, loaded: it.weapon.loaded, x: it.x, y: it.y, floor: it.floor }));
  const bodies = sim.actors.filter((a) => a.status === 'dead' && (a.role === 'hostile' || a.role === 'civilian')).map((a) => ({
    x: a.x, y: a.y, floor: a.floor, facing: a.facing, role: a.role, name: a.remains ? a.name : a.role === 'civilian' ? 'Civilian' : 'Body', min: a.remains ? a.diedMin : min,
  }));
  return { cells, tiles, items, bodies };
}

// Note: the earlier memory with this visit's changes laid over it; the ground items and the dead are as the scene left them.
export function mergeMemory(old, captured, min) {
  const prev = cleanMemory(old) || { cells: [], tiles: [], items: [], bodies: [] };
  const key = (c) => `${c[0]}:${c[1]}:${c[2]}`;
  const byCell = new Map(prev.cells.map((c) => [key(c), c]));
  const byTile = new Map(prev.tiles.map((c) => [key(c), c]));
  for (const c of captured.cells || []) byCell.set(key(c), c);
  // Note: a cell blown away this visit drops its earlier state change; the tile record holds its state now.
  for (const c of captured.tiles || []) {
    byTile.set(key(c), c);
    byCell.delete(key(c));
  }
  // Note: a state change on a tile wrecked in an earlier visit belongs to that tile record.
  for (const [k, c] of byCell) {
    const t = byTile.get(k);
    if (!t) continue;
    byTile.set(k, [t[0], t[1], t[2], t[3], c[3]]);
    byCell.delete(k);
  }
  return cleanMemory({ cells: [...byCell.values()], tiles: [...byTile.values()], items: captured.items || [], bodies: (captured.bodies || []).map((b) => ({ ...b, min: num(b.min) && b.min > 0 ? b.min : min })), at: min });
}

// Note: re-lays the bodies in a kept memory at minute min, dropping those taken away by now.
export function memoryAt(memory, min) {
  const m = cleanMemory(memory);
  return m ? { ...m, bodies: lyingAt(m, min) } : null;
}

