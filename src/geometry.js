// Bauteil-Helfer: Boxen, Trimesh-Gitter, Rohre, Pfosten mit Fuss, Halbrohr-Rinnen, Rampen
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { W, T, RT, RH, WH, scene, world, trackMat, sync, V } from './core.js';
import { acrylicDepth, plasticMat, opalMat, edgeMat, steelMat, troughMat } from './materials.js';

// Box-Shape gleichzeitig in Physik-Body und Three-Group anlegen
function addBox(body, group, hx, hy, hz, x, y, z, mat) {
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z));
  const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  if (mat.transparent) m.customDepthMaterial = acrylicDepth;
  group.add(m);
}

function makeRamp({ xHigh, xLow, yHigh, drop, wallHigh, wallH = WH, rh = RH }) {
  const L = Math.abs(xHigh - xLow);
  const theta = Math.atan2(drop, L);
  const Lp = Math.hypot(L, drop);
  const dir = Math.sign(xHigh - xLow);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  body.position.set((xHigh + xLow) / 2, yHigh - drop / 2, 0);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), dir * theta);
  const g = new THREE.Group();
  const hw = W / 2;
  // Kleine Versätze (E), damit keine Flächen koplanar liegen (sonst Z-Fighting)
  const E = 0.005;
  addBox(body, g, Lp / 2, T / 2, hw + RT / 2, 0, -T / 2, 0, opalMat);      // Boden (opak) endet in der Mitte der Schienen
  for (const s of [-1, 1]) addBox(body, g, Lp / 2 + E, (rh + T + E) / 2, RT / 2, 0, (rh - T - E) / 2, s * (hw + RT / 2), plasticMat);
  if (wallHigh) addBox(body, g, RT / 2, (wallH + T + E) / 2, hw, dir * (Lp / 2 - RT / 2 + 2 * E), (wallH - T - E) / 2, 0, plasticMat);
  world.addBody(body);
  sync(g, body);
  scene.add(g);
}

// Physik und Optik aus demselben Vertex-Gitter (nI Zeilen × nJ Spalten).
// Physik wird in kleine Trimesh-Stücke zerlegt: so kann die Broadphase weit entfernte Teile
// aussortieren – ein einziger grosser Trimesh wäre ~10× langsamer.
function addGrid(positions, nI, nJ, closedJ, mat, chunkI = 6, chunkJ = nJ) {
  if (mat) addMesh(positions, gridIndices(nI, nJ, closedJ), mat);   // mat = null: nur Physik (unsichtbar)
  const J = closedJ ? nJ : nJ - 1;
  for (let i0 = 0; i0 < nI - 1; i0 += chunkI)
    for (let j0 = 0; j0 < J; j0 += chunkJ) {
      const verts = [], idx = [], map = new Map();
      const vid = (i, j) => {
        const key = i * nJ + (j % nJ);
        if (!map.has(key)) { map.set(key, verts.length / 3); verts.push(positions[3 * key], positions[3 * key + 1], positions[3 * key + 2]); }
        return map.get(key);
      };
      for (let i = i0; i < Math.min(i0 + chunkI, nI - 1); i++)
        for (let j = j0; j < Math.min(j0 + chunkJ, J); j++) {
          const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
          idx.push(a, c, b, a, d, c);
        }
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
      body.addShape(fastTrimesh(verts, idx));
      world.addBody(body);
    }
}
// cannon-es' Octree liefert bei Abfragen viele unnötige Dreiecke (alle, die über Knotengrenzen ragen).
// Ersatz: Bounding-Box pro Dreieck vorberechnen und linear filtern – bei ~150 Dreiecken pro Stück sehr schnell.
function fastTrimesh(verts, idx) {
  const shape = new CANNON.Trimesh(verts, idx);
  const nT = idx.length / 3, bb = new Float32Array(nT * 6);
  for (let t = 0; t < nT; t++) {
    for (let a = 0; a < 3; a++) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 3; k++) { const v = verts[idx[t * 3 + k] * 3 + a]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      bb[t * 6 + a] = lo; bb[t * 6 + 3 + a] = hi;
    }
  }
  shape.getTrianglesInAABB = (aabb, result) => {
    const l = aabb.lowerBound, u = aabb.upperBound;
    for (let t = 0, o = 0; t < nT; t++, o += 6)
      if (bb[o] <= u.x && bb[o + 3] >= l.x && bb[o + 1] <= u.y && bb[o + 4] >= l.y && bb[o + 2] <= u.z && bb[o + 5] >= l.z) result.push(t);
    return result;
  };
  return shape;
}
function addMesh(positions, indices, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  if (mat.transparent) mesh.customDepthMaterial = acrylicDepth;   // Acryl: nur ein schwacher Schatten
  mesh.receiveShadow = true;
  scene.add(mesh);
}
function gridIndices(nI, nJ, closedJ = false) {
  const idx = [];
  for (let i = 0; i < nI - 1; i++)
    for (let j = 0; j < (closedJ ? nJ : nJ - 1); j++) {
      const a = i * nJ + j, b = (i + 1) * nJ + j, c = (i + 1) * nJ + (j + 1) % nJ, d = i * nJ + (j + 1) % nJ;
      idx.push(a, c, b, a, d, c);
    }
  return idx;
}
function addTube(points, radius, mat) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, radius, 6), mat);
  m.castShadow = true;
  scene.add(m);
}
function addPost(x, z, yTop, r = 0.035) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, yTop, 10), steelMat);
  m.position.set(x, yTop / 2, z);
  m.castShadow = true;
  scene.add(m);
  addFoot(x, z, r);
  // Stützen sind fest: auf den Boden gefallene Kugeln prallen an ihnen ab
  const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: trackMat });
  const hPh = Math.min(yTop - 0.1, 0.6);   // nur der untere Teil: oben könnten sie Kugeln auf der Bahn stören
  b.addShape(new CANNON.Cylinder(r, r, hPh, 8));
  b.position.set(x, hPh / 2, z);
  world.addBody(b);
}
// Fussflansch mit drei Linsenkopfschrauben in die Grundplatte
const flangeGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const screwGeo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const screwMat = new THREE.MeshStandardMaterial({ color: 0x6d737b, metalness: 0.9, roughness: 0.35 });
const slotGeo = new THREE.BoxGeometry(1, 1, 1);
const slotMat = new THREE.MeshBasicMaterial({ color: 0x1a1b1e });
function addFoot(x, z, r) {
  const fr = r * 2.4 + 0.04, h = 0.03;
  const f = new THREE.Mesh(flangeGeo, steelMat);
  f.scale.set(fr, h, fr);
  f.position.set(x, h / 2, z);
  f.castShadow = f.receiveShadow = true;
  scene.add(f);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + x * 3.1, sr = Math.max(0.012, fr * 0.16);   // je Fuss anders gedreht
    const sx = x + Math.cos(a) * (fr - sr * 1.6), sz = z + Math.sin(a) * (fr - sr * 1.6);
    const s = new THREE.Mesh(screwGeo, screwMat);
    s.scale.set(sr, sr * 0.5, sr);
    s.position.set(sx, h, sz);
    scene.add(s);
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.scale.set(sr * 1.8, sr * 0.2, sr * 0.25);
    slot.position.set(sx, h + sr * 0.5, sz);
    slot.rotation.y = a * 1.7;
    scene.add(slot);
  }
}

// Halbrohr entlang einer Mittellinie (Punkte = Rinnenboden); rcs = Rinnenradius pro Punkt
const PROF_N = 13, PROF_A = THREE.MathUtils.degToRad(110);
function makeTrough(points, rcs) {
  const n = points.length, pos = [], rimL = [], rimR = [];
  const T = V(0, 0, 0), S = V(0, 0, 0), U = V(0, 0, 0), up = V(0, 1, 0), p = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    T.subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]).normalize();
    S.crossVectors(T, up).normalize();
    U.crossVectors(S, T).normalize();
    for (let j = 0; j < PROF_N; j++) {
      const a = -PROF_A + (2 * PROF_A * j) / (PROF_N - 1);
      p.copy(points[i]).addScaledVector(S, rcs[i] * Math.sin(a)).addScaledVector(U, rcs[i] * (1 - Math.cos(a)));
      pos.push(p.x, p.y, p.z);
      if (j === 0) rimL.push(p.clone());
      if (j === PROF_N - 1) rimR.push(p.clone());
    }
  }
  addGrid(pos, n, PROF_N, false, troughMat);
  addTube(rimL, 0.03, edgeMat);
  addTube(rimR, 0.03, edgeMat);
}
const RC = 0.42;   // Rinnenradius

export { addBox, makeRamp, addGrid, addMesh, gridIndices, addTube, addPost, addFoot, screwMat, makeTrough, RC };
