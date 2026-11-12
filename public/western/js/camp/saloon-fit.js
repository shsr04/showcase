// Note: pure layout helpers for the saloon view: where the prompt goes and what scale the canvas gets; no DOM, so Node tests them.

// Note: device pixels per canvas pixel is scale * cs; a whole number keeps every art pixel the same size on screen.
// Note: the integer scale is taken when it loses at most `loss` of the largest scale that fits, otherwise the largest scale is used.
export function pixelFit({ w, h, tile, fit, cs = 1, loss = 0.15 }) {
  const W = w * tile;
  const H = h * tile;
  const most = Math.max(0.1, Math.min(fit.w / W, fit.h / H));
  const device = most * cs;
  const whole = Math.floor(device + 1e-9);
  if (whole >= 1 && whole / device >= 1 - loss) return { scale: whole / cs, device: whole, integer: true };
  return { scale: most, device, integer: Number.isInteger(Math.round(device * 1e6) / 1e6) };
}

const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// Note: the prompt's top-left corner in canvas pixels; it sits above the target, else below, else beside it, and never over the sheriff or outside the canvas.
// Note: room {w, h}, cell is pixels per tile, box {w, h} is the prompt's size, target is {rect} or {at}, sheriff {x, y} is in tiles, and keep lists more rectangles in pixels to leave clear.
export function promptSpot({ room, cell, box, target, sheriff, keep = [], gap = 8, pad = 4, body = 0.62 }) {
  const W = room.w * cell;
  const H = room.h * cell;
  const t = target.rect
    ? { x0: target.rect.x0 * cell, y0: target.rect.y0 * cell, x1: target.rect.x1 * cell, y1: target.rect.y1 * cell }
    : { x0: (target.at.x - 0.3) * cell, y0: (target.at.y - 0.6) * cell, x1: (target.at.x + 0.3) * cell, y1: (target.at.y + 0.6) * cell };
  const me = sheriff ? { x0: (sheriff.x - body) * cell, y0: (sheriff.y - body) * cell, x1: (sheriff.x + body) * cell, y1: (sheriff.y + body) * cell } : null;
  const clampX = (x) => Math.max(pad, Math.min(W - box.w - pad, x));
  const clampY = (y) => Math.max(pad, Math.min(H - box.h - pad, y));
  const cx = (t.x0 + t.x1) / 2;
  const cy = (t.y0 + t.y1) / 2;
  const sides = [
    { side: 'n', x: cx - box.w / 2, y: t.y0 - gap - box.h },
    { side: 's', x: cx - box.w / 2, y: t.y1 + gap },
    { side: 'e', x: t.x1 + gap, y: cy - box.h / 2 },
    { side: 'w', x: t.x0 - gap - box.w, y: cy - box.h / 2 },
  ];
  const score = (c) => {
    const x = c.side === 'n' || c.side === 's' ? clampX(c.x) : c.x;
    const y = c.side === 'e' || c.side === 'w' ? clampY(c.y) : c.y;
    const r = { x0: x, y0: y, x1: x + box.w, y1: y + box.h };
    const outside = Math.max(0, pad - r.x0) + Math.max(0, pad - r.y0) + Math.max(0, r.x1 - (W - pad)) + Math.max(0, r.y1 - (H - pad));
    const hidden = (me ? overlap(r, me) : 0) + keep.reduce((n, k) => n + overlap(r, k), 0);
    return { side: c.side, x, y, bad: outside * 1000 + hidden };
  };
  const all = sides.map(score);
  const clean = all.find((c) => c.bad === 0);
  const best = clean || all.reduce((a, b) => (b.bad < a.bad ? b : a));
  return { left: Math.round(clampX(best.x)), top: Math.round(clampY(best.y)), side: best.side, clean: !!clean };
}
