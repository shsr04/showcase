// Note: standoffs and road events per act; each fires once per band and talks to the game through a small API (G).

import { TILE } from './config.js';
import { rng, seedFromString } from './rand.js';
import { roadX } from './worldgen.js';
import { CHECKPOINT_X } from './sites.js';
import { C } from './palette.js';
import {
  tollVoice, companyVoice, familyVoice, checkpointVoice, TRACE_NOTE, TRACE_NOTE_2, RESIDENTS_CALL, hunterDeadLine,
  companyVoice2, hunterCallVoice, coopAmbushVoice, weighVoice, standoffVoice, chaseStopVoice, bossVoice,
} from './story.js';
import { hunterStage, adjustStanding } from './survival.js';

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

export const CHECKPOINT_Y = CHECKPOINT_X * TILE;

// Note: the manned gate before the exit river: St. Jude at the Sabine, Permian at the Brazos.
export const gateY = (world) => (world.kind === 'band' && (world.act || 1) <= 2 ? CHECKPOINT_Y : null);

// Note: Acts 2-5; ids carry the act so a band's memory never leaks into the next.
const PLANS = {
  2: (r, at) => [
    { id: 'a2:call', type: 'hunterCall', ...at(2880 + r.int(-30, 30)) },
    { id: 'a2:company', type: 'company2', ...at(2300 + r.int(-40, 40)) },
    { id: 'a2:coop', type: 'coop', ...at(1500 + r.int(-30, 30)) },
    { id: 'a2:brigade', type: 'brigade', ...at(950 + r.int(-40, 40)) },
    { id: 'a2:weigh', type: 'weigh', ...at(CHECKPOINT_X) },
    { id: 'a2:trace', type: 'trace', dynamic: true, note: TRACE_NOTE_2, model: 'silverado02', minY: (CHECKPOINT_X + 400) * TILE },
  ],
  3: (r, at, world) => {
    const ped = world.rivers.find((rv) => rv.name === 'Pedernales');
    return [
      { id: 'a3:call', type: 'call', who: 'CB 19', text: RESIDENTS_CALL, flag: 'residentsCall', ...at(2820 + r.int(-30, 30)) },
      { id: 'a3:raiders', type: 'raiders', ...at(2500 + r.int(-40, 40)) },
      { id: 'a3:standoff', type: 'standoff', ...at(ped ? ped.x - ped.w - 14 : 1930) },
      { id: 'a3:brigade', type: 'brigade', ...at(1200 + r.int(-40, 40)) },
      { id: 'a3:company', type: 'company2', ...at(650 + r.int(-40, 40)) },
    ];
  },
  4: (r, at) => [
    { id: 'a4:company', type: 'company2', ...at(2700 + r.int(-40, 40)) },
    { id: 'a4:chase', type: 'chase', ...at(2000 + r.int(-40, 40)) },
    { id: 'a4:coop', type: 'coop', ...at(1450 + r.int(-30, 30)) },
    { id: 'a4:brigade', type: 'brigade', ...at(1150 + r.int(-40, 40)) },
    { id: 'a4:raiders', type: 'raiders', ...at(450 + r.int(-40, 40)) },
  ],
  5: (r, at) => [
    { id: 'a5:raiders', type: 'raiders', ...at(2000 + r.int(-40, 40)) },
    { id: 'a5:boss', type: 'boss', ...at(1450 + r.int(-30, 30)) },
    { id: 'a5:saints', type: 'brigade', war: true, ...at(1100 + r.int(-40, 40)) },
  ],
};

// Note: fixed slots along the corridor (band x, jittered per seed); the hunter's trace is placed when heat calls for it.
export function planEncounters(world) {
  if (world.kind === 'level') return world.encounters || [];
  const r = rng(seedFromString(`${world.seedStr}:enc`));
  const at = (bx) => ({ y: bx * TILE, x: roadX(world, bx) * TILE });
  if ((world.act || 1) > 1) return PLANS[world.act](r, at, world);
  return [
    { id: 'family', type: 'family', ...at(2680 + r.int(-40, 40)) },
    { id: 'toll', type: 'toll', ...at(1960 + r.int(-30, 30)) },
    { id: 'company', type: 'company', ...at(1620 + r.int(-30, 30)) },
    { id: 'raiders', type: 'raiders', ...at(1000 + r.int(-40, 40)) },
    { id: 'checkpoint', type: 'checkpoint', ...at(CHECKPOINT_X) },
    { id: 'trace', type: 'trace', dynamic: true },
  ];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Note: chasers come up from behind already at road speed, closing a little, since none could catch a moving car from a standstill.
function pace(en, P) {
  const v = P.speed + 25;
  en.car.vx = Math.cos(UP) * v;
  en.car.vy = Math.sin(UP) * v;
  return en;
}

// Note: a car runs a stop when it arrives hot, or pulls away after it had halted, since real cars cannot reach speed within a few car lengths.
function rushing(e, P) {
  if (P.speed < 20) e.halted = true;
  return P.speed > 125 || (e.halted && P.speed > 45);
}

const TYPES = {
  // Note: a drifter roadblock with jersey barriers; the shoulders stay open so it can be run.
  toll: {
    arm: (G, e, P) => P.y - e.y < 600 && P.y > e.y - 100,
    spawn(G, e) {
      e.barriers = [-30, -10, 10, 30].map((dx) => G.spawnBarrier(e.x + dx, e.y));
      e.bikes = [
        G.spawnEnemy('drifters', e.x + 74, e.y + 18, UP, { mode: 'park' }),
        G.spawnEnemy('drifters', e.x + 90, e.y - 12, UP + 0.4, { mode: 'park' }),
      ];
      e.man = G.spawnPerson({ id: `${e.id}:man`, look: 'drifters', faction: 'drifters', x: e.x + 52, y: e.y + 8, a: DOWN, armed: true, guard: true, encounter: true });
      e.light = G.addLight(e.x + 82, e.y + 4, 'fire', 70);
      e.stage = 'wait';
    },
    tick(G, e, P) {
      const d = dist(P, e.man.g);
      if (e.stage === 'wait' && d < 250 && P.y > e.y - 40) {
        e.stage = 'talk';
        G.startVoice(e.man.g, tollVoice(), { enc: e, faction: 'drifters', onPass: () => pass(G, e), onFight: () => fight(G, e) });
      }
      if (e.stage === 'talk' && rushing(e, P) && d < 150) {
        G.cancelVoice(e.man.g);
        G.say(e.man.g, 'Get him!', 'Toll man', 2, true);
        fight(G, e);
      }
      if (P.y < e.y - 520 || (e.stage === 'fight' && e.bikes.every((b) => b.dead || b.mode === 'leave') && e.man.g.state === 'down')) return true;
      if (e.stage === 'fight') {
        e.t = (e.t || 0) + G.dt;
        if (e.t > 30) for (const b of e.bikes) if (!b.dead) leave(b, DOWN);
      }
      return false;
    },
  },

  // Note: a white Tahoe pair from behind; they want the survey intact, so they talk first.
  company: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    skip: (G) => G.S.flags.companyMet || !G.copCar(),
    spawn(G, e, P) {
      e.cars = [
        pace(G.spawnEnemy('company', P.x - 24, P.y + 280, UP, { side: -1 }), P),
        pace(G.spawnEnemy('company', P.x + 24, P.y + 340, UP, { side: 1 }), P),
      ];
      e.stage = 'close';
      e.t = 0;
      G.radioCB('...two white Tahoes coming up 90 behind a black-and-white...');
    },
    tick: (G, e, P) => companyTick(G, e, P, companyVoice),
  },

  // Note: after Act 1 the Company wants the survey whatever the car; crews that were shot at come in hostile.
  company2: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    spawn(G, e, P) {
      const angry = !!G.S.flags.fought_company && (G.S.standing.company ?? 0) < 0;
      e.cars = [
        pace(G.spawnEnemy('company', P.x - 24, P.y + 280, UP, { side: -1, hostile: angry }), P),
        pace(G.spawnEnemy('company', P.x + 24, P.y + 340, UP, { side: 1, hostile: angry }), P),
      ];
      e.stage = angry ? 'fight' : 'close';
      e.t = 0;
      if (angry) G.fightStarted('company', false);
      G.radioCB(angry ? '...white Tahoes running hot behind somebody... strips in the bed...' : '...two Permian Tahoes, real polite... asking after somebody...');
    },
    tick: (G, e, P) => companyTick(G, e, P, companyVoice2),
  },

  // Note: the hunter finds the courier's channel; nothing happens but the voice.
  hunterCall: {
    arm: (G, e, P) => P.y < e.y && P.inCar && !G.voice && !!G.car(),
    skip: (G) => G.S.hunter !== 'hunting',
    spawn(G, e) {
      e.stage = 'talk';
      G.startVoice(G.car(), hunterCallVoice(G.hunter, G.copCar()), { onDone: () => { e.stage = 'done'; } });
    },
    tick: (G, e) => e.stage === 'done',
  },

  // Note: a broadcast that cuts in on every station.
  call: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    spawn(G, e) {
      G.radioLine(e.who, e.text);
      if (e.flag) G.S.flags[e.flag] = true;
    },
    tick: () => true,
  },

  // Note: hungry Co-op farmers with a caltrop belt; people the Co-op owes are waved through.
  coop: {
    arm: (G, e, P) => P.y - e.y < 650 && P.y > e.y - 100,
    spawn(G, e) {
      const S = G.S;
      e.friendly = (S.standing.coop ?? 0) >= 15 || !!(S.flags.gaveTown || S.flags.gaveSeminole);
      if (!e.friendly) for (const dx of [-48, -24, 0, 24, 48]) G.hazards.caltrops(e.x + dx, e.y, 3, Math.random, 9, { faction: 'coop', owner: e.id });
      e.men = [
        G.spawnPerson({ id: `${e.id}:m0`, look: 'coop', faction: 'coop', x: e.x + 58, y: e.y + 10, a: DOWN, armed: true, guard: true, encounter: true }),
        G.spawnPerson({ id: `${e.id}:m1`, look: 'coop', faction: 'coop', x: e.x - 58, y: e.y + 10, a: DOWN, armed: true, guard: true, encounter: true }),
      ];
      e.truck = G.spawnEnemy('coop', e.x + 90, e.y - 30, UP, { mode: 'park' });
      e.stage = 'wait';
      e.t = 0;
    },
    tick(G, e, P) {
      const lead = e.men[0].g;
      if (e.stage === 'wait' && dist(P, lead) < 260 && P.y > e.y - 20) {
        if (e.friendly) {
          e.stage = 'open';
          G.say(lead, 'That\'s the one. Let \'em by.', 'Co-op man', 3);
        } else {
          e.stage = 'talk';
          e.ctx = { enc: e, faction: 'coop', onPass: () => sweep(G, e), onFight: () => coopFight(G, e) };
          G.startVoice(lead, coopAmbushVoice(), e.ctx);
        }
      }
      if (e.stage === 'talk' && P.y < e.y - 10) {
        G.cancelVoice(lead);
        G.say(lead, 'Running the belt!', 'Co-op man', 2, true);
        coopFight(G, e);
      }
      if (e.stage === 'fight') {
        e.t += G.dt;
        if (e.t > 35 && !e.truck.dead) leave(e.truck, DOWN);
      }
      return P.y < e.y - 700;
    },
  },

  // Note: Saints' pickups with bottles, sent after anyone who bled the Brigade or got too loud.
  brigade: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    skip: (G, e) => {
      const f = G.S.flags;
      return e.war ? !f.brigadeWar : !(f.checkpointFight || f.brigadeWar || f.brigadeBlood || G.S.heat >= 45);
    },
    spawn(G, e, P) {
      e.cars = [
        pace(G.spawnEnemy('brigade', P.x - 26, P.y + 300, UP, { side: -1, hostile: true }), P),
        pace(G.spawnEnemy('brigade', P.x + 26, P.y + 360, UP, { side: 1, hostile: true }), P),
      ];
      e.t = 0;
      G.fightStarted('brigade', false);
      G.radioCB('...Saints\' trucks westbound, running hot... they\'re throwing fire...');
      G.say(e.cars[0].car, G.S.flags.brigadeWar ? 'That\'s the car!' : 'Pull it over!', 'Saint', 3, true);
    },
    tick(G, e, P) {
      e.t += G.dt;
      if (e.t > 38) for (const c of e.cars) if (!c.dead) leave(c, DOWN);
      return e.cars.every((c) => c.dead || c.gone || dist(P, c.car) > 700);
    },
  },

  // Note: Permian weighs every car before the Brazos; strips on the shoulders leave the barriers as the way through.
  weigh: {
    arm: (G, e, P) => P.y - e.y < 700 && P.y > e.y - 200,
    spawn(G, e) {
      e.barriers = [-44, -22, 0, 22, 44].map((dx) => G.spawnBarrier(e.x + dx, e.y, 2.6));
      for (const s of [-1, 1]) G.hazards.spikes(e.x + s * 84, e.y, UP, 52, { faction: 'company', owner: e.id });
      e.men = [
        G.spawnPerson({ id: `${e.id}:c0`, look: 'company', faction: 'company', x: e.x + 62, y: e.y + 12, a: DOWN, armed: true, guard: true, encounter: true }),
        G.spawnPerson({ id: `${e.id}:c1`, look: 'company', faction: 'company', x: e.x - 62, y: e.y + 12, a: DOWN, armed: true, guard: true, encounter: true }),
        G.spawnPerson({ id: `${e.id}:c2`, look: 'company', faction: 'company', x: e.x + 30, y: e.y - 26, a: DOWN, armed: true, guard: true, encounter: true }),
      ];
      e.truck = G.spawnEnemy('company', e.x + 96, e.y - 40, UP, { mode: 'park' });
      e.lights = [G.addLight(e.x + 70, e.y, 'lamp', 90), G.addLight(e.x - 70, e.y, 'lamp', 90)];
      e.stage = 'wait';
    },
    tick(G, e, P) {
      const lead = e.men[0].g;
      if (e.stage === 'wait' && dist(P, lead) < 250 && P.y > e.y - 20) {
        e.stage = 'talk';
        e.ctx = { enc: e, faction: 'company', onPass: () => {
          e.stage = 'open';
          for (const b of e.barriers) G.moveBarrier(b, b.x + (b.x < e.x ? -70 : 70), b.y);
        }, onFight: () => {
          if (e.stage === 'fight') return;
          e.stage = 'fight';
          adjustStanding(G.S, 'company', -15);
          G.S.flags.weighFight = true;
          G.fightStarted('company');
          for (const m of e.men) G.alertPerson(m);
          e.truck.mode = 'chase';
          e.truck.hostile = true;
        } };
        G.startVoice(lead, weighVoice(G.S, G.copCar()), e.ctx);
      }
      if (e.stage === 'talk' && (P.y < e.y - 10 || (rushing(e, P) && P.y - e.y < 140))) {
        G.cancelVoice(lead);
        G.say(lead, 'Stop that car!', 'Permian man', 2, true);
        e.ctx.onFight();
      }
      return P.y < e.y - 900;
    },
  },

  // Note: Act 3: the hunter parks across the road past the Pedernales and waits.
  standoff: {
    arm: (G, e, P) => P.y - e.y < 700 && P.y > e.y - 100,
    skip: (G) => G.S.hunter !== 'hunting' || !(G.S.heat >= 35 || G.copCar()),
    spawn(G, e) {
      e.hcar = G.spawnEnemy('hunter', e.x + 8, e.y, 0.2, { mode: 'park' });
      e.man = G.spawnPerson({ id: `${e.id}:hunter`, look: 'brigade', faction: 'brigade', x: e.x - 34, y: e.y + 18, a: DOWN, armed: true, guard: true, encounter: true });
      e.stage = 'wait';
      e.t = 0;
      G.radioCB('...black Tahoe parked across 290 past the Pedernales...');
    },
    tick(G, e, P) {
      const man = e.man.g;
      if (e.stage === 'wait' && dist(P, man) < 230) {
        e.stage = 'talk';
        e.ctx = { enc: e, faction: 'brigade', onPass: () => {
          e.stage = 'gone';
          leave(e.hcar, UP);
          G.removePerson(e.man);
        }, onFight: () => {
          if (e.stage === 'fight') return;
          e.stage = 'fight';
          e.t = 0;
          G.fightStarted('hunter');
          G.alertPerson(e.man);
          e.hcar.mode = 'chase';
          e.hcar.hostile = true;
        } };
        G.startVoice(man, standoffVoice(G.hunter), e.ctx);
      }
      if (e.stage === 'talk' && rushing(e, P) && dist(P, man) < 140) {
        G.cancelVoice(man);
        G.say(man, 'Hey. Hey!', G.hunter.first, 2, true);
        e.ctx.onFight();
      }
      if (e.stage === 'fight') {
        e.t += G.dt;
        // Note: his car or the man himself going down ends the hunt for good.
        if (e.hcar.downed || (man.state === 'down' && man.how !== 'knockout')) {
          hunterKilled(G);
          e.stage = 'over';
        } else if (e.t > 40) {
          leave(e.hcar, DOWN);
          e.stage = 'gone';
        }
      }
      return P.y < e.y - 900;
    },
  },

  // Note: Act 4: the hunter and two Saints' trucks run the courier down; stopping the car opens one last talk.
  chase: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    skip: (G) => G.S.hunter === 'dead' || G.S.hunter === 'bought' || (G.S.hunter === 'misled' && G.S.heat < 70),
    spawn(G, e, P) {
      e.hcar = pace(G.spawnEnemy('hunter', P.x, P.y + 280, UP, { hostile: true }), P);
      e.cars = [
        e.hcar,
        pace(G.spawnEnemy('brigade', P.x - 30, P.y + 360, UP, { side: -1, hostile: true, catchUp: 1.3 }), P),
        pace(G.spawnEnemy('brigade', P.x + 30, P.y + 400, UP, { side: 1, hostile: true, catchUp: 1.3 }), P),
      ];
      e.stage = 'fight';
      e.t = 0;
      e.still = 0;
      G.fightStarted('hunter', false);
      G.radioLine('CB 19', `${G.hunter.first} here. Pull over, cher.`);
    },
    tick(G, e, P) {
      e.t += G.dt;
      if (e.hcar.downed && e.stage !== 'over') {
        hunterKilled(G);
        e.stage = 'over';
        for (const c of e.cars) if (!c.dead) leave(c, DOWN);
      }
      const near = !e.hcar.dead && !e.hcar.gone && dist(P, e.hcar.car) < 220;
      e.still = e.stage === 'fight' && near && (P.speed < 12 || G.carDisabled()) ? e.still + G.dt : 0;
      if (e.still > 1.5 && !e.talked) {
        e.talked = true;
        e.stage = 'talk';
        for (const c of e.cars) {
          c.hostile = false;
          if (!c.dead) c.mode = 'park';
        }
        G.startVoice(e.hcar.car, chaseStopVoice(G.hunter), { enc: e, faction: 'brigade', onPass: () => {
          e.stage = 'gone';
          for (const c of e.cars) if (!c.dead) leave(c, DOWN);
        }, onFight: () => {
          e.stage = 'fight';
          for (const c of e.cars) {
            if (c.dead) continue;
            c.mode = 'chase';
            c.hostile = true;
          }
        } });
      }
      if (e.stage === 'fight' && e.t > 100) {
        e.stage = 'gone';
        for (const c of e.cars) if (!c.dead) leave(c, DOWN);
      }
      return e.stage !== 'talk' && e.cars.every((c) => c.dead || c.gone || dist(P, c.car) > 800);
    },
  },

  // Note: Act 5: the last stage of the hunt; he waits on foot behind strips across the whole road, two Saints at his side.
  boss: {
    arm: (G, e, P) => P.y - e.y < 700 && P.y > e.y - 100,
    skip: (G) => G.S.hunter === 'dead' || G.S.hunter === 'bought' || (G.S.hunter === 'misled' && G.S.heat < 70),
    spawn(G, e) {
      for (const dx of [-80, -27, 27, 80]) G.hazards.spikes(e.x + dx, e.y + 46, UP, 54, { faction: 'brigade', owner: e.id });
      e.hcar = G.spawnEnemy('hunter', e.x + 40, e.y - 34, 0.25, { mode: 'park' });
      e.man = G.spawnPerson({ id: `${e.id}:hunter`, look: 'brigade', faction: 'brigade', x: e.x - 12, y: e.y + 6, a: DOWN, armed: true, guard: true, encounter: true });
      Object.assign(e.man.g, { hp: 14, range: 200, fireRate: 0.5, reach: 200 });
      e.men = [-58, 58].map((dx, i) => G.spawnPerson({ id: `${e.id}:s${i}`, look: 'brigade', faction: 'brigade', x: e.x + dx, y: e.y - 8, a: DOWN, armed: true, guard: true, encounter: true }));
      e.lights = [G.addLight(e.x - 12, e.y - 20, 'lamp', 110)];
      e.stage = 'wait';
      e.molT = 2;
      G.radioLine('KJEF 1290', `Brother ${G.hunter.last} wants two men on the mesa road past Lovington. Bring water.`);
    },
    tick(G, e, P) {
      const man = e.man.g;
      const open = () => G.hazards.remove((h) => h.owner === e.id);
      if (e.stage === 'wait' && dist(P, man) < 240) {
        e.stage = 'talk';
        e.ctx = { enc: e, faction: 'brigade', onPass: () => {
          e.stage = 'gone';
          open();
          leave(e.hcar, UP);
          G.removePerson(e.man);
          for (const m of e.men) G.removePerson(m);
        }, onFight: () => {
          if (e.stage === 'fight') return;
          e.stage = 'fight';
          G.fightStarted('hunter');
          G.alertPerson(e.man);
          for (const m of e.men) G.alertPerson(m);
        } };
        G.startVoice(man, bossVoice(G.hunter), e.ctx);
      }
      if (e.stage === 'talk' && rushing(e, P) && dist(P, man) < 150) {
        G.cancelVoice(man);
        G.say(man, 'Hey!', G.hunter.first, 2, true);
        e.ctx.onFight();
      }
      if (e.stage === 'fight') {
        // Note: he throws fire where the courier is heading; on foot that means moving keeps you alive.
        e.molT -= G.dt;
        const d = dist(P, man);
        if (man.state !== 'down' && e.molT <= 0 && d > 50 && d < 210) {
          e.molT = 3.2 + Math.random() * 1.5;
          G.hazards.molotov(man.x, man.y, P.x + (P.vx || 0) * 0.8, P.y + (P.vy || 0) * 0.8, 0.9, { faction: 'brigade', owner: e.id });
        }
      }
      // Note: shot mid-talk or mid-fight, it ends the same way.
      if (man.state === 'down' && (e.stage === 'talk' || e.stage === 'fight')) {
        if (e.stage === 'talk') G.cancelVoice(man);
        hunterKilled(G);
        e.stage = 'over';
        open();
        for (const m of e.men) G.alertPerson(m);
        G.say(man, 'Ah. Ah, no.', G.hunter.first, 3, true);
      } else if (e.stage === 'talk' && man.state === 'alert') {
        G.cancelVoice(man);
        e.ctx.onFight();
      }
      return P.y < e.y - 900;
    },
  },

  // Note: a mother and child beside a dead car; water given here is remembered by the Co-op.
  family: {
    arm: (G, e, P) => P.y - e.y < 520 && P.y > e.y - 100,
    spawn(G, e) {
      e.wreck = G.spawnProp('wreck', e.x + 64, e.y - 6, UP + 0.2);
      e.mom = G.spawnPerson({ id: `${e.id}:mom`, look: 'coop', faction: 'coop', x: e.x + 46, y: e.y + 4, a: Math.PI });
      e.kid = G.spawnPerson({ id: `${e.id}:kid`, look: 'local', faction: 'coop', x: e.x + 49, y: e.y + 9, a: Math.PI, small: true });
      e.stage = 'wait';
    },
    tick(G, e, P) {
      const d = dist(P, e.mom.g);
      if (e.stage === 'wait' && d < 110 && P.speed < 60) {
        e.stage = 'talk';
        G.startVoice(e.mom.g, familyVoice(), { enc: e, faction: 'coop', onPass: () => {}, onFight: () => {}, onDone: () => { e.stage = 'done'; } });
      }
      if (e.stage === 'wait' && d < 200 && P.speed >= 60 && !e.waved) {
        e.waved = true;
        G.say(e.mom.g, 'Please! Stop!', 'Mother', 2.5);
      }
      return P.y < e.y - 700;
    },
  },

  // Note: drifter bikes run the courier down from behind; flooring it works.
  raiders: {
    arm: (G, e, P) => P.y < e.y && P.inCar,
    spawn(G, e, P) {
      e.bikes = [
        pace(G.spawnEnemy('drifters', P.x - 30, P.y + 260, UP, { side: -1, hostile: true }), P),
        pace(G.spawnEnemy('drifters', P.x + 30, P.y + 300, UP, { side: 1, hostile: true }), P),
      ];
      e.t = 0;
      G.fightStarted('drifters', false);
      G.say(e.bikes[0].car, G.copCar() ? 'Pull over, cop!' : 'Pull over!', 'Biker', 3, true);
    },
    tick(G, e, P) {
      e.t += G.dt;
      if (e.t > 32) for (const b of e.bikes) if (!b.dead) leave(b, DOWN);
      return e.bikes.every((b) => b.dead || b.gone || dist(P, b.car) > 700);
    },
  },

  // Note: St. Jude holds the road before the Sabine bridge: pay, talk, or run the barriers.
  checkpoint: {
    arm: (G, e, P) => P.y - e.y < 700 && P.y > e.y - 200,
    spawn(G, e) {
      e.barriers = [-44, -22, 0, 22, 44].map((dx) => G.spawnBarrier(e.x + dx, e.y, 2.6));
      e.saints = [
        G.spawnPerson({ id: `${e.id}:s0`, look: 'brigade', faction: 'brigade', x: e.x + 62, y: e.y + 12, a: DOWN, armed: true, guard: true, encounter: true }),
        G.spawnPerson({ id: `${e.id}:s1`, look: 'brigade', faction: 'brigade', x: e.x - 62, y: e.y + 12, a: DOWN, armed: true, guard: true, encounter: true }),
        G.spawnPerson({ id: `${e.id}:s2`, look: 'brigade', faction: 'brigade', x: e.x + 30, y: e.y - 26, a: DOWN, armed: true, guard: true, encounter: true }),
      ];
      e.truck = G.spawnEnemy('brigade', e.x + 92, e.y - 40, UP, { mode: 'park' });
      e.lights = [G.addLight(e.x + 70, e.y, 'lamp', 90), G.addLight(e.x - 70, e.y, 'lamp', 90)];
      e.stage = 'wait';
    },
    tick(G, e, P) {
      const lead = e.saints[0].g;
      if (e.stage === 'wait' && dist(P, lead) < 250 && P.y > e.y - 20) {
        e.stage = 'talk';
        e.ctx = { enc: e, faction: 'brigade', onPass: () => {
          e.stage = 'open';
          for (const b of e.barriers) G.moveBarrier(b, b.x + (b.x < e.x ? -70 : 70), b.y);
        }, onFight: () => {
          e.stage = 'fight';
          adjustStanding(G.S, 'brigade', -20);
          G.S.flags.checkpointFight = true;
          G.fightStarted('brigade');
          for (const s of e.saints) G.alertPerson(s);
          e.truck.mode = 'chase';
          e.truck.hostile = true;
        } };
        G.startVoice(lead, checkpointVoice(G.S, G.copCar()), e.ctx);
      }
      // Note: speeding at the line or slipping past it without paying both start the fight.
      if (e.stage === 'talk' && (P.y < e.y - 10 || (rushing(e, P) && P.y - e.y < 140))) {
        G.cancelVoice(lead);
        G.say(lead, 'Stop him!', 'Saint', 2, true);
        e.ctx.onFight();
      }
      if (P.y < e.y - 40 && G.S.beat !== 'cross') G.setBeat('cross');
      return false;
    },
  },

  // Note: the tracker is never seen; once heat reaches the sighting stage his work turns up on the shoulder ahead.
  trace: {
    arm: (G, e, P) => G.world.kind === 'band' && G.S.flags.hunterHired && P.inCar && hunterStage(G.S.heat) !== 'none'
      && hunterStage(G.S.heat) !== 'rumor' && P.y > (e.minY ?? CHECKPOINT_Y + 1600) && G.S.hunter === 'hunting',
    spawn(G, e, P) {
      const y = P.y - 460;
      const x = roadX(G.world, y / TILE) * TILE + 70;
      e.x = x;
      e.y = y;
      const parts = { engine: null, transmission: null, tires: null, suspension: null, radiator: null, fueltank: null, battery: null, armor: null };
      const w = {
        id: `${e.id}:camry`, kind: 'wreck', model: e.model || 'camry04', x, y, a: UP + 0.7, fuel: 0, water: 0, ammo: 4, cans: 0, parts,
        paint: { body: C.SHADOW, trim: C.VOID }, note: e.note || TRACE_NOTE,
      };
      G.S.dyn.push(w);
      G.addWreck(w);
      e.light = G.addLight(x, y, 'fire', 60);
      e.stage = 'wait';
    },
    tick(G, e, P) {
      if (e.stage === 'wait' && dist(P, e) < 160) {
        e.stage = 'seen';
        G.S.flags.hunterTrace = true;
      }
      return P.y < e.y - 400;
    },
  },
};

// Note: shared by the Act 1 Tahoes and the later ones; voice() builds the line when they pull alongside.
function companyTick(G, e, P, voice) {
  const lead = e.cars.find((c) => !c.dead) || e.cars[0];
  const d = dist(P, lead.car);
  e.t += G.dt;
  if (e.stage === 'close' && d < 130) {
    e.stage = 'talk';
    G.startVoice(lead.car, voice(G.S.act), { enc: e, faction: 'company', onPass: () => {
      e.stage = 'gone';
      for (const c of e.cars) leave(c, UP);
    }, onFight: () => {
      e.stage = 'fight';
      e.t = 0;
      G.fightStarted('company');
      for (const c of e.cars) c.hostile = true;
    } });
  }
  if (e.stage === 'close' && e.t > 40) e.stage = 'gone';
  if (e.stage === 'fight' && e.t > 45) for (const c of e.cars) if (!c.dead) leave(c, DOWN);
  if (G.carDisabled() && e.stage === 'fight') {
    G.say(lead.car, 'Car\'s done. Leave it.', 'Permian man', 3, true);
    for (const c of e.cars) leave(c, UP);
    e.stage = 'gone';
  }
  return e.cars.every((c) => c.dead || c.gone || dist(P, c.car) > 700);
}

function sweep(G, e) {
  e.stage = 'open';
  G.hazards.remove((h) => h.owner === e.id);
  adjustStanding(G.S, 'coop', 1);
}

function coopFight(G, e) {
  if (e.stage === 'fight') return;
  e.stage = 'fight';
  e.t = 0;
  G.fightStarted('coop');
  for (const m of e.men) G.alertPerson(m);
  e.truck.mode = 'chase';
  e.truck.hostile = true;
}

// Note: killing the Brigade's hunter is war with the Brigade for the rest of the road.
function hunterKilled(G) {
  const S = G.S;
  if (S.hunter === 'dead') return;
  S.hunter = 'dead';
  S.flags.brigadeWar = true;
  adjustStanding(S, 'brigade', -100);
  G.radioLine('KJEF 1290', hunterDeadLine(G.hunter));
}

function leave(en, a) {
  en.mode = 'leave';
  en.hostile = false;
  en.leaveA = a;
}

function pass(G, e) {
  e.stage = 'open';
  for (const b of e.barriers) G.moveBarrier(b, b.x + (b.x < e.x ? -60 : 60), b.y);
  adjustStanding(G.S, 'drifters', 2);
}

function fight(G, e) {
  if (e.stage === 'fight') return;
  e.stage = 'fight';
  e.t = 0;
  G.fightStarted('drifters');
  G.alertPerson(e.man);
  for (const b of e.bikes) {
    b.mode = 'chase';
    b.hostile = true;
  }
}

export class Director {
  constructor(G, list) {
    this.G = G;
    this.list = list;
    this.live = new Map();
  }

  hostileActive() {
    for (const e of this.live.values()) if (e.stage === 'fight') return true;
    return false;
  }

  update(P) {
    const G = this.G;
    for (const e of this.list) {
      const st = G.S.enc[e.id];
      if (st === 'done') continue;
      const T = TYPES[e.type];
      if (!this.live.has(e.id)) {
        if (!T.arm(G, e, P)) continue;
        if (T.skip && T.skip(G, e)) {
          G.S.enc[e.id] = 'done';
          continue;
        }
        const live = { ...e };
        // Note: things spawned while an encounter runs carry its id, so they can be cleared when it ends.
        G.curEnc = e.id;
        T.spawn(G, live, P);
        G.curEnc = null;
        this.live.set(e.id, live);
        continue;
      }
      const live = this.live.get(e.id);
      G.curEnc = e.id;
      const done = T.tick(G, live, P);
      G.curEnc = null;
      if (done) {
        G.S.enc[e.id] = 'done';
        this.live.delete(e.id);
        G.encounterDone(live);
      }
    }
  }
}
