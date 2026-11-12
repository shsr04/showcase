// Note: loose weapons on the floor, one small sprite each; a dropped one is tossed from the hand with a hop and a spin, then lies still.

import { TILE, SCALE } from './config.js';
import { C } from './palette.js';
import { clamp } from './rand.js';
import { pen, tint, hash, makeTextureCanvas } from './draw.js';
import { WEAPONS } from './weapons.js';
import { gunOpsFor, EXTENT } from './gunart.js';

const TOSS = 0.4;
// Note: width and height in art units; one unit is SCALE device pixels, as for people and tiles.
const SIZE = { rifle: [35, 8], handgun: [17, 8] };

// Note: item 364: a floor gun is its model's part list laid along a line, each part edged in dark first so it reads on any floor.
export function paintGun(model) {
  const kind = WEAPONS[model].kind === 'rifle' ? 'rifle' : 'handgun';
  const [w, h] = SIZE[kind];
  const cnv = makeTextureCanvas(w * SCALE, h * SCALE);
  const ctx = cnv.getContext('2d');
  const P = pen(SCALE);
  // Note: the gun is centred on its own length, so a short one spins about its middle and keeps its shadow.
  const ext = EXTENT[model] || 1;
  const half = ((w - 2.4) / 2) * ext;
  P.ell(ctx, tint(C.VOID, 0.3), w / 2, h - 2.6, half + 0.5, 1.6);
  const y = kind === 'rifle' ? 3.6 : 3.4;
  const ops = gunOpsFor(model, w / 2 - half, y, w / 2 - half + (2 * half) / ext, y, kind === 'rifle' ? 0.95 : 0.9);
  for (const [, , , edge] of ops) P.poly(ctx, C.DARK, edge);
  for (const [, col, pts] of ops) P.poly(ctx, col, pts);
  return cnv;
}

function textureKey(scene, model) {
  const key = `item:${model}:${SCALE}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, paintGun(model));
  return key;
}

export class Items {
  constructor(scene, depth) {
    this.scene = scene;
    this.depth = depth;
    this.imgs = new Map();
  }

  // Note: sim.items is the truth; sprites are made and removed to match it, and only the viewed floor shows.
  update(sim, view) {
    const live = new Set();
    for (const it of sim.items) {
      live.add(it.id);
      let img = this.imgs.get(it.id);
      if (!img) {
        img = this.scene.add.image(0, 0, textureKey(this.scene, it.weapon.id)).setOrigin(0.5).setDepth(this.depth);
        this.imgs.set(it.id, img);
      }
      const k = clamp((sim.time - it.t) / TOSS, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      const hop = Math.sin(Math.PI * k) * 0.3;
      const rest = hash(it.id, 7) * Math.PI * 2;
      const spin = (1 - e) * 7 * (hash(it.id, 3) < 0.5 ? -1 : 1);
      img.setPosition((it.from.x + (it.x - it.from.x) * e) * TILE, (it.from.y + (it.y - it.from.y) * e - hop) * TILE)
        .setRotation(rest + spin)
        .setVisible(it.floor === view.floor);
    }
    for (const [id, img] of this.imgs) {
      if (live.has(id)) continue;
      img.destroy();
      this.imgs.delete(id);
    }
  }

  destroy() {
    for (const img of this.imgs.values()) img.destroy();
    this.imgs.clear();
  }
}
