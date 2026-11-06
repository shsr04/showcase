// Note: natural-run pace check; run from the repo root with `node scripts/garden-pace-check.mjs [seed] [minutes]`.
// Note: no seed loops SKY-1000..SKY-1004, one child process per seed, and prints worst-of; a seed argument runs that seed alone.
// Note: targets (min): 2nd island 10, ballooning 25, 4th island 40, navigation 45, first rare island explored 60; STRICT=1 fails on a miss.
import { spawnSync } from 'node:child_process';

const SEEDS = ['SKY-1000', 'SKY-1001', 'SKY-1002', 'SKY-1003', 'SKY-1004'];
const MILES = [['second', '2nd island', 10], ['balloon', 'ballooning', 25], ['fourth', '4th island', 40], ['nav', 'navigation', 45], ['rare', 'rare island', 60]];
const CHILD_TIMEOUT_MS = 240000;
const f = (v) => (v === null || v === undefined ? 'never' : v.toFixed(1));
const never = () => Object.fromEntries(MILES.map(([k]) => [k, null]));
const line = (seed, at) => `${seed}: ${MILES.map(([k, n, t]) => `${n} ${f(at[k])} (${t})`).join(', ')}`;

const seedArg = process.argv[2];
const mins = Number(process.argv[3] || 70);

if (!seedArg) {
  const rows = [];
  for (const seed of SEEDS) {
    // Note: a fresh process per seed keeps module state clean; STRICT is cleared so the child never exits early on a miss.
    const env = { ...process.env }; delete env.STRICT;
    const r = spawnSync(process.execPath, [process.argv[1], seed, String(mins)], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', env, maxBuffer: 1 << 24 });
    const out = String(r.stdout || '');
    const m = out.match(/^RESULT (.*)$/m);
    let at = never(); let note = '';
    if (m) at = JSON.parse(m[1]).at;
    else note = r.error && r.error.code === 'ETIMEDOUT' ? ' [timeout]' : ` [child failed: status ${r.status}${r.stderr ? ` ${String(r.stderr).split('\n')[0]}` : ''}]`;
    const diag = out.split('\n').filter((l) => /^(tier|rung) /.test(l));
    rows.push({ seed, at });
    console.log(line(seed, at) + note);
    for (const d of diag) console.log(`  ${d}`);
  }
  const worst = {};
  for (const [k] of MILES) worst[k] = rows.some((r) => r.at[k] === null) ? null : Math.max(...rows.map((r) => r.at[k]));
  const miss = MILES.filter(([k, , t]) => worst[k] === null || worst[k] > t).map(([, n]) => n);
  console.log(`worst: ${MILES.map(([k, n, t]) => `${n} ${f(worst[k])} (${t})`).join(', ')}`);
  console.log(miss.length ? `pace MISS: ${miss.join(', ')}` : 'pace ok');
  if (miss.length && process.env.STRICT) process.exit(1);
} else {
  // Note: world.js captures Math.random at import, so the seeded stream is installed before the dynamic imports.
  let rs = 1;
  Math.random = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const { World } = await import('../public/garden/js/world.js');
  const { SIM_DT } = await import('../public/garden/js/config.js');
  // Note: capital.js is optional; a missing module or a throwing councilTier only drops the tier diagnostics.
  let councilTier = null;
  try { ({ councilTier } = await import('../public/garden/js/capital.js')); } catch { councilTier = null; }
  if (typeof councilTier !== 'function') councilTier = null;

  rs = seedArg.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const w = World.createNew(seedArg);
  const at = never();
  const tierAt = {};
  const stat = { settlers: 0 };
  const tierOf = () => {
    if (!councilTier) return null;
    try {
      let v = councilTier(w);
      if (!Number.isFinite(v)) v = councilTier(w.islands.get('0,0'));
      return Number.isFinite(v) ? v : null;
    } catch { councilTier = null; return null; }
  };
  // Note: rare means a rare slot island other than the Spire.
  const isRare = (i) => !!i.rareSlot && i.rareSlot !== 'spire' && !i.special;
  for (let t = 0; t < mins * 60; t += SIM_DT) {
    w.step(SIM_DT);
    for (const e of w.events) if (e.type === 'settled') stat.settlers++;
    w.events.length = 0;
    const n = Math.round(t / SIM_DT);
    if (n % 50 !== 0) continue;
    const min = t / 60;
    const isl = [...w.islands.values()];
    const pop = isl.filter((i) => !i.rare && !i.special && !i.rareSlot && w.folkOn(i.id).length > 0).length;
    if (at.second === null && pop >= 2) at.second = min;
    if (at.fourth === null && pop >= 4) at.fourth = min;
    if (at.balloon === null && w.known.has('ballooning')) at.balloon = min;
    if (at.nav === null && w.known.has('navigation')) at.nav = min;
    if (at.rare === null && isl.some((i) => isRare(i) && i.explored)) at.rare = min;
    const tier = tierOf();
    if (tier !== null) for (let k = 1; k <= tier; k++) if (tierAt[k] === undefined) tierAt[k] = min;
    if (n % 3000 === 0) console.log(`${Math.round(min)}m populated ${pop} folk ${w.folk.length} revealed ${isl.filter((i) => i.revealed).length}`);
    if (n % 6000 === 0) {
      const home = w.islands.get('0,0');
      console.log(`rung ${Math.round(min)}m home rung ${home ? home.rung : '?'} tier ${tier === null ? '-' : tier}`);
    }
  }
  if (councilTier) console.log(`tier times (min): ${[1, 2, 3, 4, 5].map((k) => `T${k} ${tierAt[k] === undefined ? 'never' : tierAt[k].toFixed(1)}`).join(', ')}`);
  console.log(`${line(seedArg, at)}, settled events ${stat.settlers}`);
  console.log(`RESULT ${JSON.stringify({ at })}`);
  const miss = MILES.filter(([k, , t]) => at[k] === null || at[k] > t).map(([, nm]) => nm);
  console.log(miss.length ? `pace MISS: ${miss.join(', ')}` : 'pace ok');
  if (miss.length && process.env.STRICT) process.exit(1);
}
