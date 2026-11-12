// Note: sound propagation over every floor; each listener gets a level, an arrival direction and a perceived position.

import { GRID_W, GRID_H, MAX_FLOORS, SOUND_FLOOR, SLAB_LOSS } from './config.js';
import { T, TILE_PROPS, cellSoundLoss, isFlight } from './tiles.js';
import { solidAt } from './map.js';
import { clamp } from './rand.js';

// Note: dB at one metre from the source.
export const SOUND_LEVELS = {
  walk: 35, sprint: 52, slow: 18, crouch: 28,
  door_quiet: 20, door: 40, door_force: 75, window_open: 42, window_break: 65, glass: 55,
  gunshot_rifle: 100, gunshot_handgun: 96, reload: 32, cycle: 30, switch: 28,
  shout: 68, whisper: 40, body: 40, impact: 50, scavenge: 22, climb: 45, cry: 60, drop: 44, knife: 38, swish: 30,
  // Note: item 499: a struck match, a burning fuse, a stick striking something, and one stick of dynamite going off (about 170 dB at a metre, held at the top of this scale).
  match: 30, fuse: 30, stick: 40, blast: 150, collapse: 88,
};

export const BASE_THRESHOLD = 18;

// Note: nodes sit on a grid of the largest map with a one-cell frame round the map in use, so steps need no bounds test: node = floor * PCELLS + (y + 1) * PW + x + 1.
const PW = GRID_W + 2;
const PCELLS = PW * (GRID_H + 2);
const NODES = PCELLS * MAX_FLOORS;
const MAX_LEN = 60;
// Note: each dB of loss counts as this many metres when choosing the best path.
const LOSS_COST = 0.8;
const FLOOR_H = 3;
// Note: an open stairwell carries sound between floors far better than a slab.
const STAIR_LOSS = 6;
// Note: a diagonal step may not slip between cells that lose at least this many dB.
const BLOCK_LOSS = 14;
const SQRT2 = Math.SQRT2;
// Note: the eight steps in the order they are tried, and the two side cells each diagonal passes between.
const OFF = new Int32Array([1, -1, PW, -PW, PW + 1, 1 - PW, PW - 1, -PW - 1]);
const SIDE_A = new Int32Array([0, 0, 0, 0, 1, 1, -1, -1]);
const SIDE_B = new Int32Array([0, 0, 0, 0, PW, -PW, PW, -PW]);
const STEP = new Float64Array([1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2]);
// Note: a path of at most MAX_LEN metres loses at most this many dB to distance, 20 log10 of MAX_LEN.
const MAX_ATTEN = 20 * Math.log10(MAX_LEN);
// Note: dB lost in a tile whatever its state; -1 marks a door, a window or an unknown tile, which cellSoundLoss reads.
const TILE_LOSS = Float64Array.from({ length: 256 }, (_, t) => (t === T.DOOR || t === T.WINDOW || !TILE_PROPS[t] ? -1 : TILE_PROPS[t].loss));

const cost = new Float64Array(NODES);
const plen = new Float32Array(NODES);
const ploss = new Float32Array(NODES);
const parent = new Int32Array(NODES);
const done = new Uint8Array(NODES);
// Note: the done flags a flood starts from, with every node off the map in use already done; one per map size.
const frames = new Map();
function doneFrame(W, H, floors) {
  const key = (floors * 1000 + W) * 1000 + H;
  let frame = frames.get(key);
  if (!frame) {
    frame = new Uint8Array(NODES).fill(1);
    for (let f = 0; f < floors; f++) for (let y = 0; y < H; y++) frame.fill(0, f * PCELLS + (y + 1) * PW + 1, f * PCELLS + (y + 1) * PW + 1 + W);
    frames.set(key, frame);
  }
  return frame;
}
// Note: the size of the map the per-node arrays were last filled from.
let curW = 0;
let curH = 0;
// Note: per node and filled at the start of a flood when the map has changed: the cell's dB loss, a wall that closes a diagonal gap, a flight of stairs.
const lossG = new Float64Array(NODES);
const blockG = new Uint8Array(NODES);
const flightG = new Uint8Array(NODES);
const mark = new Uint8Array(NODES);
const heapK = new Float64Array(NODES * 10);
const heapV = new Int32Array(NODES * 10);
let heapN = 0;

function push(k, v) {
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapK[p] <= k) break;
    heapK[i] = heapK[p];
    heapV[i] = heapV[p];
    i = p;
  }
  heapK[i] = k;
  heapV[i] = v;
}

function pop() {
  const top = heapV[0];
  const n = --heapN;
  if (n > 0) {
    const k = heapK[n];
    const v = heapV[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && heapK[c + 1] < heapK[c]) c++;
      if (heapK[c] >= k) break;
      heapK[i] = heapK[c];
      heapV[i] = heapV[c];
      i = c;
    }
    heapK[i] = k;
    heapV[i] = v;
  }
  return top;
}

// Note: the tiles and states the per-node arrays were last filled from, so an unchanged map skips the refill.
let seen = [];
let seenOk = false;

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function fillLoss(map) {
  const floors = map.floors;
  if (seenOk && curW === map.W && curH === map.H && seen.length === 2 * floors.length && floors.every((fl, f) => same(fl.tile, seen[2 * f]) && same(fl.state, seen[2 * f + 1]))) return;
  seenOk = false;
  curW = map.W;
  curH = map.H;
  if (seen.length !== 2 * floors.length || seen[0].length !== map.W * map.H) {
    seen = floors.flatMap(() => [new Uint8Array(map.W * map.H), new Uint8Array(map.W * map.H)]);
    // Note: a smaller map than the last leaves old values beyond its edge, where a diagonal step reads its side cells.
    lossG.fill(0);
    blockG.fill(0);
    flightG.fill(0);
  }
  for (let f = 0; f < floors.length; f++) {
    const tile = map.floors[f].tile;
    const state = map.floors[f].state;
    for (let y = 0; y < map.H; y++) {
      const row = y * map.W;
      const node = f * PCELLS + (y + 1) * PW + 1;
      for (let x = 0; x < map.W; x++) {
        const t = tile[row + x];
        const fixed = TILE_LOSS[t];
        const loss = fixed < 0 ? cellSoundLoss(t, state[row + x]) : fixed;
        lossG[node + x] = loss;
        blockG[node + x] = loss >= BLOCK_LOSS ? 1 : 0;
        flightG[node + x] = isFlight(t) ? 1 : 0;
      }
    }
  }
  floors.forEach((fl, f) => {
    seen[2 * f].set(fl.tile);
    seen[2 * f + 1].set(fl.state);
  });
  seenOk = true;
}

function lossAt(f, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= curW || cy >= curH) return 99;
  return lossG[f * PCELLS + (cy + 1) * PW + cx + 1];
}

function flood(map, srcNode, level, floorDb, remaining) {
  fillLoss(map);
  done.set(doneFrame(map.W, map.H, map.floors.length));
  cost.fill(Infinity);
  heapN = 0;
  // Note: a step losing at most sure dB is audible and one losing over dead dB is not, so only the band between needs the logarithm.
  const sure = level - floorDb - MAX_ATTEN;
  const dead = level - floorDb + 1e-6;
  cost[srcNode] = 0;
  plen[srcNode] = 0;
  ploss[srcNode] = 0;
  parent[srcNode] = -1;
  push(0, srcNode);
  while (heapN > 0) {
    const k = heapK[0];
    const n = pop();
    if (done[n] || k > cost[n]) continue;
    done[n] = 1;
    if (mark[n] && --remaining === 0) break;
    const pl = plen[n];
    const pls = ploss[n];
    for (let d = 0; d < 8; d++) {
      const m = n + OFF[d];
      if (done[m]) continue;
      if (d >= 4 && (blockG[n + SIDE_A[d]] | blockG[n + SIDE_B[d]]) !== 0) continue;
      const nl = pl + STEP[d];
      if (nl > MAX_LEN) continue;
      const nloss = pls + lossG[m];
      const c = nl + LOSS_COST * nloss;
      if (!(c < cost[m])) continue;
      // Note: nl is at least 1 here, so the logarithm needs no clamp.
      if (!(nloss <= sure) && (nloss > dead || level - 20 * Math.log10(nl) - nloss < floorDb)) continue;
      cost[m] = c;
      plen[m] = nl;
      ploss[m] = nloss;
      parent[m] = n;
      push(c, m);
    }
    // Note: vertical hops through the slab above and below, or through the stairwell where both floors have stairs; floors off the map are done already.
    for (let side = -1; side <= 1; side += 2) {
      const o = n + side * PCELLS;
      if (o < 0 || o >= NODES || done[o]) continue;
      const nl = pl + FLOOR_H;
      const nloss = pls + (flightG[n] !== 0 && flightG[o] !== 0 ? STAIR_LOSS : SLAB_LOSS) + lossG[o];
      if (nl <= MAX_LEN) {
        const c = nl + LOSS_COST * nloss;
        if (c < cost[o] && (nloss <= sure || (nloss <= dead && level - 20 * Math.log10(nl) - nloss >= floorDb))) {
          cost[o] = c;
          plen[o] = nl;
          ploss[o] = nloss;
          parent[o] = n;
          push(c, o);
        }
      }
    }
  }
}

// Note: true when no lossy cell lies between the two points, ignoring the start and end cells.
function clearSegment(f, x0, y0, x1, y1, ex, ey) {
  const sx = Math.floor(x0);
  const sy = Math.floor(y0);
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
  for (let i = 1; i < n; i++) {
    const cx = Math.floor(x0 + ((x1 - x0) * i) / n);
    const cy = Math.floor(y0 + ((y1 - y0) * i) / n);
    if ((cx === sx && cy === sy) || (cx === ex && cy === ey)) continue;
    if (lossAt(f, cx, cy) > 0) return false;
  }
  return true;
}

// Note: walks the best path back from the listener to find where the sound seems to come from.
function apparentPoint(node, srcNode, lx, ly) {
  const lf = (node / PCELLS) | 0;
  let cur = node;
  let best = -1;
  while (cur !== srcNode) {
    const p = parent[cur];
    if (p < 0) break;
    const pf = (p / PCELLS) | 0;
    if (pf !== lf) return { kind: 'hop', node: cur };
    const pr = p - pf * PCELLS;
    const pcy = ((pr / PW) | 0) - 1;
    const pcx = pr - (pcy + 1) * PW - 1;
    if (!clearSegment(lf, lx, ly, pcx + 0.5, pcy + 0.5, pcx, pcy)) break;
    if (p === srcNode) return { kind: 'direct' };
    best = p;
    if (lossAt(lf, pcx, pcy) > 0) return { kind: 'barrier', node: p };
    cur = p;
  }
  if (best >= 0) return { kind: 'corner', node: best };
  return parent[node] >= 0 ? { kind: 'corner', node: parent[node] } : { kind: 'direct' };
}

function nodeCentre(node) {
  const f = (node / PCELLS) | 0;
  const r = node - f * PCELLS;
  const y = ((r / PW) | 0) - 1;
  return { x: r - (y + 1) * PW - 1 + 0.5, y: y + 0.5 };
}

const gauss = (rand) => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());

// Note: a perceived position inside a wall is pulled back toward the listener until it is open floor.
function snapOpen(map, f, lx, ly, px, py) {
  let x = clamp(px, 0.5, map.W - 0.5);
  let y = clamp(py, 0.5, map.H - 0.5);
  for (let i = 0; i < 80; i++) {
    if (!solidAt(map, f, Math.floor(x), Math.floor(y))) break;
    const d = Math.hypot(lx - x, ly - y);
    if (d < 0.5) {
      x = lx;
      y = ly;
      break;
    }
    x += ((lx - x) / d) * 0.5;
    y += ((ly - y) / d) * 0.5;
  }
  return { x, y };
}

// Note: listeners = [{ id, x, y, floor, threshold }]; returns only those who hear it, in listener order.
export function propagate(map, src, level, listeners, rand = Math.random) {
  const out = [];
  const sx = Math.floor(src.x);
  const sy = Math.floor(src.y);
  if (!listeners.length || sx < 0 || sy < 0 || sx >= map.W || sy >= map.H) return out;
  const srcNode = src.f * PCELLS + (sy + 1) * PW + sx + 1;
  const nodes = new Array(listeners.length);
  let minThreshold = Infinity;
  let remaining = 0;
  for (let i = 0; i < listeners.length; i++) {
    const L = listeners[i];
    const th = L.threshold ?? BASE_THRESHOLD;
    const cx = Math.floor(L.x);
    const cy = Math.floor(L.y);
    if (!(th < Infinity) || cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) {
      nodes[i] = -1;
      continue;
    }
    const node = L.floor * PCELLS + (cy + 1) * PW + cx + 1;
    nodes[i] = node;
    if (th < minThreshold) minThreshold = th;
    if (!mark[node]) {
      mark[node] = 1;
      remaining++;
    }
  }
  const floorDb = Math.max(minThreshold, SOUND_FLOOR);
  if (remaining === 0 || level < floorDb) {
    for (const n of nodes) if (n >= 0) mark[n] = 0;
    return out;
  }
  flood(map, srcNode, level, floorDb, remaining);
  for (let i = 0; i < listeners.length; i++) {
    const node = nodes[i];
    if (node < 0) continue;
    mark[node] = 0;
    const L = listeners[i];
    const th = L.threshold ?? BASE_THRESHOLD;
    const sameFloor = L.floor === src.f;
    const flat = Math.hypot(L.x - src.x, L.y - src.y);
    let len;
    let loss;
    let apparent;
    if (node === srcNode) {
      len = flat;
      loss = 0;
      apparent = { kind: 'direct' };
    } else if (cost[node] === Infinity) {
      continue;
    } else {
      len = sameFloor ? Math.max(plen[node], flat) : plen[node];
      loss = ploss[node];
    }
    const lvl = level - 20 * Math.log10(Math.max(len, 1)) - loss;
    if (lvl < th) continue;
    if (!apparent) apparent = apparentPoint(node, srcNode, L.x, L.y);
    let ax = src.x;
    let ay = src.y;
    let via = null;
    if (apparent.kind !== 'direct') {
      const c = nodeCentre(apparent.node);
      ax = c.x;
      ay = c.y;
      via = c;
      if (apparent.kind === 'hop' && Math.hypot(ax - L.x, ay - L.y) < 0.7) {
        // Note: straight above or below, so only the source's own offset hints at a direction.
        via = null;
        ax = src.x;
        ay = src.y;
      }
    }
    const q = clamp((lvl - th) / 30, 0, 1);
    const muffle = loss / (loss + 20);
    const base = Math.hypot(ax - L.x, ay - L.y) < 0.05 ? rand() * Math.PI * 2 : Math.atan2(ay - L.y, ax - L.x);
    const dir = base + gauss(rand) * (0.08 + 0.6 * (1 - q));
    const dist = Math.max(0.5, len * (1 + 0.5 * muffle) * (1 + gauss(rand) * (0.1 + 0.4 * (1 - q))));
    const pos = snapOpen(map, src.f, L.x, L.y, L.x + Math.cos(dir) * dist, L.y + Math.sin(dir) * dist);
    out.push({
      id: L.id, level: lvl, dir, dist, muffle, pos, floor: src.f,
      direct: apparent.kind === 'direct', via, len,
    });
  }
  return out;
}

export function loudnessOf(kind, extras = {}) {
  return (SOUND_LEVELS[kind] ?? 0) + (extras.db ?? 0);
}

// Note: the footstep sound an actor makes right now, or null when standing still.
export function footstepKind(actor) {
  if (actor.mode === 'sprint') return 'sprint';
  if (actor.mode === 'slow') return 'slow';
  if (actor.mode === 'walk') return actor.stance === 'crouch' ? 'crouch' : 'walk';
  return null;
}

// Note: the quietest sound in dB this actor notices; Infinity means deaf.
export function hearingThreshold(actor) {
  if (!actor || actor.status !== 'ok') return Infinity;
  // Note: item 499: ears ringing from a blast hear less until it fades.
  let t = BASE_THRESHOLD + (actor.deafDb || 0);
  const experience = actor.traits && actor.traits.experience;
  if (experience === 'veteran') t -= 3;
  else if (experience === 'green') t += 3;
  const state = (actor.ai && actor.ai.state) || actor.state || null;
  if (actor.dozing || state === 'dozing') t += 14;
  // Note: a posted sentry listens; idling at his post does not dull him as it does the men at the fire.
  else if (state === 'unaware' || state === 'idle') t += actor.campRole === 'sentry' ? 0 : 6;
  else if (actor.alert === true || state === 'alert' || state === 'engage' || state === 'search' || state === 'investigate') t -= 6;
  if (actor.stance === 'crouch' || (actor.settle || 0) >= 0.5) t -= 3;
  if (actor.mode === 'sprint') t += 6;
  else if (actor.mode === 'walk') t += 2;
  if (actor.wounds && actor.wounds.some((w) => w.region === 'head')) t += 10;
  return t;
}
