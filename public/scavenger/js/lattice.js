// Note: coarse lattice of node cells; arteries (runs) link neighbouring nodes along one axis. Pure data, district free.

import { hash3, hash5, u01 } from './rand.js';

// Note: per axis block length B and node offset range [lo, hi] inside each block; node gaps are B +- (hi - lo) cells.
export const NODE_SPEC = [
  { B: 7, lo: 1, hi: 5 },
  { B: 6, lo: 1, hi: 4 },
  { B: 7, lo: 1, hi: 5 },
];

// Note: chance that the run between two neighbouring nodes exists, per axis.
export const RUN_P = [0.66, 0.6, 0.66];

export class Lattice {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.memo = [new Map(), new Map(), new Map()];
  }

  nodeInBlock(axis, block) {
    const m = this.memo[axis];
    let v = m.get(block);
    if (v === undefined) {
      const { B, lo, hi } = NODE_SPEC[axis];
      v = block * B + lo + (hash3(this.seed ^ 0x1a77, axis, block) % (hi - lo + 1));
      m.set(block, v);
    }
    return v;
  }

  isNode(axis, c) {
    return this.nodeInBlock(axis, Math.floor(c / NODE_SPEC[axis].B)) === c;
  }

  // Note: largest node coordinate at or below c.
  prevNode(axis, c) {
    const b = Math.floor(c / NODE_SPEC[axis].B);
    const n = this.nodeInBlock(axis, b);
    return n <= c ? n : this.nodeInBlock(axis, b - 1);
  }

  // Note: smallest node coordinate above c.
  nextNode(axis, c) {
    const b = Math.floor(c / NODE_SPEC[axis].B);
    const n = this.nodeInBlock(axis, b);
    return n > c ? n : this.nodeInBlock(axis, b + 1);
  }

  isNodeCell(i, j, k) {
    return this.isNode(0, i) && this.isNode(1, j) && this.isNode(2, k);
  }

  // Note: a run lies on a line whose two other coordinates are node coordinates.
  onLine(axis, lo) {
    return this.isNode((axis + 1) % 3, lo[(axis + 1) % 3]) && this.isNode((axis + 2) % 3, lo[(axis + 2) % 3]);
  }

  runExists(axis, n0, c1, c2) {
    return u01(hash5(this.seed ^ 0x5a17, axis, n0, c1, c2)) < RUN_P[axis];
  }

  // Note: true when the cell step lo -> lo + 1 along axis belongs to an existing run.
  stepExists(axis, lo) {
    if (!this.onLine(axis, lo)) return false;
    return this.runExists(axis, this.prevNode(axis, lo[axis]), lo[(axis + 1) % 3], lo[(axis + 2) % 3]);
  }

  // Note: face f of a cell carries a tunnel; faces are 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z.
  faceOpen(i, j, k, f) {
    const axis = f >> 1;
    const lo = [i, j, k];
    if (f & 1) lo[axis] -= 1;
    return this.stepExists(axis, lo);
  }

  openMask(i, j, k) {
    let m = 0;
    for (let f = 0; f < 6; f++) if (this.faceOpen(i, j, k, f)) m |= 1 << f;
    return m;
  }

  // Note: node cells reachable over one run from a node cell.
  nodeNeighbours(i, j, k) {
    const out = [];
    const c = [i, j, k];
    for (let f = 0; f < 6; f++) {
      if (!this.faceOpen(i, j, k, f)) continue;
      const axis = f >> 1;
      const n = c.slice();
      n[axis] = f & 1 ? this.prevNode(axis, c[axis] - 1) : this.nextNode(axis, c[axis]);
      out.push(n);
    }
    return out;
  }

  // Note: number of node cells within the given number of runs of a node cell, itself included.
  reachNodes(start, hops) {
    const seen = new Set([start.join(',')]);
    let frontier = [start];
    for (let h = 0; h < hops; h++) {
      const next = [];
      for (const c of frontier) {
        for (const n of this.nodeNeighbours(c[0], c[1], c[2])) {
          const key = n.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(n);
        }
      }
      frontier = next;
    }
    return seen.size;
  }
}
