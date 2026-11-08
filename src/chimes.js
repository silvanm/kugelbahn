// Klangrinne: Die Kugel fällt aus dem Fangtrichter auf ein Metallophon und rollt über 13 gestimmte Klangstäbe
// (C-Dur-Pentatonik, zwei Oktaven aufwärts) nach Westen, wendet in einer Kehre und rollt in einer
// Rinne hinter der Klangrinne zurück zum Lift.
// Physik: Die Kugel rollt auf einer glatten, geneigten Fläche auf Höhe der Staboberkanten. Die Stäbe selbst
// sind Optik; ihre Töne lösen wir aus, wenn die Kugel über einen Stab rollt (bzw. darauf landet).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { R, T, scene, world, trackMat, V, balls } from './core.js';
import { plasticMat, opalMat, alu, darkMat } from './materials.js';
import { addBox, addPost, makeTrough } from './geometry.js';
import { FUN2 } from './track.js';

// Höhenplan: Ostende unter dem Fangtrichter, Gefälle nach Westen
const KR = { xE: 0.55, xW: -2.85, yE: 1.3, yW: 1.0, iw: 0.27, wallH: 0.16 };
const KR_SLOPE = (KR.yE - KR.yW) / (KR.xE - KR.xW);
const floorY = (x) => KR.yE - KR_SLOPE * (KR.xE - x);
const NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100];   // MIDI: C5 … E7
// Die Kugel verlässt den Trichter mit etwas Drall nach Westen: der erste Stab liegt dort, wo sie aufschlägt
const PITCH = 0.23, BAR_W = 0.17, X_BAR0 = FUN2.x - 0.17;
const bars = NOTES.map((m, i) => ({ x: X_BAR0 - i * PITCH, freq: 440 * 2 ** ((m - 69) / 12), flash: 0, mesh: null }));
const chimes = { onHit: null };    // audio.js hängt hier die Klangerzeugung ein

{
  const L = KR.xE - KR.xW, theta = Math.atan(KR_SLOPE), Lp = L / Math.cos(theta);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  body.position.set((KR.xE + KR.xW) / 2, (KR.yE + KR.yW) / 2, 0);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), theta);   // Ostende hoch
  const g = new THREE.Group();
  const hw = KR.iw;
  // unsichtbare Lauffläche auf Höhe der Staboberkanten
  body.addShape(new CANNON.Box(new CANNON.Vec3(Lp / 2, T / 2, hw)), new CANNON.Vec3(0, -T / 2, 0));
  // seitliche Acrylwangen und Endwand im Osten
  for (const s of [-1, 1]) addBox(body, g, Lp / 2, KR.wallH / 2, 0.015, 0, KR.wallH / 2, s * (hw + 0.015), plasticMat);
  addBox(body, g, 0.015, (KR.wallH + 0.25) / 2, hw, Lp / 2 - 0.015, (KR.wallH + 0.25) / 2 - 0.02, 0, plasticMat);
  // Optik unter den Stäben: zwei Filzleisten und zwei Alu-Träger, Abdeckplatte im Landebereich
  for (const s of [-1, 1]) {
    const felt = new THREE.Mesh(new THREE.BoxGeometry(Lp, 0.02, 0.05), darkMat);
    felt.position.set(0, -0.045, s * 0.17); g.add(felt);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(Lp, 0.06, 0.06), alu);
    beam.position.set(0, -0.085, s * 0.17); beam.castShadow = true; g.add(beam);
  }
  const plateL = KR.xE - (X_BAR0 + BAR_W / 2) - 0.01;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateL / Math.cos(theta), 0.035, 2 * hw), opalMat);
  plate.position.set(Lp / 2 - plateL / 2 / Math.cos(theta), -0.0175, 0); g.add(plate);
  world.addBody(body);
  g.position.copy(body.position); g.quaternion.copy(body.quaternion);
  // Klangstäbe: tiefe Töne lang, hohe kurz (Länge ~ 1/√f), eloxiert in Regenbogenfarben
  for (const [i, b] of bars.entries()) {
    const len = 0.86 * Math.sqrt(bars[0].freq / b.freq) + 0.05;
    const col = new THREE.Color().setHSL(i / bars.length * 0.8, 0.7, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.75, roughness: 0.28, emissive: col, emissiveIntensity: 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, 0.035, len), mat);
    // lokale Koordinate entlang der geneigten Bahn
    const u = (b.x - (KR.xE + KR.xW) / 2) / Math.cos(theta);
    m.position.set(u, -0.0175, 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    b.mesh = m;
  }
  scene.add(g);
  for (const x of [0.45, -1.2, -2.75]) for (const z of [-0.17, 0.17]) addPost(x, z, floorY(x) - 0.115, 0.025);
}

// Kehre im Westen und Rückweg hinter der Klangrinne bis zur Klappe am Lift (Halbrohr, etwas enger als sonst)
const RC_RET = 0.32, Z_RET = -0.85, KEHRE_R = -Z_RET / 2;
const retPts = [];
{
  const ctrl = [V(KR.xW + 0.12, 0, 0), V(KR.xW, 0, 0)];
  for (let k = 1; k < 12; k++) { const a = Math.PI / 2 + (k / 12) * Math.PI; ctrl.push(V(KR.xW + KEHRE_R * Math.cos(a), 0, -KEHRE_R + KEHRE_R * Math.sin(a))); }
  ctrl.push(V(KR.xW, 0, Z_RET), V(-1.5, 0, Z_RET), V(0, 0, Z_RET), V(1.3, 0, Z_RET), V(1.75, 0, -0.5), V(2.02, 0, -0.07), V(2.27, 0, 0));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const n = Math.ceil(curve.getLength() / 0.07);
  const y0 = floorY(KR.xW + 0.12) - 0.006, y1 = 0.65;   // Anschluss knapp unter der Lauffläche, Ende auf Höhe der Liftlippe
  curve.getSpacedPoints(n).forEach((p, k) => retPts.push(p.setY(THREE.MathUtils.lerp(y0, y1, k / n))));
  makeTrough(retPts, retPts.map(() => RC_RET));
  for (let i = 18; i < retPts.length - 8; i += 16) addPost(retPts[i].x, retPts[i].z, retPts[i].y - 0.02, 0.022);
}

// Liegt p (Kugelmittelpunkt) auf der Klangrinne?
function onChimes(p) {
  return p.x < KR.xE && p.x > KR.xW - 0.05 && Math.abs(p.z) < KR.iw && p.y < floorY(p.x) + R + 0.04 && p.y > floorY(p.x);
}

// Nach jedem Physikschritt: Stabwechsel bzw. Landung erkennen und Ton auslösen
const _p = new THREE.Vector3();
function chimesStep() {
  for (const ball of balls) {
    const b = ball.body, p = b.position, v = b.velocity;
    // Fallgeschwindigkeit vom vorigen Schritt: im Schritt des Aufpralls ist sie schon zurückgeworfen
    const vyPrev = ball.vyPrev ?? 0;
    ball.vyPrev = v.y;
    // Kurz abgehoben (Sprung beim Aufprall) zählt nicht als Verlassen: sonst klingt derselbe Stab doppelt
    if (!onChimes(p)) { if (!(p.y > floorY(p.x) && p.y < floorY(p.x) + R + 0.3 && Math.abs(p.z) < KR.iw && p.x < KR.xE && p.x > KR.xW)) ball.bar = -1; continue; }
    const i = Math.round((X_BAR0 - p.x) / PITCH);
    const onBar = i >= 0 && i < bars.length && Math.abs(p.x - bars[i].x) < BAR_W / 2 + 0.02;
    if (!onBar) { if (ball.bar === undefined) ball.bar = -1; continue; }
    if (ball.bar !== i) {
      const landing = (ball.bar ?? -1) === -1 && vyPrev < -0.3;
      const speed = landing ? -vyPrev : Math.hypot(v.x, v.z);
      ball.bar = i;
      if (speed < 0.08) continue;
      const gain = THREE.MathUtils.clamp(0.15 + speed * (landing ? 0.25 : 0.35), 0.1, 1);
      bars[i].flash = Math.max(bars[i].flash, gain);
      chimes.onHit?.(bars[i].freq, gain, _p.set(bars[i].x, floorY(bars[i].x), 0));
    }
  }
}

// Pro Bild: angeschlagene Stäbe leuchten kurz auf (im LED-Modus deutlich stärker)
function updateChimes(dt, ledLevel) {
  for (const b of bars) {
    b.flash *= Math.exp(-dt * 5);
    b.mesh.material.emissiveIntensity = b.flash * (0.35 + 3.5 * ledLevel) + 0.08 * ledLevel;
  }
}

export { KR, bars, chimes, onChimes, chimesStep, updateChimes };
