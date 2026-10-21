// Note: turns a cell plan into per-space mesh arrays through a list of small tasks (for time slicing).

import { MeshBuilder } from './builder.js';
import { LightField } from './lightfield.js';
import { buildTube } from './tunnels.js';
import { tubeList } from './tubelife.js';
import { roomShellParts } from './roombuild.js';
import { roomStyle } from './rooms.js';
import { roomChunks, emitChunk } from './props.js';

// Note: returns { tasks, finish }; run every task, then finish() yields [{ space, arrays }].
export function makeCellBuild(world, plan, atlas, opts = {}) {
  const detail = opts.detail ?? 1;
  const ao = opts.ao !== false;
  const builders = new Map();
  let lf = null;
  const getB = (space) => {
    let b = builders.get(space);
    if (!b) {
      if (!lf) lf = new LightField(world, plan, { ao });
      b = new MeshBuilder(space === 'R' ? 8192 : 2048);
      b.bake = lf.bakeFor(space);
      builders.set(space, b);
    }
    return b;
  };
  const tasks = [];
  if (plan.room) {
    // Note: the light field is the costliest setup, so it gets a task of its own before the shell pieces.
    tasks.push(() => getB('R'));
    for (const part of roomShellParts(plan, roomStyle(plan))) tasks.push(() => part(getB('R')));
    for (const chunk of roomChunks(plan)) {
      tasks.push(() => emitChunk(getB('R'), chunk, atlas, lf.field));
    }
  }
  for (const d of tubeList(plan)) {
    tasks.push(() => buildTube(getB(d.id), plan, d, atlas, detail));
  }
  const finish = () => {
    const out = [];
    for (const [space, b] of builders) {
      if (b.nv === 0) continue;
      out.push({ space, arrays: b.arrays(), stats: b.stats() });
    }
    return out;
  };
  return { tasks, finish };
}
