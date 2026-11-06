// Note: links between neighbouring islands: anchors, geometry, crafts and growth; the capital plans which ones start.

import { N, LINKS } from './config.js';
import { cidx, inB, PK } from './island.js';
import { nearestWalkable } from './path.js';
import { linkBenchEnd } from './econ.js';
import { clamp } from './rand.js';

export function worldOf(isl, i, j) { return { x: isl.wx + isl.cx0(i), z: isl.wz + isl.cz0(j) }; }

// Note: pick anchor cells: A's reachable (or any) land cell closest to B, then B's land cell closest to that.
export function computeAnchors(A, B) {
  let best = null; let bd = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!A.land(i, j)) continue;
    if (A.reach && !A.reach[cidx(i, j)]) continue;
    if (!A.walkable(i, j)) continue;
    // Note: an anchor never lands on the reserved airdock block.
    if (A.dockSite && i >= A.dockSite.x && j >= A.dockSite.y && i < A.dockSite.x + A.dockSite.size && j < A.dockSite.y + A.dockSite.size) continue;
    const p = worldOf(A, i, j);
    const dx = B.wx - p.x; const dz = B.wz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = { i, j }; }
  }
  if (!best) return null;
  const pa = worldOf(A, best.i, best.j);
  let bb = null; let bd2 = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!B.land(i, j) || B.water[cidx(i, j)] > 0.3) continue;
    const p = worldOf(B, i, j);
    const d = Math.hypot(p.x - pa.x, p.z - pa.z);
    if (d < bd2) { bd2 = d; bb = { i, j }; }
  }
  if (!bb) return null;
  return { ai: best, bi: bb, gap: bd2 };
}

export function makeLink(world, A, B) {
  const an = computeAnchors(A, B);
  if (!an) return null;
  const link = {
    id: `${A.id}|${B.id}`, a: A.id, b: B.id, ai: an.ai, bi: an.bi, gap: an.gap, type: null, state: 'none', progress: 0,
    x: an.ai.i, y: an.ai.j, size: 1, door: { i: an.ai.i, j: an.ai.j }, claims: 0, built: false, work: 0, isLink: true, pts: null, len: an.gap,
    tier: 0, benchEnd: 0, adPaid: false, adProgress: 0,
  };
  link.pts = linkPoints(world, link);
  return link;
}

export function linkPoints(world, link) {
  const A = world.islands.get(link.a); const B = world.islands.get(link.b);
  const pa = worldOf(A, link.ai.i, link.ai.j);
  const pb = worldOf(B, link.bi.i, link.bi.j);
  const ya = A.heightAt(link.ai.i + 0.5, link.ai.j + 0.5) + 0.12;
  const yb = B.heightAt(link.bi.i + 0.5, link.bi.j + 0.5) + 0.12;
  const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
  const type = link.type || 'ropebridge';
  const n = Math.max(6, Math.round(len * 1.6));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let y = ya + (yb - ya) * t;
    if (type === 'ropebridge') y -= Math.sin(Math.PI * t) * Math.min(1.6, len * 0.07);
    else if (type === 'vine') y += Math.sin(Math.PI * t) * Math.min(0.8, len * 0.04) - Math.sin(Math.PI * t) * 0.35;
    else if (type === 'balloon') y += Math.sin(Math.PI * t) * 2.2 + 0.6;
    else if (type === 'cablecar') y += 1.9 - Math.sin(Math.PI * t) * 0.5;
    pts.push({ x: pa.x + (pb.x - pa.x) * t, y, z: pa.z + (pb.z - pa.z) * t });
  }
  link.len = len;
  return pts;
}

export function linkPos(link, t, reverse) {
  const p = link.pts;
  const tt = reverse ? 1 - t : t;
  const u = clamp(tt, 0, 1) * (p.length - 1);
  const k = Math.min(p.length - 2, Math.floor(u));
  const f = u - k;
  const o = { x: p[k].x + (p[k + 1].x - p[k].x) * f, y: p[k].y + (p[k + 1].y - p[k].y) * f, z: p[k].z + (p[k + 1].z - p[k].z) * f };
  // Note: a rider queued before the start (t < 0) waits in line back along the first segment, so a herd never stacks on one point.
  const back = reverse ? tt - 1 : -tt;
  if (back > 0 && p.length > 1) {
    const a = reverse ? p[p.length - 1] : p[0]; const b = reverse ? p[p.length - 2] : p[1];
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const m = back * Math.max(2, link.len || 2);
    o.x = a.x - (b.x - a.x) / d * m; o.z = a.z - (b.z - a.z) / d * m;
  }
  return o;
}

export function typeAvailable(world, type) {
  const def = LINKS[type];
  if (type === 'vine') return true;
  if (type === 'ropebridge') return world.known.has('woodwork');
  if (type === 'balloon') return world.unlocked.has('balloon');
  if (type === 'cablecar') return world.unlocked.has('cablecar');
  return !def.knowledge || world.known.has(def.knowledge);
}

// Note: the craft that spans a gap with the knowledge at hand, cheapest first; null when none does.
export function craftFor(world, gap) {
  for (const type of ['ropebridge', 'balloon', 'cablecar']) {
    if (!typeAvailable(world, type) || gap > LINKS[type].gap) continue;
    return type;
  }
  return null;
}

// Note: the longest gap any unlocked craft spans.
export function maxSpan(world) {
  let m = LINKS.vine.gap;
  for (const type of ['ropebridge', 'balloon', 'cablecar']) if (typeAvailable(world, type)) m = Math.max(m, LINKS[type].gap);
  return m;
}

export function vineSupport(isl, link) {
  let n = 0;
  for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
    const i = link.ai.i + di; const j = link.ai.j + dj;
    if (!inB(i, j) || Math.hypot(di, dj) > 3.2) continue;
    const c = cidx(i, j);
    if (isl.plant[c] === PK.vine && isl.grow[c] >= 0.6 && isl.moist[c] > 0.3) n++;
  }
  return n;
}

// Note: the capital decides which links start (capital.js); this only turns a planned link into a building one.
export function startLink(world, A, B, link, type) {
  link.type = type;
  link.state = 'building';
  link.progress = 0;
  link.built = false;
  link.work = LINKS[type].work || 1;
  link.pts = linkPoints(world, link);
  if (!world.links.includes(link)) world.links.push(link);
  (A.anchors || (A.anchors = [])).push({ i: link.ai.i, j: link.ai.j });
  (B.anchors || (B.anchors = [])).push({ i: link.bi.i, j: link.bi.j });
  world.emit({ type: 'linkstart', link });
}

export function stepLinks(world, dt) {
  for (const l of world.links) {
    // Note: the bench end follows the island rungs until tier 3 freezes it.
    if (l.state === 'done' && (l.tier | 0) < 3) l.benchEnd = linkBenchEnd(world, l);
    if (l.state !== 'building') continue;
    if (l.type === 'vine') {
      const A = world.islands.get(l.a);
      const sup = vineSupport(A, l);
      if (sup >= 2) l.progress = Math.min(1, l.progress + dt / Math.max(40, l.len * 12) * (0.6 + sup * 0.15));
      else l.progress = Math.max(0, l.progress - dt * 0.004);
      l.built = l.progress >= 1;
    } else {
      l.progress = l.built ? 1 : Math.max(l.progress, 0);
    }
    if (l.built || l.progress >= 1) {
      l.state = 'done'; l.built = true; l.progress = 1;
      world.emit({ type: 'linkdone', link: l });
    }
  }
}
