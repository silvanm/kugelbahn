// Glocke am Faden über der Sprungbahn (Pendel)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { H, scene, world, ballMat, sync, balls } from './core.js';
import { steelMat, brassMat } from './materials.js';
import { addPost } from './geometry.js';
import { X_J } from './track.js';

// Glocke am Faden über dem Scheitel der Sprungbahn: die fliegende Kugel streift ihren unteren Rand,
// die Glocke schwingt als Pendel aus und klingelt. Sie ist leicht, damit die Kugel trotzdem im Fangtrichter landet.
const BELL = { x: X_J, z: 1.75, rimY: 3.35, h: 0.24, rRim: 0.17, rTop: 0.07, L: 1.0, mass: 0.15 };
BELL.anchor = new CANNON.Vec3(BELL.x, BELL.rimY + BELL.h + BELL.L, BELL.z);
const bellMat = new CANNON.Material('bell');
world.addContactMaterial(new CANNON.ContactMaterial(ballMat, bellMat, { friction: 0.05, restitution: 0.2 }));
const bell = new CANNON.Body({ mass: BELL.mass, material: bellMat, linearDamping: 0.45, angularDamping: 0.6 });   // Luft- und Lagerreibung: schwingt nach ein paar Pendelschlägen aus
// Körper-Ursprung in der Krone; Glockenkörper als Kegelstumpf darunter
bell.addShape(new CANNON.Cylinder(BELL.rTop, BELL.rRim, BELL.h, 16), new CANNON.Vec3(0, -BELL.h / 2, 0));
bell.position.set(BELL.anchor.x, BELL.anchor.y - BELL.L, BELL.anchor.z);
world.addBody(bell);
const bellHook = new CANNON.Body({ type: CANNON.Body.STATIC });
world.addBody(bellHook);
// Faden als Pendelstange: Aufhängepunkt und Krone im Abstand L
world.addConstraint(new CANNON.PointToPointConstraint(bellHook, BELL.anchor, bell, new CANNON.Vec3(0, BELL.L, 0)));
const bellMesh = new THREE.Group();
{
  // Glockenprofil (Radius, Höhe) von der Krone bis zum ausgestellten Rand, innen hohl
  const prof = [[0.0, 0.0], [0.05, -0.005], [0.075, -0.03], [0.085, -0.08], [0.1, -0.15], [0.13, -0.2], [0.17, -0.235], [0.172, -0.24],
                [0.158, -0.238], [0.12, -0.2], [0.09, -0.15], [0.072, -0.08], [0.06, -0.035], [0.0, -0.025]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, brassMat);
  m.castShadow = m.receiveShadow = true;
  bellMesh.add(m);
  const knob = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), brassMat);   // Öse
  knob.position.y = 0.022;
  bellMesh.add(knob);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), steelMat);     // Klöppel
  clapper.position.y = -0.2;
  bellMesh.add(clapper);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4), steelMat);
  cord.position.y = -0.11;
  bellMesh.add(cord);
}
scene.add(bellMesh);
const bellThread = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 5), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 }));
scene.add(bellThread);
{ // Galgen: Pfosten neben der Bahn und Ausleger bis über die Glocke
  const px = BELL.x + 0.85, top = BELL.anchor.y + 0.05;
  addPost(px, BELL.z, top, 0.03);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(px - BELL.x + 0.08, 0.05, 0.05), steelMat);
  arm.position.set((px + BELL.x) / 2, top, BELL.z);
  arm.castShadow = true;
  scene.add(arm);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), steelMat);
  eye.position.set(BELL.x, BELL.anchor.y + 0.005, BELL.z);
  scene.add(eye);
}
const _bt = new THREE.Vector3(), _ba = new THREE.Vector3();
// Die Glasmurmel ist viel schwerer als die dünne Blechglocke: die Glocke bekommt den Stoss voll ab,
// die Kugel fliegt praktisch unbeirrt weiter (sonst landet sie gelegentlich neben dem Fangtrichter).
const bellNear = new Map();
function bellPreStep() {
  bellNear.clear();
  for (const ball of balls) {
    const p = ball.body.position;
    if ((p.x - bell.position.x) ** 2 + (p.y - bell.position.y) ** 2 + (p.z - bell.position.z) ** 2 < 0.5)
      bellNear.set(ball.body, [ball.body.velocity.clone(), ball.body.angularVelocity.clone()]);
  }
}
function bellPostStep() {
  if (!bellNear.size) return;
  for (const c of world.contacts) {
    const other = c.bi === bell ? c.bj : c.bj === bell ? c.bi : null;
    const saved = other && bellNear.get(other);
    if (!saved) continue;
    other.velocity.set(saved[0].x, saved[0].y - 9.81 * H, saved[0].z);
    other.angularVelocity.copy(saved[1]);
  }
  // Die Kugel streift nur: die Glocke schwingt höchstens etwa 15° aus
  const v = bell.velocity.length();
  if (v > 0.8) { bell.velocity.scale(0.8 / v, bell.velocity); bell.angularVelocity.scale(0.8 / v, bell.angularVelocity); }
}
function syncBell() {
  sync(bellMesh, bell);
  _ba.set(BELL.anchor.x, BELL.anchor.y, BELL.anchor.z);
  _bt.set(0, 0.03, 0).applyQuaternion(bellMesh.quaternion).add(bellMesh.position);   // Öse
  bellThread.position.addVectors(_ba, _bt).multiplyScalar(0.5);
  bellThread.scale.y = _ba.distanceTo(_bt);
  bellThread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _ba.sub(_bt).normalize());
}

export { bell, bellMesh, bellThread, bellPreStep, bellPostStep, syncBell };
