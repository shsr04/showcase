import * as THREE from 'three';

// Note: Camera distance of the default view; decor sizes are authored for it.
export const DEFAULT_DISTANCE = 3.3;

const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const LANTERN_PALETTES = {
  port: { metal: '#3a2a17', rim: '#c99a4b', glass: '#ffc14d', core: '#fff7dc', glow: 0xffb347 },
  place: { metal: '#16343a', rim: '#7fb8b0', glass: '#8fd3c7', core: '#effffb', glow: 0x7fd6c8 },
};

function lanternTexture({ metal, rim, glass, core }) {
  return canvasTexture(64, 96, (ctx, w) => {
    const cx = w / 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Note: Hanging ring and cap.
    ctx.strokeStyle = rim; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, 10, 6, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.fillStyle = metal; ctx.strokeStyle = rim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - 8, 14); ctx.lineTo(cx + 8, 14); ctx.lineTo(cx + 18, 26); ctx.lineTo(cx - 18, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Note: Glass body with a hot flame core.
    const body = ctx.createRadialGradient(cx, 52, 2, cx, 52, 24);
    body.addColorStop(0, core); body.addColorStop(.45, glass); body.addColorStop(1, metal);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(cx - 15, 27); ctx.lineTo(cx + 15, 27); ctx.quadraticCurveTo(cx + 20, 52, cx + 15, 77); ctx.lineTo(cx - 15, 77); ctx.quadraticCurveTo(cx - 20, 52, cx - 15, 27); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, 28); ctx.lineTo(cx, 76); ctx.stroke();
    ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(cx, 56, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Note: Base plate.
    ctx.fillStyle = metal; ctx.strokeStyle = rim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - 19, 78); ctx.lineTo(cx + 19, 78); ctx.lineTo(cx + 14, 88); ctx.lineTo(cx - 14, 88); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

const glowTexture = () => canvasTexture(64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});

function flagTexture(kind) {
  return canvasTexture(96, 128, (ctx, w, h) => {
    const mirror = kind === 'return';
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    // Note: Mast with a gilt truck on top.
    ctx.strokeStyle = '#e8d9b8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(6, h - 2); ctx.stroke();
    ctx.fillStyle = '#e6b85c'; ctx.beginPath(); ctx.arc(6, 8, 5, 0, Math.PI * 2); ctx.fill();
    const top = 12, height = 48, width = 82;
    ctx.save();
    ctx.beginPath();
    if (kind === 'departure') { ctx.moveTo(8, top); ctx.lineTo(8 + width, top + 4); ctx.lineTo(8 + width - 18, top + height / 2); ctx.lineTo(8 + width, top + height - 4); ctx.lineTo(8, top + height); }
    else { ctx.rect(8, top, width - 14, height); }
    ctx.closePath(); ctx.clip();
    if (kind === 'departure') {
      ctx.fillStyle = '#e6b85c'; ctx.fillRect(8, top, width, height);
      ctx.fillStyle = '#0b3038'; ctx.fillRect(8, top + height * .38, width, height * .24);
    } else {
      // Note: Checkered signal flag marks the homecoming.
      const cell = (width - 14) / 4;
      for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) { ctx.fillStyle = (x + y) % 2 ? '#f4ead8' : '#b8322a'; ctx.fillRect(8 + x * cell, top + y * (height / 3), cell + .5, height / 3 + .5); }
    }
    ctx.restore();
  });
}

const noRaycast = () => {};

export function createDecor() {
  const glow = glowTexture();
  const lanterns = { port: lanternTexture(LANTERN_PALETTES.port), place: lanternTexture(LANTERN_PALETTES.place) };

  // Note: Lantern sprite anchored at its base so it stands on the place.
  const lantern = (routePoint) => {
    const palette = routePoint ? LANTERN_PALETTES.port : LANTERN_PALETTES.place;
    const height = routePoint ? .056 : .03;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: routePoint ? lanterns.port : lanterns.place, transparent: true, depthWrite: false }));
    sprite.center.set(.5, .02); sprite.scale.set(height * 2 / 3, height, 1); sprite.renderOrder = 3;
    const glowSize = height * (routePoint ? 2.2 : 1.6);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: palette.glow, transparent: true, opacity: routePoint ? .55 : .3, blending: THREE.AdditiveBlending, depthWrite: false }));
    // Attention: Halo must stay out of picking, otherwise it widens the click area.
    halo.raycast = noRaycast;
    halo.center.set(.5, .5 - (height * .45) / glowSize); halo.scale.set(glowSize, glowSize, 1); halo.renderOrder = 2;
    return { sprite, halo, baseGlow: halo.material.opacity };
  };

  const flag = (kind) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flagTexture(kind), transparent: true, depthWrite: false }));
    sprite.center.set(kind === 'return' ? .94 : .06, 0); sprite.scale.set(.06, .08, 1); sprite.renderOrder = 4;
    sprite.raycast = noRaycast;
    return sprite;
  };

  return { lantern, flag };
}

// Note: Dart-shaped arrowhead pointing along +Y in the XY plane.
const chevronGeometry = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, .5); shape.lineTo(.42, -.4); shape.lineTo(0, -.14); shape.lineTo(-.42, -.4); shape.closePath();
  return new THREE.ShapeGeometry(shape);
};

export function createChevrons(legs, { spacing = .1, minLeg = .045, radius = 1.0135, size = .034 } = {}) {
  const frames = [];
  legs.forEach((points) => {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    const total = lengths.at(-1);
    if (total < minLeg) return;
    const count = Math.max(1, Math.floor(total / spacing));
    for (let k = 0; k < count; k++) {
      const at = total * (k + .5) / count;
      let i = 1; while (i < points.length - 1 && lengths[i] < at) i++;
      const t = (at - lengths[i - 1]) / ((lengths[i] - lengths[i - 1]) || 1);
      const normal = points[i - 1].clone().lerp(points[i], t).normalize();
      const forward = points[i].clone().sub(points[i - 1]);
      forward.addScaledVector(normal, -forward.dot(normal)).normalize();
      frames.push({ position: normal.clone().multiplyScalar(radius), forward, normal, right: forward.clone().cross(normal) });
    }
  });
  const mesh = new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false }), frames.length);
  mesh.renderOrder = 1; mesh.raycast = noRaycast;
  const matrix = new THREE.Matrix4();
  let lastScale = 0;
  const setScale = (scale) => {
    if (Math.abs(scale - lastScale) < lastScale * .02) return;
    lastScale = scale;
    frames.forEach((frame, index) => {
      matrix.makeBasis(frame.right, frame.forward, frame.normal).scale(new THREE.Vector3(size * scale, size * scale, 1)).setPosition(frame.position);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  setScale(1);
  return { mesh, setScale, count: frames.length };
}

// Note: Keeps decor roughly constant on screen; grows slightly when zoomed in.
export const zoomScale = (cameraDistance) => Math.pow(Math.max(cameraDistance - 1, .02) / (DEFAULT_DISTANCE - 1), .85);

// Note: Drag speed proportional to the visible surface span so the globe follows the cursor.
export const rotateSpeedFor = (cameraDistance) => THREE.MathUtils.clamp(.12 * (cameraDistance - 1), .012, .45);
