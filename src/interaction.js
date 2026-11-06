// Kugeln anfassen: antippen & halten = anhalten, am Boden antippen = zurück in den Einlauf
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { R, renderer, scene, camera, controls, balls } from './core.js';
import { findSpawn } from './balls.js';
import { play } from './audio.js';

// Kugeln anhalten: antippen/anklicken und halten. Die Kugel wird solange kinematisch (unbeweglich, andere
// Kugeln prallen an ihr ab) und läuft beim Loslassen aus dem Stand weiter. Mehrere Finger = mehrere Kugeln.
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const held = new Map();   // pointerId -> Kugel
function ballAt(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(balls.map((b) => b.mesh), true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o.parent && o.parent !== scene) o = o.parent;
  return balls.find((b) => b.mesh === o) || null;
}
function setHeld(ball, on) {
  ball.held = on;
  const b = ball.body;
  b.type = on ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
  b.velocity.setZero();
  b.angularVelocity.setZero();
  b.wakeUp();
  ball.mesh.children[0].material.emissiveIntensity = on ? 0.9 : 0.15;   // Kern leuchtet, solange gehalten
}
// Capture-Phase auf window: läuft vor OrbitControls, damit ein Griff an die Kugel die Kamera nicht dreht
addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  const ball = ballAt(e);
  if (!ball || ball.held) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  // Liegt die Kugel auf Platte oder Tisch: aufheben und oben wieder in den Einlauf legen
  const p = ball.body.position;
  if (p.y < R + 0.05 && !(p.x > 2.3 && p.x < 4.3 && Math.abs(p.z) < 0.65)) {
    const spot = findSpawn(ball.body);
    if (spot) {
      ball.rail = undefined;
      ball.body.position.copy(spot);
      ball.body.velocity.setZero();
      ball.body.angularVelocity.setZero();
      ball.pv = ball.pp = undefined;   // kein Schein-Aufprall beim Tonmodul
      play('click1', 0.5, 1.2, spot);
    }
    return;
  }
  setHeld(ball, true);
  held.set(e.pointerId, ball);
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
}, true);
const release = (e) => {
  const ball = held.get(e.pointerId);
  if (!ball) return;
  held.delete(e.pointerId);
  if (balls.includes(ball)) setHeld(ball, false);
  if (!held.size) { controls.enabled = true; renderer.domElement.style.cursor = ''; }
};
addEventListener('pointerup', release, true);
addEventListener('pointercancel', release, true);
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!held.size && e.pointerType === 'mouse') renderer.domElement.style.cursor = ballAt(e) ? 'grab' : '';
});

export { held };
