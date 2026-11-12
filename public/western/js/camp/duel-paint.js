// Note: the shots and the revolver of a duel's stage, painted from the sim's view alone: the flash, smoke, tracer and wound of each shot, and the gun lying in the dirt while no one holds it.
import { TILE } from '../config.js';
import { PAL, C } from '../palette.js';
import { unit } from '../rand.js';
import { LANE_ZOOM } from './duel-arena.js';

const hex = (i) => PAL[i];

// Note: the spot where a side stands on the lane: the sheriff at the west end, the foe at the east.
export const spotOf = (arena, who) => ({ x: who === 'player' ? arena.x0 : arena.x1, y: arena.y });

// Note: where the muzzle of a side's revolver stands, for the way it faces now.
export function muzzleOf(arena, who, facing) {
  const p = spotOf(arena, who);
  const reach = 0.85 * LANE_ZOOM;
  return { x: p.x + Math.cos(facing) * reach - Math.sin(facing) * 0.12, y: p.y + Math.sin(facing) * reach + Math.cos(facing) * 0.12 };
}

// Note: each shot not queued yet gets its flash, smoke, tracer and wound or dust; seen keeps the shots queued, and fx keeps the last sixty effects.
export function addShots(fx, seen, arena, sim, view) {
  for (const e of view.shots) {
    const key = `${e.time}:${e.who}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const who = e.who;
    const target = who === 'player' ? 'opponent' : 'player';
    const f = sim[who].facing;
    const from = muzzleOf(arena, who, f);
    const toX = spotOf(arena, target).x;
    const miss = (unit(`${sim.spec.initial.seed}:miss:${e.time}`) - 0.5) * 3;
    const end = e.hit ? { x: toX, y: arena.y + (unit(`${sim.spec.initial.seed}:in:${e.time}`) - 0.5) * 0.4 } : { x: toX + (who === 'player' ? 1 : -1) * (1.5 + Math.abs(miss)), y: arena.y + miss };
    fx.push({ kind: 'flash', t0: e.time, x: from.x, y: from.y, f }, { kind: 'smoke', t0: e.time, x: from.x, y: from.y, f }, { kind: 'tracer', t0: e.time, from, end }, { kind: e.hit ? 'wound' : 'dust', t0: e.time, x: end.x, y: end.y });
  }
  while (fx.length > 60) fx.shift();
}

// Note: each queued effect is painted for its own age; calm holds the flash steady and keeps the smoke still.
export function paintShots(g, fx, view, calm) {
  for (const p of fx) {
    const age = view.time - p.t0;
    if (age < 0) continue;
    g.save();
    if (p.kind === 'flash' && age < 0.12) {
      g.globalAlpha = calm ? 0.55 : 1 - age / 0.12;
      const r = (0.35 + age * 2) * TILE;
      g.fillStyle = hex(C.GOLD_L);
      g.beginPath();
      g.arc(p.x * TILE, p.y * TILE, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff6cf';
      g.beginPath();
      g.arc(p.x * TILE, p.y * TILE, r * 0.55, 0, Math.PI * 2);
      g.fill();
    } else if (p.kind === 'smoke' && age < 1.6) {
      g.globalAlpha = 0.5 * (1 - age / 1.6);
      g.fillStyle = hex(C.PLASTER);
      const drift = calm ? 0 : age;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc((p.x + Math.cos(p.f) * (0.3 + 0.5 * drift) + i * 0.12) * TILE, (p.y + Math.sin(p.f) * (0.3 + 0.5 * drift) - drift * 0.25 + i * 0.08) * TILE, (0.18 + age * 0.3 + i * 0.05) * TILE, 0, Math.PI * 2);
        g.fill();
      }
    } else if (p.kind === 'tracer' && age < 0.07) {
      g.globalAlpha = 0.8 * (1 - age / 0.07);
      g.strokeStyle = hex(C.PLASTER_L);
      g.lineWidth = Math.max(1.5, TILE / 20);
      g.beginPath();
      g.moveTo(p.from.x * TILE, p.from.y * TILE);
      g.lineTo(p.end.x * TILE, p.end.y * TILE);
      g.stroke();
    } else if ((p.kind === 'dust' || p.kind === 'wound') && age > 0.04 && age < 1.2) {
      g.globalAlpha = 0.7 * (1 - age / 1.2);
      g.fillStyle = p.kind === 'wound' ? hex(C.RED) : hex(C.SAND_L);
      g.beginPath();
      g.arc(p.x * TILE, p.y * TILE, (0.14 + age * (p.kind === 'wound' ? 0.2 : 0.55)) * TILE, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

// Note: a revolver lying on the ground at a point in tiles, turned by the given angle.
export function paintRevolver(g, x, y, turn) {
  g.save();
  g.translate(x * TILE, y * TILE);
  g.rotate(turn);
  g.fillStyle = hex(C.DARK);
  g.fillRect(-0.28 * TILE, -0.05 * TILE, 0.56 * TILE, 0.12 * TILE);
  g.fillStyle = hex(C.WOOD_D);
  g.fillRect(-0.34 * TILE, -0.03 * TILE, 0.14 * TILE, 0.2 * TILE);
  g.fillStyle = hex(C.IRON_L);
  g.fillRect(0.12 * TILE, -0.03 * TILE, 0.16 * TILE, 0.05 * TILE);
  g.restore();
}
