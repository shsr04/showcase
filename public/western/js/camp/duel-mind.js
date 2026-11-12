// Note: what a duelist intends and shows; pure, with its own random stream so a bluff never moves a bullet.
import { rng, clamp, seedFromString } from '../rand.js';

// Note: all times are seconds; wait is the draw time if nothing provokes it, tell the chance the hand betrays it, lead the warning before the draw, and bluff and shift the mean gap between false alarms.
// Note: when both sides are driven, aim is the band of heights shot at, mercy the chance of holding fire on a beaten man, quit the per-second chance of giving up once beaten, and patience the seconds a cocked hand waits for the rings to line up before it fires anyway.
export const TEMPER = {
  proud: { wait: [3, 11], tell: 0.85, lead: [0.45, 1], bluff: 6, shift: 12, calm: 0, aim: [1.1, 1.4], mercy: 0.35, quit: 0.2, patience: 0.6 },
  volatile: { wait: [1.2, 7], tell: 0.6, lead: [0.3, 0.8], bluff: 8, shift: 11, calm: -0.2, aim: [1, 1.45], mercy: 0.15, quit: 0.3, patience: 0.3 },
  cautious: { wait: [5, 16], tell: 0.7, lead: [0.5, 1], bluff: 10, shift: 6, calm: 0.2, aim: [0.45, 1.45], mercy: 0.7, quit: 0.9, patience: 1 },
};

// Note: what a memory of the crew does to the opening stance: how long the gunslinger waits, how often the hand gives him away, and how ready he is to stop.
export const STANCE = {
  neutral: { wait: 1, tell: 1, stop: 0 },
  grudge: { wait: 0.55, tell: 0.7, stop: -0.2 },
  confident: { wait: 0.8, tell: 1, stop: -0.1 },
  wary: { wait: 1.3, tell: 1, stop: 0.1 },
  friendly: { wait: 1.6, tell: 1.1, stop: 0.2 },
};

export const temperOf = (personality) => TEMPER[personality] || TEMPER.proud;
export const stanceOf = (stance) => STANCE[stance] || STANCE.neutral;

// Note: a cue is a hand drifting to the holster (a tell or a bluff) or an idle shift of weight and hat (innocent); only the intent behind it differs.
export class Mind {
  constructor(tag, personality, stance = 'neutral') {
    const t = temperOf(personality);
    const s = stanceOf(stance);
    this.rand = rng(seedFromString(tag));
    this.personality = personality;
    this.stance = stance;
    this.temper = t;
    this.shape = s;
    this.drawAt = this.rand.range(t.wait[0], t.wait[1]) * s.wait;
    this.lead = this.rand.chance(clamp(t.tell * s.tell, 0, 0.95)) ? this.rand.range(t.lead[0], t.lead[1]) : null;
    this.fid = null;
    this.nextFid = 0.6 + this.gap();
    this.provoked = false;
    this.spare = undefined;
  }

  // Note: the mean gap between all false alarms, exponentially spread.
  gap() {
    const rate = 1 / this.temper.bluff + 1 / this.temper.shift;
    return -Math.log(1 - this.rand.next()) / rate;
  }

  // Note: how fast this one answers the other's draw.
  reflex() {
    const t = this.personality === 'cautious' ? this.rand.range(0.5, 1.8) : this.rand.range(0.2, 0.8);
    return t * Math.sqrt(this.shape.wait);
  }

  // Note: a draw pulled forward by something the other did; a reflex carries no warning.
  react(time, delay) {
    if (time + delay >= this.drawAt) return false;
    this.drawAt = time + delay;
    this.lead = null;
    return true;
  }

  // Note: decided once, when the other man is first beaten: hold fire for a few seconds, or not.
  mercy(time) {
    if (this.spare === undefined) this.spare = this.rand.chance(clamp(this.temper.mercy + this.shape.stop, 0, 0.95)) ? time + 3 : null;
    return this.spare !== null && time < this.spare;
  }

  // Note: being stared down once: the proud and the hot-headed may draw early, the cautious flinch and wait longer.
  stared(time) {
    if (this.provoked) return;
    this.provoked = true;
    if (this.personality === 'cautious') {
      this.drawAt += this.rand.range(1.5, 3.5);
      this.fid = { kind: 'shift', until: time + 0.7, tell: false };
    } else if (this.rand.chance(0.6)) this.react(time, this.rand.range(0.4, 1.3));
  }

  // Note: the cue shown at this instant, or null; call once per tick while the revolver is still holstered.
  step(time) {
    if (this.lead !== null && this.drawAt !== Infinity && time >= this.drawAt - this.lead) return { kind: 'hand', tell: true };
    if (this.fid && time < this.fid.until) return this.fid;
    this.fid = null;
    if (time < this.nextFid) return null;
    const share = (1 / this.temper.shift) / (1 / this.temper.bluff + 1 / this.temper.shift);
    const len = this.rand.range(0.35, 0.9);
    this.fid = { kind: this.rand.chance(share) ? 'shift' : 'hand', until: time + len, tell: false };
    this.nextFid = time + len + this.gap();
    return this.fid;
  }
}
