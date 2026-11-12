// Note: the saloon's light as canvas layers: a cool multiplied shade with warm pools punched into it, additive glows and brass lamp fixtures; all lamps are oil, candle or stove fire.

// Note: shade is the multiplied ambient, open is how fully a pool clears it, and glow scales the warm bloom.
export const MOODS = {
  day: { shade: 'rgb(206, 196, 188)', edge: 'rgb(150, 140, 136)', open: 0.55, glow: 0.45, window: 0.2 },
  dusk: { shade: 'rgb(138, 122, 166)', edge: 'rgb(118, 104, 138)', open: 1, glow: 1, window: 0.16 },
  night: { shade: 'rgb(86, 84, 134)', edge: 'rgb(74, 72, 112)', open: 1, glow: 1.25, window: 0.05 },
};

// Note: per kind: pool scale, how much of the shade the pool clears, the glow colour and strength.
const KIND = {
  lamp: { scale: 1, clear: 0.92, rgb: '255, 178, 86', glow: 0.34 },
  sconce: { scale: 0.95, clear: 0.8, rgb: '255, 184, 96', glow: 0.3 },
  lantern: { scale: 0.9, clear: 0.7, rgb: '255, 190, 100', glow: 0.28 },
  stove: { scale: 1, clear: 0.7, rgb: '255, 112, 42', glow: 0.4 },
  door: { scale: 1, clear: 0.55, rgb: '255, 236, 196', glow: 0.22 },
  window: { scale: 0.7, clear: 0.5, rgb: '206, 222, 255', glow: 0 },
};

const make = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

// Note: a smooth fall-off: most of the light stays near the lamp and fades without a visible ring.
function fade(g, x, y, r, rgb, a) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [t, k] of [[0, 1], [0.25, 0.86], [0.5, 0.55], [0.75, 0.22], [1, 0]]) grad.addColorStop(t, `rgba(${rgb}, ${(a * k).toFixed(3)})`);
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Note: where a window's light lands: a little way into the room, not on the window itself.
function windowSpot(l) {
  const lean = l.side === 'w' ? [1.7, 0] : l.side === 'e' ? [-1.7, 0] : [0.6, -1.7];
  return { x: l.x + lean[0], y: l.y + lean[1] };
}

// Note: baked once; draw it over the people with drawDusk, so a frame costs one draw.
export function bakeDusk(room, tile, mood = 'dusk') {
  const m = MOODS[mood] || MOODS.dusk;
  const c = make(room.w * tile, room.h * tile);
  const g = c.getContext('2d');
  g.fillStyle = m.shade;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out';
  for (const l of room.lights) {
    const k = KIND[l.kind] || KIND.lamp;
    const at = l.kind === 'window' ? windowSpot(l) : l;
    fade(g, at.x * tile, at.y * tile, l.r * tile * k.scale, '0, 0, 0', Math.min(1, k.clear * m.open));
  }
  g.globalCompositeOperation = 'multiply';
  const v = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.4, c.width / 2, c.height / 2, c.width * 0.62);
  v.addColorStop(0, 'rgb(255, 255, 255)');
  v.addColorStop(1, m.edge);
  g.fillStyle = v;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// Note: the shade multiplies the floor and the people, so colours keep their hue and only lose light.
export function drawDusk(g, dusk) {
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.drawImage(dusk, 0, 0);
  g.restore();
}

const glows = new Map();
function glowSprite(radius, rgb, tile) {
  const id = `${rgb}:${radius}:${tile}`;
  if (!glows.has(id)) {
    const px = Math.round(radius * tile);
    const c = make(px * 2, px * 2);
    fade(c.getContext('2d'), px, px, px, rgb, 1);
    glows.set(id, c);
  }
  return glows.get(id);
}

// Note: warm blooms drawn additively over the lamps; each breathes a little unless motion is reduced.
export function drawGlows(g, room, tile, now, calm = false, mood = 'dusk') {
  const m = MOODS[mood] || MOODS.dusk;
  g.save();
  g.globalCompositeOperation = 'screen';
  room.lights.forEach((l, i) => {
    const k = KIND[l.kind] || KIND.lamp;
    const at = l.kind === 'window' ? windowSpot(l) : l;
    const a = l.kind === 'window' ? m.window : k.glow * m.glow;
    if (a <= 0) return;
    const sprite = glowSprite(l.r * k.scale, k.rgb, tile);
    g.globalAlpha = Math.min(1, a * (calm || l.kind === 'window' ? 1 : 1 + Math.sin(now * (3 + (i % 3)) + i * 1.7) * 0.08));
    g.drawImage(sprite, at.x * tile - sprite.width / 2, at.y * tile - sprite.height / 2);
  });
  g.restore();
}

// Note: a brass lamp shade seen from above: a domed reflector with a dark rim and a bright finial, drawn after the people because it hangs over them.
function lamp(g, x, y, u, hot) {
  g.fillStyle = 'rgba(0, 0, 0, 0.2)';
  g.beginPath();
  g.ellipse(x + 0.6 * u, y + 0.9 * u, 2.6 * u, 2.4 * u, 0, 0, Math.PI * 2);
  g.fill();
  const dome = g.createRadialGradient(x - 0.8 * u, y - 0.8 * u, 0.1 * u, x, y, 2.3 * u);
  dome.addColorStop(0, '#f6e29a');
  dome.addColorStop(0.45, '#c99a3a');
  dome.addColorStop(1, '#5e4012');
  g.fillStyle = dome;
  g.beginPath();
  g.arc(x, y, 2.3 * u, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2c1e08';
  g.lineWidth = 0.55 * u;
  g.stroke();
  g.fillStyle = `rgba(255, 246, 210, ${hot})`;
  g.beginPath();
  g.arc(x - 0.2 * u, y - 0.2 * u, 0.7 * u, 0, Math.PI * 2);
  g.fill();
}

// Note: draws a lamp for every light marked hang; the table lamps, the bar lamps and the billiard lamp.
export function drawFixtures(g, room, tile, now, calm = false) {
  const u = tile / 16;
  room.lights.forEach((l, i) => {
    if (!l.hang) return;
    lamp(g, l.x * tile, (l.y - 0.2) * tile, u, 0.85 + (calm ? 0 : Math.sin(now * 4 + i * 2.1) * 0.1));
  });
}
