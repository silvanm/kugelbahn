// Kugelkamera: fährt knapp hinter und über einer Kugel mit und schaut in Fahrtrichtung.
// Die Blickrichtung folgt der waagrechten Geschwindigkeit (weich nachgeführt). So bleibt die Kamera
// auch im Lift stabil, wo sich die Kugel nur senkrecht bewegt.
import * as THREE from 'three';
import { R, camera, controls, balls } from './core.js';

const DIST = R * 5.5;       // Abstand hinter der Kugel
const HEIGHT = R * 2.6;     // Höhe über der Kugel
const AHEAD = R * 6;        // Blickpunkt vor der Kugel

const cam = { active: false, ball: null };
const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, near: 0.1 };
const heading = new THREE.Vector3(1, 0, 0);
const p = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3(), lookS = new THREE.Vector3();
let vy = 0;

function pickNext() {
  if (!balls.length) { cam.ball = null; return; }
  const i = balls.indexOf(cam.ball);
  cam.ball = balls[(i + 1) % balls.length];
  // Sofort hinter die neue Kugel springen statt quer durch die Bahn zu fliegen
  place(true);
}

function enable() {
  if (cam.active) return;
  cam.active = true;
  saved.pos.copy(camera.position); saved.target.copy(controls.target);
  saved.fov = camera.fov; saved.near = camera.near;
  camera.fov = 70; camera.near = 0.02; camera.updateProjectionMatrix();
  controls.enabled = false;
  cam.ball = null;
  pickNext();
}

function disable() {
  if (!cam.active) return;
  cam.active = false;
  camera.position.copy(saved.pos); controls.target.copy(saved.target);
  camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
  controls.enabled = true;
}

function place(snap, dt = 0) {
  const b = cam.ball.body.position, v = cam.ball.body.velocity;
  p.set(b.x, b.y, b.z);
  const hs = Math.hypot(v.x, v.z);
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  if (hs > 0.15) {
    want.set(v.x / hs, 0, v.z / hs);
    heading.lerp(want, k).normalize();
  }
  vy += (THREE.MathUtils.clamp(v.y, -4, 4) - vy) * k;
  want.copy(p).addScaledVector(heading, -DIST);
  want.y += HEIGHT;
  if (snap) camera.position.copy(want);
  else camera.position.lerp(want, 1 - Math.exp(-dt * 9));
  // Blickpunkt vor der Kugel, bei Gefälle etwas nach unten geneigt
  look.copy(p).addScaledVector(heading, AHEAD);
  look.y += vy * 0.12 - R * 0.5;
  if (snap) lookS.copy(look); else lookS.lerp(look, 1 - Math.exp(-dt * 8));
  camera.lookAt(lookS);
}

// Pro Bild aufrufen (anstelle von controls.update)
function updateBallCam(dt) {
  if (!balls.includes(cam.ball)) { cam.ball = null; pickNext(); }
  if (cam.ball) place(false, dt);
}

export { cam, enable as enableBallCam, disable as disableBallCam, pickNext as nextBallCam, updateBallCam };
