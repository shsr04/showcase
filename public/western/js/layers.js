// Note: a map-sized picture kept as 8 x 8 tile canvases, so a door, a window or a blood spot uploads one small chunk instead of the whole map.

import { TILE, MAP_W, MAP_H } from './config.js';

export const CHUNK = 8;
// Note: the chunk size in device pixels.
export const CHUNK_PX = CHUNK * TILE;

export class ChunkLayer {
  // Note: lazy layers (decals) only make a canvas where something is painted; the floor makes them all.
  // Note: W and H are the map's size in cells, the standard grid when not given.
  constructor(scene, name, depth, lazy = false, W = MAP_W, H = MAP_H) {
    this.scene = scene;
    this.W = W;
    this.H = H;
    this.NX = Math.ceil(W / CHUNK);
    this.NY = Math.ceil(H / CHUNK);
    this.name = name;
    this.depth = depth;
    this.lazy = lazy;
    this.cells = new Map();
    this.shown = true;
    this.bytes = 0;
    if (!lazy) for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) this.chunk(i, j);
  }

  size(i, j) {
    return [Math.min(CHUNK, this.W - i * CHUNK) * TILE, Math.min(CHUNK, this.H - j * CHUNK) * TILE];
  }

  chunk(i, j) {
    const id = j * this.NX + i;
    let c = this.cells.get(id);
    if (c) return c;
    const [w, h] = this.size(i, j);
    const key = `${this.name}:${i}:${j}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const tex = this.scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const img = this.scene.add.image(i * CHUNK_PX, j * CHUNK_PX, key).setOrigin(0, 0).setDepth(this.depth).setVisible(this.shown);
    c = { i, j, key, tex, ctx, img, w, h, dirty: false };
    this.cells.set(id, c);
    this.bytes += w * h * 4;
    return c;
  }

  // Note: paints every chunk touching the map-pixel rectangle; fn gets a context whose origin is the map origin, so painters use map pixels.
  paint(x0, y0, x1, y1, fn) {
    const i0 = Math.max(0, Math.floor(x0 / CHUNK_PX));
    const i1 = Math.min(this.NX - 1, Math.floor((x1 - 1) / CHUNK_PX));
    const j0 = Math.max(0, Math.floor(y0 / CHUNK_PX));
    const j1 = Math.min(this.NY - 1, Math.floor((y1 - 1) / CHUNK_PX));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = this.chunk(i, j);
        c.ctx.save();
        c.ctx.translate(-i * CHUNK_PX, -j * CHUNK_PX);
        fn(c.ctx, i * CHUNK, j * CHUNK, Math.min(this.W, (i + 1) * CHUNK), Math.min(this.H, (j + 1) * CHUNK));
        c.ctx.restore();
        c.dirty = true;
      }
    }
  }

  // Note: the tile rectangle [tx0, tx1) x [ty0, ty1), as map pixels.
  paintTiles(tx0, ty0, tx1, ty1, fn) {
    this.paint(tx0 * TILE, ty0 * TILE, tx1 * TILE, ty1 * TILE, fn);
  }

  clear() {
    for (const c of this.cells.values()) {
      c.ctx.clearRect(0, 0, c.w, c.h);
      c.dirty = true;
    }
  }

  // Note: uploads the chunks that changed; call once per frame.
  flush() {
    for (const c of this.cells.values()) {
      if (!c.dirty) continue;
      c.dirty = false;
      c.tex.refresh();
    }
  }

  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    for (const c of this.cells.values()) c.img.setVisible(on);
  }

  // Note: copies the part of the layer in the map-pixel window (sx, sy, w, h) onto another canvas, scaled by k.
  blit(ctx, sx, sy, w, h, k) {
    for (const c of this.cells.values()) {
      const x = c.i * CHUNK_PX;
      const y = c.j * CHUNK_PX;
      if (x + c.w <= sx || y + c.h <= sy || x >= sx + w || y >= sy + h) continue;
      ctx.drawImage(c.ctx.canvas, (x - sx) * k, (y - sy) * k, c.w * k, c.h * k);
    }
  }

  destroy() {
    for (const c of this.cells.values()) {
      c.img.destroy();
      if (this.scene.textures.exists(c.key)) this.scene.textures.remove(c.key);
    }
    this.cells.clear();
    this.bytes = 0;
  }
}
