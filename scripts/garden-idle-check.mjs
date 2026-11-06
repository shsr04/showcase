// Note: idle-share check; run from the repo root with `node scripts/garden-idle-check.mjs [seed] [minutes]`.
// Note: idle = a daytime adult with no task or a gaze, wander or stroll; eating, sleeping and socialising are not idle. STRICT=1 fails above 15%.

// Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
let rs = 1;
Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { World } = await import('../public/garden/js/world.js');
const { SIM_DT } = await import('../public/garden/js/config.js');

const seed = process.argv[2] || 'SKY-1000';
const mins = Number(process.argv[3] || 30);
rs = seed.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const w = World.createNew(seed);
const IDLE = new Set(['gaze', 'wander', 'stroll']);
let idle = 0; let total = 0; const kinds = {};
for (let t = 0; t < mins * 60; t += SIM_DT) {
  w.step(SIM_DT);
  w.events.length = 0;
  if (t < 300 || Math.round(t / SIM_DT) % 20 !== 0) continue;
  if (w.night > 0.65) continue;
  for (const f of w.folk) {
    if (f.stage !== 'adult' || f.visitor || f.aboard || f.link) continue;
    total++;
    const k = f.task ? f.task.type : f.queue ? 'queue' : 'none';
    kinds[k] = (kinds[k] || 0) + 1;
    if (!f.task || IDLE.has(f.task.type)) idle++;
  }
}
const share = total ? idle / total : 0;
const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join(', ');
console.log(`${seed}: idle ${(100 * share).toFixed(1)}% of ${total} adult samples (${top})`);
console.log(share > 0.15 ? 'idle MISS (target <= 15%)' : 'idle ok');
if (share > 0.15 && process.env.STRICT) process.exit(1);
