import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VOYAGE_POINTS, VOYAGE_ROUTE } from './voyage-data.js';
import { choosePreciseIntersection } from './picking.js';
import { isGlobeFacing } from './label-visibility.js';
import { createDecor, createChevrons, zoomScale, rotateSpeedFor } from './voyage-decor.js';

const stage = document.querySelector('#stage');
const card = document.querySelector('#card');
const fallback = document.querySelector('#fallback');
const labels = document.createElement('div');
labels.className = 'labels';
labels.setAttribute('aria-hidden', 'true');
document.body.append(labels);
const labelNodes = new Map();
const showFallback = () => { fallback.hidden = false; };
let selectPoint = (point) => selectCard(point);
let markerNodes = [];
let controls = null;

function selectCard(point, markerNodes = []) {
  card.hidden = false;
  card.replaceChildren();
  const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${point.category} · Chapter ${point.chapter}`;
  const title = document.createElement('h2'); title.textContent = point.name;
  const body = document.createElement('p'); body.innerHTML = `<strong>${point.dateLabel}</strong> · ${point.datePrecision} date<br>${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°<br>${point.sourceNote}`;
  card.append(meta, title, body);
  markerNodes.forEach((marker) => marker.userData.selected = marker.userData.point === point);
  document.querySelectorAll('.place-label').forEach((node) => node.classList.toggle('selected', node.dataset.name === point.name));
}
document.querySelector('#reset').addEventListener('click', () => { controls?.reset(); card.hidden = true; markerNodes.forEach((marker) => { marker.userData.selected = false; }); document.querySelectorAll('.place-label.selected').forEach((node) => node.classList.remove('selected')); });

if (!window.WebGLRenderingContext) showFallback();
else {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 100);
  camera.position.set(0, .2, 3.3);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { showFallback(); }
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; stage.append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enablePan = false; controls.enableDamping = true; controls.zoomSpeed = .68; controls.minDistance = 1.12; controls.maxDistance = 5; controls.dampingFactor = .08; controls.rotateSpeed = rotateSpeedFor(camera.position.length());
    scene.add(new THREE.AmbientLight(0x9ec2cf, 1.3)); const sun = new THREE.DirectionalLight(0xffe7bd, 2.4); sun.position.set(3, 2, 4); scene.add(sun);
    const globe = new THREE.Group(); scene.add(globe);
    const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshPhongMaterial({ color: 0x9bb8bd, shininess: 8 })); globe.add(globeMesh);
    const onError = () => { globeMesh.material.color.set(0x1b5360); };
    const texture = new THREE.TextureLoader().load(new URL('./earth.jpg', import.meta.url).href, (loaded) => { loaded.colorSpace = THREE.SRGBColorSpace; globeMesh.material.map = loaded; globeMesh.material.needsUpdate = true; }, undefined, onError);
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 48), new THREE.MeshBasicMaterial({ color: 0x65c8de, transparent: true, opacity: .1, side: THREE.BackSide })));
    const starGeo = new THREE.BufferGeometry(); const stars = []; for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(8); stars.push(v.x, v.y, v.z); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)); scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xb5c8c8, size: .025, transparent: true, opacity: .65 })));
    const toVec = (lat, lon, radius = 1.012) => { const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon); return new THREE.Vector3(radius * Math.cos(p) * Math.cos(l), radius * Math.sin(p), -radius * Math.cos(p) * Math.sin(l)); };
    const route = new THREE.Group(); globe.add(route);
    const arc = (a, b) => { const start = toVec(a.lat, a.lon, 1.01).normalize(), end = toVec(b.lat, b.lon, 1.01).normalize(); const angle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1)); const points = []; const count = Math.max(12, Math.ceil(angle * 28)); for (let step = 0; step <= count; step++) { const t = step / count, sin = Math.sin(angle) || 1; points.push(new THREE.Vector3().addScaledVector(start, Math.sin((1 - t) * angle) / sin).addScaledVector(end, Math.sin(t * angle) / sin).normalize().multiplyScalar(1.012)); } return points; };
    const legs = []; for (let i = 1; i < VOYAGE_ROUTE.length; i++) { const points = arc(VOYAGE_ROUTE[i - 1], VOYAGE_ROUTE[i]); legs.push(points); route.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xf2bb5a, transparent: true, opacity: .72 }))); }
    const chevrons = createChevrons(legs); route.add(chevrons.mesh);
    const decor = createDecor(); const flags = [[VOYAGE_ROUTE[0], 'departure'], [VOYAGE_ROUTE.at(-1), 'return']].map(([point, kind]) => { const node = decor.flag(kind); node.position.copy(toVec(point.lat, point.lon, 1.008)); globe.add(node); return node; });
    const hit = new THREE.Group(); globe.add(hit); const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    VOYAGE_POINTS.forEach((point, index) => { const { sprite: visual, halo, baseGlow } = decor.lantern(point.routePoint); const hitRadius = point.routePoint ? .045 : .035; const target = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })); target.position.copy(toVec(point.lat, point.lon, 1.008)); visual.position.set(0, 0, 0); target.add(halo, visual); target.userData = { point, index, visual, halo, baseGlow, phase: index * 1.7, pickRadius: hitRadius, selected: false }; hit.add(target); markerNodes.push(target); if (point.routePoint) { const label = document.createElement('span'); label.className = 'place-label'; label.dataset.name = point.name; label.textContent = point.name; labels.append(label); labelNodes.set(point, label); } });
    selectPoint = (point) => selectCard(point, markerNodes);
    const pick = (event) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; ray.setFromCamera(pointer, camera); const found = choosePreciseIntersection(ray.intersectObjects(markerNodes, true)); if (found) selectPoint((found.object.userData.point ?? found.object.parent.userData.point)); };
    renderer.domElement.addEventListener('pointerup', pick); renderer.domElement.addEventListener('keydown', (event) => { if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return; event.preventDefault(); const current = markerNodes.findIndex((marker) => marker.userData.selected); const next = (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + markerNodes.length) % markerNodes.length; selectPoint(markerNodes[next].userData.point); }); renderer.domElement.tabIndex = 0;
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    const tick = (time = 0) => { const distance = camera.position.length(), decorScale = zoomScale(distance); controls.rotateSpeed = rotateSpeedFor(distance); controls.update(); chevrons.setScale(decorScale); flags.forEach((flag) => flag.scale.set(.06 * decorScale, .08 * decorScale, 1)); const globeCenter = globe.getWorldPosition(new THREE.Vector3()); markerNodes.forEach((marker) => { const point = marker.userData.point, worldPoint = toVec(point.lat, point.lon, 1.025).applyMatrix4(globe.matrixWorld), projected = worldPoint.clone().project(camera), label = labelNodes.get(point); if (label) { const worldNormal = worldPoint.clone().sub(globeCenter).normalize(); label.style.left = `${(projected.x * .5 + .5) * innerWidth}px`; label.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`; label.hidden = projected.z > 1 || !isGlobeFacing(worldNormal, camera.position, worldPoint); } const { selected, halo, baseGlow, phase } = marker.userData; marker.scale.setScalar(decorScale * (selected ? 1.35 : 1)); halo.material.opacity = (selected ? .95 : baseGlow) * (.86 + .14 * Math.sin(time * .004 + phase)); }); renderer.render(scene, camera); requestAnimationFrame(tick); }; tick();
    document.fonts?.load('600 12px "DM Sans"').catch(() => {}); document.fonts?.load('650 24px Newsreader').catch(() => {});
  }
}
