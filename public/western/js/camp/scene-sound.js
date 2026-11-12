// Note: translates scene state and events into one-shot cues; the caller owns playback and mute.
const BRAWL_CUES = {
  hit: 'punch', miss: 'whiff', grab: 'grapple', free: 'grapple',
  draw: 'gun_handling', holster: 'gun_handling', reload: 'gun_handling',
  click: 'gun_handling', shot: 'revolver', down: 'hurt',
};

export function brawlSound(event, play) {
  const cue = BRAWL_CUES[event.type];
  if (cue) play(cue);
  if (event.type === 'shot' && event.hit) play('punch', { level: 0.5 });
}

export function duelSounds(sim, play) {
  let shots = new Set(sim.shots.map((e) => `${e.time}:${e.who}`));
  let previous = snapshot();
  let clicks = sim.emptyClicks;
  let cocking = sim.cockUntil !== null;
  function snapshot() {
    return Object.fromEntries(['player', 'opponent'].map((side) => [side, {
      drawn: sim.draws[side] !== null, reload: !!sim.reload[side],
      held: sim.weaponHeld[side], pickup: sim.pickup[side] !== null,
      status: sim[side].status,
      // Note: a death is a dead status or a fatal wound of this exchange, the same rule the closing beat uses.
      dead: sim[side].status === 'dead' || sim[side].wounds.some((w) => w.fatal && !w.old),
    }]));
  }
  return {
    update(silent = false) {
      const now = snapshot();
      const nextShots = new Set();
      for (const e of sim.shots) {
        const key = `${e.time}:${e.who}`;
        nextShots.add(key);
        if (!silent && !shots.has(key)) {
          play('revolver');
          if (e.hit) play('punch', { level: 0.5 });
        }
      }
      if (!silent && sim.emptyClicks > clicks) play('gun_handling');
      clicks = sim.emptyClicks;
      // Note: the hammer is drawn back the moment a cock starts, so the cock is heard on its rising edge.
      const cockingNow = sim.cockUntil !== null;
      if (!silent && cockingNow && !cocking) play('gun_handling');
      cocking = cockingNow;
      if (!silent) for (const side of ['player', 'opponent']) {
        const a = previous[side], b = now[side];
        if ((!a.drawn && b.drawn) || (!a.reload && b.reload) || (a.pickup && !b.pickup && b.held)) play('gun_handling');
        if (a.held && !b.held) play('gun_handling', { level: 0.7 });
        // Note: the fall is the moment: a man who goes down plays the stinger if he is killed and the thud if not; a fatal wound on a man still standing plays nothing.
        if (a.status === 'ok' && b.status !== 'ok') play(b.dead ? 'sting' : 'hurt');
      }
      shots = nextShots;
      previous = now;
    },
  };
}
