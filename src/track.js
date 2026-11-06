// Bahn: Sammelrinne, Einlauf mit Helix, Weiche, Äste, Trichter, Drahtschienen mit Looping und Schanze
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, T, Y_TOP, H, scene, world, trackMat, V, balls } from './core.js';
import { plasticMat, acrylicDepth, edgeMat, railMat, steelMat, rimMat, funnelMat, wireMat } from './materials.js';
import { addBox, makeRamp, addGrid, addMesh, gridIndices, addTube, addPost, makeTrough, RC } from './geometry.js';

// Sammelrinne unten (unter dem Trichter), führt zum Lift
makeRamp({ xHigh: -3.0, xLow: 2.3, yHigh: 1.05, drop: 0.4, wallHigh: true, wallH: 0.6, rh: 0.6 });   // hohe Schienen: hier staut sich die Warteschlange
for (const x of [-2.6, -0.4, 1.8]) for (const z of [-0.25, 0.25]) addPost(x, z, 1.05 - ((x + 3) * 0.4) / 5.3 - T, 0.03);   // Stützen der Sammelrinne

// Höhenplan
const HELIX = { x: 0, z: -1.3, r: 1.3, turns: 2, pitch: 0.75 };
const Y_HELIX_IN = Y_TOP - 0.2;
const Y_HELIX_OUT = Y_HELIX_IN - HELIX.turns * HELIX.pitch;
const ROCK = { x: -2.4, y: Y_HELIX_OUT - 0.65, z: 0 };   // Drehpunkt der Weiche
// Lochradius > Kugeldurchmesser: zwei Kugeln nebeneinander können sich nicht verkeilen
const FUN = { x: -2.4, z: 0, rIn: 0.48, rOut: 1.3, yHole: 5.1, depth: 0.5, yTube: 5.0 };
const Y_FUN_RIM = FUN.yHole + FUN.depth;

// 1) Einlauf vom Lift + Helix + Gerade zur Weiche – ein durchgehendes Halbrohr ohne Nahtstellen
{
  const pts = [], rcs = [];
  const nChute = 18;
  for (let k = 0; k <= nChute; k++) {
    pts.push(V(2.25 * (1 - k / nChute), Y_TOP - 0.2 * k / nChute, 0));
    rcs.push(THREE.MathUtils.lerp(0.6, RC, k / nChute));   // breiter Trichter-Einlauf für die Lift-Ladung
  }
  const nH = 160;
  for (let k = 1; k <= nH; k++) {
    const th = Math.PI / 2 + (HELIX.turns * 2 * Math.PI * k) / nH;
    pts.push(V(HELIX.x + HELIX.r * Math.cos(th), Y_HELIX_IN - (HELIX.turns * HELIX.pitch * k) / nH, HELIX.z + HELIX.r * Math.sin(th)));
    rcs.push(RC);
  }
  const nS = 16, xEnd = ROCK.x + 0.4;
  for (let k = 1; k <= nS; k++) {
    pts.push(V(xEnd * k / nS, Y_HELIX_OUT - 0.15 * k / nS, 0));
    rcs.push(RC);
  }
  makeTrough(pts, rcs);
  { // Stirnwand am liftseitigen Rinnenende: die Schale kippt darüber aus, Rückspringer prallen ab
    const xE = 2.25, yTop = Y_TOP + 0.55, r0 = 0.6, sh = new THREE.Shape();
    const zMax = Math.sqrt(r0 * r0 - (r0 - (yTop - Y_TOP)) ** 2);
    sh.moveTo(-zMax, yTop - Y_TOP);
    for (let k = 0; k <= 24; k++) { const z = -zMax + (2 * zMax * k) / 24; sh.lineTo(z, r0 - Math.sqrt(r0 * r0 - z * z)); }
    sh.lineTo(zMax, yTop - Y_TOP);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
    const m = new THREE.Mesh(geo, plasticMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(xE, Y_TOP, 0);
    m.customDepthMaterial = acrylicDepth; m.castShadow = true;
    scene.add(m);
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.015, (yTop - Y_TOP) / 2, zMax)), new CANNON.Vec3(xE + 0.015, (Y_TOP + yTop) / 2, 0));
    world.addBody(body);
    addTube([V(xE + 0.015, yTop, -zMax), V(xE + 0.015, yTop, zMax)], 0.02, edgeMat);
  }

  // Mittelmast + Speichen der Helix (Optik)
  addPost(HELIX.x, HELIX.z, Y_HELIX_IN + 0.4, 0.07);
  for (let k = 0; k <= nH; k += 10) {
    const p = pts[nChute + Math.max(k, 1)];
    const dx = p.x - HELIX.x, dz = p.z - HELIX.z, len = Math.hypot(dx, dz);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 6), steelMat);
    s.position.set(HELIX.x + dx / 2, p.y - 0.04, HELIX.z + dz / 2);
    s.rotation.set(0, -Math.atan2(dz, dx), Math.PI / 2);
    scene.add(s);
  }
}

// 2) Weiche: Wippe mit Mittelfinne, Drehachse entlang x.
//    Die Finne lehnt zur tiefen Seite -> die Kugel wird zur hohen Seite abgelenkt, kippt die Wippe
//    mit ihrem Gewicht um und rollt dort ab. Die nächste Kugel geht dadurch auf die andere Seite.
const ROCK_TILT = THREE.MathUtils.degToRad(12);
const rocker = new CANNON.Body({ mass: 0.4, material: trackMat });
const rockerMesh = new THREE.Group();
addBox(rocker, rockerMesh, 0.3, 0.02, 0.75, 0, 0, 0, rimMat);              // Platte
addBox(rocker, rockerMesh, 0.3, 0.14, 0.015, 0, 0.16, 0, rimMat);          // Finne
for (const s of [-1, 1]) addBox(rocker, rockerMesh, 0.02, 0.17, 0.75, s * 0.32, 0.15, 0, railMat); // Stirnwände
{
  const q = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), ROCK_TILT);
  rocker.quaternion.copy(q);
  rocker.position.copy(new CANNON.Vec3(ROCK.x, ROCK.y, ROCK.z).vadd(q.vmult(new CANNON.Vec3(0, 0.15, 0))));
}
world.addBody(rocker);
scene.add(rockerMesh);
const anchor = new CANNON.Body({ type: CANNON.Body.STATIC });
world.addBody(anchor);
world.addConstraint(new CANNON.HingeConstraint(anchor, rocker, {
  pivotA: new CANNON.Vec3(ROCK.x, ROCK.y, ROCK.z), axisA: new CANNON.Vec3(1, 0, 0),
  pivotB: new CANNON.Vec3(0, -0.15, 0), axisB: new CANNON.Vec3(1, 0, 0),
}));
{ // Anschläge unter den Plattenenden
  const stops = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  const g = new THREE.Group();
  const yStop = 0.13 * Math.cos(ROCK_TILT) - 0.7 * Math.sin(ROCK_TILT);
  for (const s of [-1, 1]) addBox(stops, g, 0.25, 0.05, 0.05, ROCK.x, ROCK.y + yStop - 0.05, s * 0.68, steelMat);
  // Prallwand hinter der Wippe: fängt die aus der Helix kommende Kugel ab
  addBox(stops, g, 0.03, 0.45, 0.5, ROCK.x - 0.4, ROCK.y + 0.55, 0, railMat);
  world.addBody(stops);
  scene.add(g);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 10), steelMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(ROCK.x, ROCK.y, ROCK.z);
  scene.add(axle);
}

// 3) Zwei Äste von der Weiche zum Trichter; sie münden tangential und gegenüberliegend in den Rand
function makeBranch(ctrl, y0, y1) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  const n = Math.ceil(curve.getLength() / 0.1);
  const pts = curve.getSpacedPoints(n).map((p, k) => p.setY(THREE.MathUtils.lerp(y0, y1, k / n)));
  makeTrough(pts, pts.map(() => RC));
  return pts;
}
{
  const ctrlA = [[-2.4, 0.55], [-2.4, 1.5], [-1.8, 2.1], [-1.0, 1.9], [-0.85, 1.1], [-1.05, 0.3], [-1.25, -0.05]];
  const ctrlB = ctrlA.map(([x, z]) => [2 * FUN.x - x, 2 * FUN.z - z]);   // punktgespiegelt am Trichter
  for (const ctrl of [ctrlA, ctrlB]) {
    makeBranch(ctrl, ROCK.y - 0.65, Y_FUN_RIM + 0.4);
    for (const [x, z] of [ctrl[2], ctrl[3]]) addPost(x, z, ROCK.y - 0.8);
  }
}

// 4) Trichter: Profil ~ 1/r wie ein Gravitationstrichter, darunter ein kurzes Auslaufrohr
function makeFunnel(F, wallH, NA = 72, NR = 24) {
  const rim = F.yHole + F.depth;
  const fy = (r) => F.yHole + (F.depth * (1 - F.rIn / r)) / (1 - F.rIn / F.rOut);
  const ring = (r, y, out) => { for (let m = 0; m < NA; m++) { const a = (m / NA) * Math.PI * 2; out.push(F.x + r * Math.cos(a), y, F.z + r * Math.sin(a)); } };
  const surf = [];
  for (let k = 0; k <= NR; k++) { const r = F.rIn + (F.rOut - F.rIn) * Math.pow(k / NR, 1.4); ring(r, fy(r), surf); }
  addGrid(surf, NR + 1, NA, true, funnelMat, 6, 8);
  const wall = []; ring(F.rOut, rim, wall); ring(F.rOut, rim + wallH, wall);
  addGrid(wall, 2, NA, true, funnelMat, 1, 8);
  const tube = []; ring(F.rIn, F.yHole, tube); ring(F.rIn, F.yTube, tube);
  addGrid(tube, 2, NA, true, funnelMat, 1, 18);
  for (const y of [rim + wallH, F.yTube]) {
    const pts = []; for (let m = 0; m <= NA; m++) { const a = (m / NA) * Math.PI * 2; pts.push(V(F.x + (y === F.yTube ? F.rIn : F.rOut) * Math.cos(a), y, F.z + (y === F.yTube ? F.rIn : F.rOut) * Math.sin(a))); }
    addTube(pts, 0.035, edgeMat);
  }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; addPost(F.x + F.rOut * Math.cos(a), F.z + F.rOut * Math.sin(a), rim); }
}
makeFunnel(FUN, 0.25);

// 5) Neuer Unterbau: Auffangrinne unter dem Trichter -> Drahtschienen -> Kehre -> Steilabfahrt -> Looping -> Schanze -> Fangtrichter
const Y_C0 = 4.45, C_SLOPE = 0.2;             // Auffangrinne: Anfang (z=-0.6) und Gefälle (steil genug, dass die Kugel unter der Säule im Rohr wegrollt)
const Y_RAIL0 = Y_C0 - 1.5 * C_SLOPE;          // Schienenbeginn bei z=0.9
const LOOP = { x: -0.5, y: 2.75, r: 0.55, shift: 0.75 };   // Einfahrt unten, seitlicher Versatz über den Looping
const KICK = { len: 0.7, angle: THREE.MathUtils.degToRad(20), zLip: 2.3 };
LOOP.z = KICK.zLip + KICK.len + 0.15;        // Looping-Einfahrt (Fahrtrichtung -z)
const U_TURN = { x: -1.45, z: LOOP.z + 1.8, r: 0.95 };
const X_J = LOOP.x + LOOP.shift;             // Spur nach dem Looping / Mitte Fangtrichter
const FUN2 = { x: X_J, z: 0, rIn: 0.48, rOut: 1.0, yHole: 1.85, depth: 0.3, yTube: 1.5 };

// Auffangrinne direkt unter dem Trichterauslauf (Acryl-Halbrohr mit Endwand)
{
  const pts = [], n = 18, z0 = -0.6, z1 = 1.1;
  for (let k = 0; k <= n; k++) { const z = THREE.MathUtils.lerp(z0, z1, k / n); pts.push(V(FUN.x, Y_C0 - C_SLOPE * (z - z0), z)); }
  makeTrough(pts, pts.map(() => RC));
  const cap = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  const g = new THREE.Group();
  addBox(cap, g, 0.42, 0.28, 0.02, FUN.x, Y_C0 + 0.25, z0 - 0.02, plasticMat);
  world.addBody(cap); scene.add(g);
}

// Drahtschienen: 2 Laufdrähte + 2 seitliche Führungsdrähte entlang einer Mittellinie (= virtueller Rinnenboden).
// ups[i] gibt die Querneigung vor (Kurvenüberhöhung bzw. im Looping Richtung Kreismittelpunkt).
const RAIL_WIRES = [[-0.15, 0.03, 0.022], [0.15, 0.03, 0.022], [-0.28, 0.22, 0.016], [0.28, 0.22, 0.016]];
function makeRails(P, ups) {
  const n = P.length, NS = 6, S = [], U = [];
  for (let i = 0; i < n; i++) {
    const t = V(0, 0, 0).subVectors(P[Math.min(i + 1, n - 1)], P[Math.max(i - 1, 0)]).normalize();
    const s = V(0, 0, 0).crossVectors(t, ups[i]).normalize();
    S.push(s); U.push(V(0, 0, 0).crossVectors(s, t).normalize());
  }
  const at = (i, s, u) => P[i].clone().addScaledVector(S[i], s).addScaledVector(U[i], u);
  // Drähte sind nur Optik ...
  for (const [ws, wu, wr] of RAIL_WIRES) {
    const pos = [];
    for (let i = 0; i < n; i++) {
      const c = at(i, ws, wu);
      for (let m = 0; m < NS; m++) {
        const a = (m / NS) * Math.PI * 2;
        const q = c.clone().addScaledVector(S[i], wr * Math.cos(a)).addScaledVector(U[i], wr * Math.sin(a));
        pos.push(q.x, q.y, q.z);
      }
    }
    addMesh(pos, gridIndices(n, NS, true), wireMat);
  }
  // Physik: keine Kollisionsflächen – die Kugel wird in railConstraint() exakt entlang der Kurve geführt.
  // (Facettierte Flächen würden die Kugel in engen Kurven und im Looping spürbar abbremsen.)
  // Bügel, die die vier Drähte zusammenhalten (nur Optik)
  const geos = [];
  for (let i = 2; i < n - 1; i += 5) {
    const c = new THREE.CatmullRomCurve3([at(i, -0.28, 0.22), at(i, -0.2, -0.01), at(i, 0, -0.035), at(i, 0.2, -0.01), at(i, 0.28, 0.22)]);
    geos.push(new THREE.TubeGeometry(c, 12, 0.011, 5));
  }
  const m = new THREE.Mesh(mergeGeometries(geos), wireMat);
  m.castShadow = true;
  scene.add(m);
  return { S, U };
}

const railPts = [], railUps = [], loopFrom = { i: 0 }, loopTo = { i: 0 };
const RAIL = { U: null, C: null };
{
  const add = (x, y, z) => railPts.push(V(x, y, z));
  // a) gerade, leicht fallend in +z
  const nA = Math.round((U_TURN.z - 0.9) / 0.06);
  for (let k = 0; k <= nA; k++) add(FUN.x, THREE.MathUtils.lerp(Y_RAIL0, Y_RAIL0 - 0.3, k / nA), THREE.MathUtils.lerp(0.9, U_TURN.z, k / nA));
  // b) 180°-Kehre, überhöht
  const nU = 52;
  for (let k = 1; k <= nU; k++) { const th = Math.PI * (1 - k / nU); add(U_TURN.x + U_TURN.r * Math.cos(th), THREE.MathUtils.lerp(Y_RAIL0 - 0.3, Y_RAIL0 - 0.7, k / nU), U_TURN.z + U_TURN.r * Math.sin(th)); }
  // c) Steilabfahrt in -z, unten tangential flach (Kosinusprofil)
  const nD = 40;
  for (let k = 1; k <= nD; k++) { const u = k / nD; add(LOOP.x, LOOP.y + (Y_RAIL0 - 0.7 - LOOP.y) * (1 + Math.cos(Math.PI * u)) / 2, THREE.MathUtils.lerp(U_TURN.z, LOOP.z, u)); }
  // d) Looping mit seitlichem Versatz
  loopFrom.i = railPts.length;
  const nL = 110;
  for (let k = 1; k <= nL; k++) {
    const ph = (2 * Math.PI * k) / nL, u = k / nL;
    add(LOOP.x + LOOP.shift * u * u * (3 - 2 * u), LOOP.y + LOOP.r * (1 - Math.cos(ph)), LOOP.z - LOOP.r * Math.sin(ph));
  }
  loopTo.i = railPts.length;
  // e) kurzer Auslauf + Schanze (Parabel, endet mit Absprungwinkel)
  const nR = 3;
  for (let k = 1; k <= nR; k++) add(X_J, LOOP.y, LOOP.z - 0.15 * k / nR);
  const nK = 12, a = Math.tan(KICK.angle) / (2 * KICK.len);
  for (let k = 1; k <= nK; k++) { const d = KICK.len * k / nK; add(X_J, LOOP.y + a * d * d, LOOP.z - 0.15 - d); }

  // Querneigung: im Looping zum Kreismittelpunkt, sonst so, dass Schwerkraft + Fliehkraft senkrecht auf die Schienen wirken
  const n = railPts.length;
  for (let i = 0; i < n; i++) {
    const p = railPts[i];
    if (i >= loopFrom.i && i < loopTo.i) { railUps.push(V(p.x, LOOP.y + LOOP.r, LOOP.z).sub(p).normalize()); continue; }
    const a0 = railPts[Math.max(i - 1, 0)], a1 = railPts[Math.min(i + 1, n - 1)];
    const t0 = V(0, 0, 0).subVectors(p, a0).normalize(), t1 = V(0, 0, 0).subVectors(a1, p).normalize();
    const k = t1.sub(t0).divideScalar(Math.max(a1.distanceTo(a0) / 2, 1e-3));
    k.y = 0;
    const v2 = Math.max(0.5, (2 * 9.81 * (Y_RAIL0 - p.y) * 0.9) / 1.5);
    railUps.push(V(0, 9.81, 0).addScaledVector(k, v2).normalize());
  }
  // glätten (ausser im Looping)
  const sm = railUps.map((u, i) => {
    if (i >= loopFrom.i && i < loopTo.i) return u.clone();
    const acc = V(0, 0, 0);
    for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) if (!(j >= loopFrom.i && j < loopTo.i)) acc.add(railUps[j]);
    return acc.normalize();
  });
  railUps.splice(0, n, ...sm);
  RAIL.U = makeRails(railPts, railUps).U;
  RAIL.C = railPts.map((p, i) => p.clone().addScaledVector(RAIL.U[i], R));   // Bahn des Kugelmittelpunkts

  // Stützen (Optik)
  for (let i = 0; i < n; i += 14) if (i < loopFrom.i || i >= loopTo.i) addPost(railPts[i].x, railPts[i].z, railPts[i].y - 0.04, 0.022);
  for (const x of [LOOP.x, X_J]) addPost(x, LOOP.z, LOOP.y - 0.04, 0.03);
}
// Fangtrichter hinter der Schanze, sein Auslauf fällt in die Sammelrinne
makeFunnel(FUN2, 0.35, 56, 18);
// Zonen mit wenig Rollwiderstand (Stahldraht, glatter Trichter)
const RAIL_BOX = new THREE.Box3().setFromPoints(railPts).expandByScalar(0.45);

// Schienenführung: Kugel wird auf die Mittelpunktsbahn gesetzt, Geschwindigkeit entlang der Tangente gedreht
// (Betrag bleibt erhalten -> keine künstlichen Verluste). Schwerkraft wirkt durch die Physik-Engine; der
// Rollanteil (Trägheit der rollenden Kugel) wird als Korrektur abgezogen. Am Schanzenende wird losgelassen.
const _c = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
function railConstraint() {
  const C = RAIL.C, U = RAIL.U, n = C.length;
  for (const ball of balls) {
    if (ball.held) continue;   // festgehaltene Kugel bleibt, wo sie ist (Schienenposition bleibt gemerkt)
    const b = ball.body, p = b.position;
    if (ball.rail === undefined) {
      // Einkoppeln nur am Schienenanfang und in Fahrtrichtung
      // Einkoppeln im Übergangsbereich Auffangrinne -> Schienen (z 0.9..1.15), sonst fiele die Kugel durch
      if (p.z > C[0].z - 0.05 && p.z < C[0].z + 0.25 && Math.abs(p.x - C[0].x) < 0.4 && Math.abs(p.y - C[0].y) < 0.3) ball.rail = 1;
      else continue;
    }
    // nächstes Segment in der Umgebung des letzten suchen
    const i0 = Math.floor(ball.rail);
    let bi = -1, bu = 0, bd = Infinity;
    for (let i = Math.max(0, i0 - 4); i < Math.min(n - 1, i0 + 5); i++) {
      _t.subVectors(C[i + 1], C[i]);
      const len2 = _t.lengthSq();
      const u = THREE.MathUtils.clamp(((p.x - C[i].x) * _t.x + (p.y - C[i].y) * _t.y + (p.z - C[i].z) * _t.z) / len2, 0, 1);
      _c.copy(C[i]).addScaledVector(_t, u);
      const d = (p.x - _c.x) ** 2 + (p.y - _c.y) ** 2 + (p.z - _c.z) ** 2;
      if (d < bd) { bd = d; bi = i; bu = u; }
    }
    _t.subVectors(C[bi + 1], C[bi]).normalize();
    const vt = b.velocity.x * _t.x + b.velocity.y * _t.y + b.velocity.z * _t.z;
    if ((bi === n - 2 && bu >= 1) || (bi === 0 && bu <= 0 && vt < 0)) { ball.rail = undefined; continue; }  // Absprung / zurück in die Rinne
    _c.copy(C[bi]).lerp(C[bi + 1], bu);
    _u.copy(U[bi]).lerp(U[bi + 1], bu).normalize();
    let sp = Math.sign(vt || 1) * b.velocity.length();
    sp -= -9.81 * _t.y * H * (1 - 1 / 1.45);          // rollende Kugel beschleunigt nur mit g/1.45
    // Im Looping zu langsam (z. B. oben angehalten und losgelassen): Fliehkraft reicht nicht -> fällt herunter
    if (bi >= loopFrom.i && bi < loopTo.i && (sp * sp) / (LOOP.r - R) + 9.81 * _u.y < 0) { ball.rail = undefined; continue; }
    // In der Senke zwischen Looping und Schanze stehen geblieben -> sanfter Schubs, sonst pendelt sie ewig und blockiert
    ball.stall = Math.abs(sp) < 0.2 ? (ball.stall || 0) + H : 0;
    if (ball.stall > 2) { sp = 4.4; ball.stall = 0; }   // genug für den Sprung in den Fangtrichter
    b.position.set(_c.x, _c.y, _c.z);
    b.velocity.set(_t.x * sp, _t.y * sp, _t.z * sp);
    _v.crossVectors(_u, _t).multiplyScalar(sp / 0.19);   // Rollen auf den Drähten (Kontaktradius ~0.19)
    b.angularVelocity.set(_v.x, _v.y, _v.z);
    ball.rail = bi + bu;
  }
}

export { FUN, Y_FUN_RIM, LOOP, KICK, X_J, FUN2, rocker, rockerMesh, railPts, RAIL_BOX, railConstraint };
