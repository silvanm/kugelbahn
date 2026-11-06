// Glasmurmeln: Erzeugen, Fallen in den Einlauf, Rückholen vom Tisch
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { R, Y_TOP, H, MAX_BALLS, scene, world, ballMat, balls } from './core.js';
import { lift } from './lift.js';

const ballGeo = new THREE.SphereGeometry(R, 32, 20);
const coreGeo = new THREE.SphereGeometry(1, 24, 12);   // farbiger Kern der Glasmurmel (wird flachgedrückt)
let colorIdx = 0;

// Freien Platz auf der obersten Rampe suchen, damit sich Kugeln beim Erscheinen nie überlappen
const SPAWN_XS = [1.9, 1.4, 0.9, 0.4];
const DROP = 2.5;   // Fallhöhe über dem Einlauf
function findSpawn(exclude) {
  for (const x of SPAWN_XS) {
    const y = Y_TOP - 0.2 * (2.25 - x) / 2.25 + R + 0.05;   // Boden des Einlauf-Halbrohrs
    // Die Kugel fällt aus DROP Höhe in den Einlauf: frei sein müssen Landeplatz und die Fallstrecke darüber
    const free = balls.every(({ body: b }) => b === exclude ||
      (b.position.x - x) ** 2 + b.position.z ** 2 > (2 * R + 0.15) ** 2 ||
      b.position.y < y - 2 * R - 0.15 || b.position.y > y + DROP + 2 * R + 0.15);
    if (free) return new CANNON.Vec3(x, y + DROP, 0);
  }
  return null;
}

function spawnBall() {
  if (balls.length >= MAX_BALLS) return true;
  const pos = findSpawn();
  if (!pos) return false;
  const body = new CANNON.Body({ mass: 1, material: ballMat, shape: new CANNON.Sphere(R), linearDamping: 0.25, angularDamping: 0.05 });   // Dämpfung ≈ Rollwiderstand, hält das Tempo in Kurven moderat
  body.position.copy(pos);
  world.addBody(body);
  const hue = (colorIdx++ * 0.137) % 1;
  const col = new THREE.Color().setHSL(hue, 0.75, 0.52);
  // Glasmurmel: klare, leicht getönte Glashülle mit farbigem Kern, damit man das Rollen sieht
  const mesh = new THREE.Mesh(ballGeo, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: R, ior: 1.45,
    attenuationColor: col.clone().lerp(new THREE.Color(0xffffff), 0.3), attenuationDistance: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3,
  }));
  const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.15 }));
  core.scale.set(0.5 * R, 0.5 * R, 0.1 * R);
  core.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  mesh.add(core);
  mesh.castShadow = true;
  scene.add(mesh);
  const ball = { body, mesh };
  body.ball = ball;
  balls.push(ball);
  return true;
}

function respawnStray() {
  for (const ball of balls) {
    if (ball.held) continue;
    const b = ball.body, p = b.position;
    if (p.y < -3 || Math.abs(p.x) > 30 || Math.abs(p.z) > 30) {   // nur wer vom Tisch fällt, kommt oben wieder ins Spiel
      const spot = findSpawn(b);
      if (!spot) continue;   // oben gerade kein Platz – nächster Schritt
      window.__respawns = (window.__respawns || 0) + 1;
      (window.__lost ||= []).push([+p.x.toFixed(1), +p.z.toFixed(1), lift.ph]);
      ball.rail = undefined;
      b.position.copy(spot);
      b.velocity.setZero();
      b.angularVelocity.setZero();
    }
  }
}

// Neue Kugeln kommen eine nach der anderen (alle 0.8 s, sobald oben Platz ist)
const spawner = { pending: 0, timer: 0 };
function spawnStep() {
  if (spawner.pending > 0 && (spawner.timer -= H) <= 0) {
    if (spawnBall()) { spawner.pending--; spawner.timer = 0.8; }
  }
}
function clearBalls(n = 12) {
  for (const { body, mesh } of balls) { world.removeBody(body); scene.remove(mesh); mesh.material.dispose(); mesh.children[0].material.dispose(); }
  balls.length = 0;
  colorIdx = 0;
  spawner.pending = n; spawner.timer = 0;
}

export { findSpawn, spawnBall, respawnStray, spawner, spawnStep, clearBalls };
