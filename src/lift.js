// Lift: Kippkübel-Aufzug mit Zahnriemen und Klappe an der Sammelrinne (kinematisch)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Y_TOP, H, scene, world, trackMat, V, state } from './core.js';
import { liftMat, gateMat, steelMat, alu, darkMat } from './materials.js';
import { addBox, addFoot, screwMat } from './geometry.js';

// ---------------------------------------------------------------- Lift (kinematisch)
// Mechanik wie ein Kippkübel-Aufzug mit nur einem Antrieb:
//  - Ein Schlitten läuft am hinteren Alu-Profil, gezogen von einem Zahnriemen (Getriebemotor unten).
//  - Die Schale hängt hinten mit einem Drehzapfen B am Schlitten.
//  - Vorne trägt sie einen Bügel mit Laufrolle A, die in einer U-Schiene am vorderen Profil läuft.
//    Solange die Schiene senkrecht ist, liegt die Neigung fest (nach hinten gekippt, nichts fällt raus).
//    Oben biegt die Schiene nach vorn ab: der Schlitten zieht weiter hoch, die Rolle wird nach vorn
//    geführt und die Schale kippt um B nach vorn – sie entleert sich über die Lippe.
//  - Unten drückt ein Finger am Schlitten auf ein Pedal; über ein Parallelogramm-Gestänge öffnet das die
//    Klappe der Sammelrinne. Fährt der Schlitten los, schliesst ein Gegengewicht die Klappe.
// Alles hängt nur von der Schlittenhöhe s ab.
const TRAY_HX = 0.8;                 // halbe Länge der Liftschale
const PHI_CARRY = -0.28;             // nach hinten gekippt beim Fahren
const PHI_DUMP = 0.38;               // nach vorn gekippt zum Entladen
const LIP_L = new THREE.Vector2(-TRAY_HX + 0.03, 0.025);    // Oberkante der vorderen Lippe (Schalen-Koordinaten)
const B_L = new THREE.Vector2(TRAY_HX, -0.1);               // Drehzapfen am Schlitten
const A_L = new THREE.Vector2(-TRAY_HX + 0.02, 1.12);       // Laufrolle oben am Bügel
const rot2 = (v, phi) => new THREE.Vector2(v.x * Math.cos(phi) - v.y * Math.sin(phi), v.x * Math.sin(phi) + v.y * Math.cos(phi));
const relLip = (phi) => rot2(LIP_L.clone().sub(B_L), phi);
const BX = 2.38 - relLip(PHI_CARRY).x;                       // Lippe beim Beladen bei x ≈ 2.38
const S_BOT = 0.55 - relLip(PHI_CARRY).y;                    // Lippe unten auf Höhe der Sammelrinne
const S_TOP = Y_TOP + 0.9 - relLip(PHI_DUMP).y;              // Lippe beim Entladen über den Rinnenwänden
const TILT_TRAVEL = 1.4;                                     // Schlittenweg im gebogenen Schienenstück
const S_T0 = S_TOP - TILT_TRAVEL;
function liftPhi(s) {
  const u = THREE.MathUtils.clamp((s - S_T0) / TILT_TRAVEL, 0, 1);
  return PHI_CARRY + (PHI_DUMP - PHI_CARRY) * u * u * (2 - u);   // senkrecht einlaufend, schräg auslaufend
}
const rollerA = (s) => rot2(A_L.clone().sub(B_L), liftPhi(s)).add(new THREE.Vector2(BX, s));
const FRAME_H = S_TOP + 0.85;        // Höhe der Profile
const Z_TRAY = -0.61, Z_CAR = -0.70, Z_PROF = -0.82, Z_BELT = -0.81, R_PUL = 0.075;
const X_FRONT = rollerA(S_BOT).x, X_REAR = BX + 0.3;

const tray = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: trackMat });
const trayMesh = new THREE.Group();
addBox(tray, trayMesh, TRAY_HX, 0.05, 0.55, 0, -0.05, 0, liftMat);                       // Boden
addBox(tray, trayMesh, 0.03, 0.35, 0.58, TRAY_HX + 0.03, 0.25, 0, liftMat);              // Rückwand
for (const s of [-1, 1]) addBox(tray, trayMesh, TRAY_HX + 0.06, 0.35, 0.03, 0, 0.25, s * 0.58, liftMat); // Seiten
addBox(tray, trayMesh, 0.03, 0.06, 0.55, LIP_L.x, -0.035, 0, liftMat);                   // niedrige Lippe vorn
world.addBody(tray);
scene.add(trayMesh);
function part(geo, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
const cylZ = (r, h, n = 16) => new THREE.CylinderGeometry(r, r, h, n).rotateX(Math.PI / 2);
const cylX = (r, h, n = 16) => new THREE.CylinderGeometry(r, r, h, n).rotateZ(Math.PI / 2);
// Bügel mit Laufrolle (vorne, Rückseite der Schale) und Drehzapfen-Lager (hinten)
{
  const zb = -0.62;
  const bar = part(new THREE.BoxGeometry(0.06, A_L.y - 0.45, 0.025), liftMat, A_L.x, (A_L.y + 0.45) / 2, zb, trayMesh);
  part(cylZ(0.035, 0.05), darkMat, A_L.x, A_L.y, -0.655, trayMesh);                     // Laufrolle
  part(cylZ(0.012, 0.08), alu, A_L.x, A_L.y, -0.64, trayMesh);                            // Rollenachse
  part(new THREE.BoxGeometry(0.12, 0.14, 0.03), liftMat, B_L.x, B_L.y + 0.05, zb, trayMesh); // Lagerlasche
  part(cylZ(0.025, 0.12), alu, B_L.x, B_L.y, -0.66, trayMesh);                            // Zapfen
}

// Alu-Profile mit Nut, Querträger oben
const profGeo = new THREE.BoxGeometry(0.12, FRAME_H, 0.12);
for (const x of [X_FRONT, X_REAR]) {
  part(profGeo, alu, x, FRAME_H / 2, Z_PROF);
  const pb = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  pb.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.3, 0.06)));
  pb.position.set(x, 0.3, Z_PROF);
  world.addBody(pb);
  for (const dz of [-1, 1]) part(new THREE.BoxGeometry(0.03, FRAME_H, 0.005), darkMat, x, FRAME_H / 2, Z_PROF + dz * 0.0605);   // Nut
  addFoot(x, Z_PROF, 0.07);
}
part(new THREE.BoxGeometry(X_REAR - X_FRONT + 0.12, 0.12, 0.12), alu, (X_FRONT + X_REAR) / 2, FRAME_H + 0.06, Z_PROF);

// Führungsschiene für die Laufrolle: zwei Flachstäbe links/rechts der Rollenbahn, oben nach vorn gebogen
{
  const pts = [];
  for (let k = 0; k <= 160; k++) {
    const s = S_BOT - 0.15 + (S_TOP + 0.08 - (S_BOT - 0.15)) * (k < 40 ? (k / 40) * 0.82 : 0.82 + ((k - 40) / 120) * 0.18);
    pts.push(rollerA(s));
  }
  for (const side of [-1, 1]) {
    const rail = pts.map((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const t = new THREE.Vector2(q.x - o.x, q.y - o.y).normalize();
      return V(p.x - t.y * side * 0.045, p.y + t.x * side * 0.045, -0.655);
    });
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 320, 0.012, 6), alu);
    m.castShadow = true;
    scene.add(m);
  }
  // Rückwand der Schiene, Halter zum Profil, Blech für den gebogenen Teil
  for (let y = S_BOT + 1.4; y < S_T0 + 1.2; y += 1.6) part(new THREE.BoxGeometry(0.06, 0.08, Z_PROF + 0.06 - (-0.675)), alu, X_FRONT, y, (Z_PROF + 0.06 - 0.675) / 2);
  const top = pts.filter((p, i) => i > 40);
  const x0 = Math.min(...top.map((p) => p.x)) - 0.12, x1 = X_FRONT + 0.06;
  const y0 = Math.min(...top.map((p) => p.y)) - 0.15, y1 = Math.max(...top.map((p) => p.y)) + 0.12;
  part(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.015), alu, (x0 + x1) / 2, (y0 + y1) / 2, -0.69);
  for (const [x, y] of [[x0 + 0.06, y0 + 0.06], [x0 + 0.06, y1 - 0.06], [x1 - 0.05, y1 - 0.06]]) part(cylZ(0.018, 0.02, 10), screwMat, x, y, -0.68);
}

// Schlitten mit Laufrollen am hinteren Profil, Riemenklemme, Finger fürs Klappen-Pedal
const carriage = new THREE.Group();
scene.add(carriage);
const CAR_X0 = 3.2, CAR_X1 = X_REAR - 0.07;
part(new THREE.BoxGeometry(CAR_X1 - CAR_X0, 0.5, 0.03), alu, (CAR_X0 + CAR_X1) / 2, 0.25, Z_CAR, carriage);
for (const y of [0.06, 0.44]) for (const dz of [-1, 1]) part(cylZ(0.03, 0.025, 12), darkMat, X_REAR - 0.075, y, Z_PROF + dz * 0.075, carriage);   // Laufrollen beidseits der Nut
part(new THREE.BoxGeometry(0.03, 0.5, 0.2), alu, X_REAR - 0.075, 0.25, -0.76, carriage);                   // Rollenträger
part(new THREE.BoxGeometry(0.14, 0.1, 0.06), darkMat, BX, 0.45, -0.745, carriage);                           // Riemenklemme
const LINK_Z = -0.74;
const FINGER = { x: CAR_X0 - 0.07, y: 0.3, r: 0.03 };
part(new THREE.BoxGeometry(0.1, 0.03, 0.05), alu, CAR_X0 - 0.03, FINGER.y, -0.72, carriage);              // Finger
part(cylZ(FINGER.r, 0.03, 12), darkMat, FINGER.x, FINGER.y, LINK_Z, carriage);                              // Rolle am Finger

// Zahnriemen mit Riemenscheiben und Getriebemotor
const PUL_BOT = 0.2, PUL_TOP = FRAME_H - 0.2;
const beltTex = (() => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#1d1e20'; x.fillRect(0, 0, 8, 64); x.fillStyle = '#55595f'; x.fillRect(0, 0, 8, 24);
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const BELT_PITCH = 0.05;
const beltTexF = beltTex, beltTexB = beltTex.clone();
for (const t of [beltTexF, beltTexB]) { t.repeat.set(1, (PUL_TOP - PUL_BOT) / BELT_PITCH); t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
for (const [dz, tex] of [[R_PUL, beltTexF], [-R_PUL, beltTexB]]) {
  const geo = new THREE.BoxGeometry(0.06, PUL_TOP - PUL_BOT, 0.012);
  part(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), BX, (PUL_TOP + PUL_BOT) / 2, Z_BELT + dz);
}
const pulleys = [];
for (const y of [PUL_BOT, PUL_TOP]) {
  const g = new THREE.Group(); g.position.set(BX, y, Z_BELT); scene.add(g);
  part(cylX(R_PUL, 0.07, 24), darkMat, 0, 0, 0, g);
  for (const dx of [-1, 1]) part(cylX(R_PUL + 0.02, 0.008, 24), alu, dx * 0.04, 0, 0, g);   // Bordscheiben
  part(new THREE.BoxGeometry(0.02, 0.06, 0.006), alu, 0.045, R_PUL * 0.6, 0, g);           // Markierung: man sieht sie drehen
  part(cylX(0.012, 0.3, 8), alu, -0.05, 0, 0, g);                                             // Welle
  pulleys.push(g);
}
for (const y of [PUL_BOT, PUL_TOP]) part(new THREE.BoxGeometry(0.06, 0.12, 0.26), alu, BX + 0.09, y, Z_BELT);   // Lagerböcke
part(new THREE.BoxGeometry(X_REAR - BX, 0.06, 0.04), alu, (BX + X_REAR) / 2, PUL_TOP, Z_PROF);          // Halter oben
part(new THREE.BoxGeometry(0.16, 0.2, 0.2), darkMat, BX - 0.15, PUL_BOT, Z_BELT);                        // Getriebe
part(cylX(0.085, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.6, roughness: 0.35 }), BX - 0.38, PUL_BOT, Z_BELT);   // Motor
part(cylX(0.06, 0.04, 16), alu, BX - 0.55, PUL_BOT, Z_BELT);                                          // Motordeckel
part(new THREE.BoxGeometry(0.62, 0.03, 0.3), alu, BX - 0.25, 0.015, Z_BELT);                           // Motorplatte
// Endschalter unten und oben (der Schlitten fährt sie an)
for (const y of [S_BOT + 0.03, S_TOP + 0.48]) {
  part(new THREE.BoxGeometry(0.06, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }), X_REAR - 0.1, y, -0.86);
  part(new THREE.BoxGeometry(0.1, 0.008, 0.02), alu, X_REAR - 0.16, y + (y > 5 ? -0.05 : 0.05), -0.86);
}

// Klappe am Ende der Sammelrinne als Zugbrücke: offen liegt sie bündig mit dem Rinnenboden und überbrückt
// die Lippe der Schale, zum Schliessen klappt sie um die Achse an der Rinnenkante hoch. Sie schwenkt dabei
// nie durch die wartende Schlange; was noch auf ihr liegt, rollt zur Achse zurück in die Rinne.
const RAMP_TH = Math.atan2(0.4, 5.3);
const HINGE = new THREE.Vector3(2.29, 0.65 + (2.3 - 2.29) * Math.tan(RAMP_TH) - 0.002, 0);   // Oberseite offen knapp unter der Bodenfläche: keine Kante, an der Kugeln hängen bleiben
const FLAP_L = 0.36, DELTA = Math.PI / 2 + RAMP_TH;   // Schwenkwinkel von offen (Bodenneigung) bis senkrecht
const gate = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: trackMat });
const gateMesh = new THREE.Group();
addBox(gate, gateMesh, FLAP_L / 2, 0.012, 0.34, FLAP_L / 2, -0.012, 0, gateMat);
world.addBody(gate);
scene.add(gateMesh);
part(cylZ(0.02, 1.16), alu, HINGE.x, HINGE.y, -0.16);                              // Klappenachse durch beide Rinnenwände bis zur Kurbel
// Parallelogramm-Gestänge: Kurbel an der Klappenachse, Pedal unten, Schubstange dazwischen
const L_ARM = 0.1, L_PAD = 0.11;
// Pedal so gesetzt, dass sein Polster in der untersten Schlittenstellung ganz unten unter der Fingerrolle liegt
const PEDAL = new THREE.Vector3(FINGER.x - 0.095, S_BOT + FINGER.y - FINGER.r + L_PAD * Math.sin(DELTA / 2), LINK_Z);
const PAD_OFF = -DELTA / 2 + RAMP_TH, CRANK_OFF = -Math.PI / 2 + RAMP_TH;
const crank = new THREE.Group(); crank.position.set(HINGE.x, HINGE.y, LINK_Z); scene.add(crank);
part(new THREE.BoxGeometry(L_ARM, 0.025, 0.015), steelMat, L_ARM / 2, 0, 0, crank);
part(new THREE.BoxGeometry(0.16, 0.02, 0.015), steelMat, -0.08, 0, 0, crank);
part(new THREE.BoxGeometry(0.06, 0.06, 0.04), darkMat, -0.16, 0, 0, crank);         // Gegengewicht
const pedal = new THREE.Group(); pedal.position.copy(PEDAL); scene.add(pedal);
const pedalArm = part(new THREE.BoxGeometry(L_ARM, 0.025, 0.015), steelMat, L_ARM / 2, 0, 0, pedal);
const padArm = new THREE.Group(); pedal.add(padArm);
part(new THREE.BoxGeometry(L_PAD, 0.025, 0.015), steelMat, L_PAD / 2, 0, 0, padArm);
part(new THREE.BoxGeometry(0.03, 0.03, 0.05), darkMat, L_PAD, 0, 0, padArm);
part(new THREE.BoxGeometry(0.05, PEDAL.y + 0.02, 0.05), alu, PEDAL.x, (PEDAL.y - 0.02) / 2, LINK_Z - 0.04);   // Lagerbock
const rod = part(new THREE.CylinderGeometry(0.01, 0.01, 1, 8), steelMat, 0, 0, LINK_Z + 0.012);
part(new THREE.BoxGeometry(0.05, HINGE.y - 0.05, 0.05), alu, HINGE.x + 0.05, (HINGE.y - 0.05) / 2, LINK_Z - 0.04);   // Bock an der Rinne

// Zustandsautomat: Phasen geben nur die Schlittenhöhe s vor
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const S_GATE = S_BOT + 2 * L_PAD * Math.sin(DELTA / 2) + 0.03;   // ab hier ist die Klappe zu, der Finger hebt ab
const PH = {
  load:   { dur: 4,                           label: 'Beladen',          s: [S_BOT, S_BOT] },
  close:  { dur: 0.6,                         label: 'Klappe schliesst', s: [S_BOT, S_GATE] },
  up:     { dur: (S_T0 - S_GATE) / 3.4,       label: 'Fährt hoch',       s: [S_GATE, S_T0] },
  tilt:   { dur: 0.9,                         label: 'Kippt',            s: [S_T0, S_TOP] },
  dump:   { dur: 1.8,                         label: 'Entlädt',          s: [S_TOP, S_TOP] },
  untilt: { dur: 0.9,                         label: 'Kippt zurück',     s: [S_TOP, S_T0] },
  down:   { dur: (S_T0 - S_GATE) / 4.5,       label: 'Fährt runter',     s: [S_T0, S_GATE] },
  open:   { dur: 0.4,                         label: 'Klappe öffnet',    s: [S_GATE, S_BOT] },
};
const NEXT = { load: 'close', close: 'up', up: 'tilt', tilt: 'dump', dump: 'untilt', untilt: 'down', down: 'open', open: 'load' };
const sAt = (ph, t) => lerp(PH[ph].s[0], PH[ph].s[1], ease(t / PH[ph].dur));

// Klappenwinkel aus der Schlittenhöhe: das Pedal folgt dem Finger, bis die Klappe am Anschlag (zu) ist
function flapBeta(s) {
  const k = THREE.MathUtils.clamp((s + FINGER.y - FINGER.r - PEDAL.y) / L_PAD, -Math.sin(DELTA / 2), Math.sin(DELTA / 2));
  return Math.asin(k) - PAD_OFF;   // -RAMP_TH = offen (liegt als Brücke), +90° = zu
}
function trayPose(s) {
  const phi = liftPhi(s);
  const p = rot2(B_L, phi);
  return { x: BX - p.x, y: s - p.y, phi };
}

const lift = { ph: 'load', t: 0, s: S_BOT };
const Z = new CANNON.Vec3(0, 0, 1);

function driveKinematics() {
  const { ph, t } = lift;
  const s0 = sAt(ph, t), s1 = sAt(ph, Math.min(t + H, PH[ph].dur));
  lift.s = s0;
  const p0 = trayPose(s0), p1 = trayPose(s1);
  tray.position.set(p0.x, p0.y, 0);
  tray.quaternion.setFromAxisAngle(Z, p0.phi);
  tray.velocity.set((p1.x - p0.x) / H, (p1.y - p0.y) / H, 0);
  tray.angularVelocity.set(0, 0, (p1.phi - p0.phi) / H);
  const b0 = flapBeta(s0), b1 = flapBeta(s1);
  gate.position.set(HINGE.x, HINGE.y, 0);
  gate.quaternion.setFromAxisAngle(Z, b0);
  gate.angularVelocity.set(0, 0, (b1 - b0) / H);
}

// Optik der mitlaufenden Teile (pro Frame)
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3();
function syncLiftVisuals() {
  const s = lift.s;
  carriage.position.y = s;
  const beta = flapBeta(s);
  crank.rotation.z = beta + CRANK_OFF;
  pedalArm.parent.rotation.z = beta + CRANK_OFF;
  padArm.rotation.z = PAD_OFF - CRANK_OFF;
  _ra.set(HINGE.x + L_ARM * Math.cos(beta + CRANK_OFF), HINGE.y + L_ARM * Math.sin(beta + CRANK_OFF), LINK_Z + 0.012);
  _rb.set(PEDAL.x + L_ARM * Math.cos(beta + CRANK_OFF), PEDAL.y + L_ARM * Math.sin(beta + CRANK_OFF), LINK_Z + 0.012);
  rod.position.addVectors(_ra, _rb).multiplyScalar(0.5);
  rod.scale.y = _ra.distanceTo(_rb);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _rb.sub(_ra).normalize());
  // Offset 1 = ein Zahn weiter: vorderes Trum läuft mit dem Schlitten, hinteres gegenläufig
  beltTexF.offset.y = -s / BELT_PITCH;
  beltTexB.offset.y = s / BELT_PITCH;
  for (const p of pulleys) p.rotation.x = -s / R_PUL;
}

function advanceLift() {
  lift.t += H;
  if (lift.t >= PH[lift.ph].dur) {
    if (lift.ph === 'dump') state.laps++;
    lift.ph = NEXT[lift.ph];
    lift.t = 0;
  }
}

export { tray, trayMesh, gate, gateMesh, carriage, crank, pedal, lift, PH, driveKinematics, syncLiftVisuals, advanceLift };
