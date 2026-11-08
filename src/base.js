// Grundplatte (matt anthrazit) und Tisch (Nussbaum, prozedurale Holztextur)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { renderer, scene, world, ballMat } from './core.js';

// Boden
// (Grundplatte und Tisch bekommen ihre Physik in makeBase, sobald ihre Grösse feststeht)
const woodMatPh = new CANNON.Material('wood');
world.addContactMaterial(new CANNON.ContactMaterial(ballMat, woodMatPh, { friction: 0.3, restitution: 0.3 }));
const woodBodies = new Set();

// Holzmaserung prozedural auf ein Canvas zeichnen (Farbe + Rauheit). Jahresringe laufen entlang u.
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function woodTextures({ light, dark, rings, size = 1024, planks = 0, warpAmp = 1.6, lateAmp = 0.55 }) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const cc = mk(), rc = mk(), cx = cc.getContext('2d'), rx = rc.getContext('2d');
  const ci = cx.createImageData(size, size), ri = rx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = y / size, plank = planks ? Math.floor(v * planks) : 0, pv = planks ? (v * planks) % 1 : v;
    const tone = 0.92 + 0.16 * hash2(plank, 7);   // Bretter leicht unterschiedlich hell
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = vnoise(u * 3 + plank * 5, pv * 4) * warpAmp + vnoise(u * 11, pv * 9) * 0.25 * warpAmp / 1.6;
      const ring = (pv * rings + warp) % 1;
      const late = Math.pow(Math.max(0, Math.sin(ring * Math.PI)), 6);          // dunkles Spätholz
      const fiber = vnoise(u * 6, pv * 420 + plank * 50) - 0.5;                     // feine Fasern
      let t = Math.min(1, late * lateAmp + fiber * 0.22 + 0.12);
      if (planks && (pv < 0.004 || pv > 0.996)) t = 1.4;                            // Fuge zwischen Brettern
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) ci.data[i + k] = Math.min(255, (light[k] + (dark[k] - light[k]) * t) * tone);
      ci.data[i + 3] = 255;
      const r = 150 + late * 50 + fiber * 60;   // Spätholz und Fasern etwas rauer
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = r; ri.data[i + 3] = 255;
    }
  }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0);
  const map = new THREE.CanvasTexture(cc), rough = new THREE.CanvasTexture(rc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  return { map, rough };
}
// Grundplatte (matt anthrazit) unter der ganzen Bahn, auf einem Nussbaum-Tisch.
// Oberkante der Platte = y 0, damit die Physik (Bodenebene) unverändert bleibt.
const BASE_T = 0.16;
function makeBase() {
  const bb = new THREE.Box3();
  scene.traverse((o) => { if (o.isMesh && !o.userData.noBase) bb.expandByObject(o); });
  const x0 = bb.min.x - 0.6, x1 = bb.max.x + 0.6, z0 = bb.min.z - 0.6, z1 = bb.max.z + 0.6;
  const w = x1 - x0, d = z1 - z0;
  // Schlichte, matt anthrazitfarbene Platte ohne Maserung: die hellen Acrylteile und Kugeln heben sich gut ab
  const top = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.85, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.7, metalness: 0 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, BASE_T, d), [sideMat, sideMat, top, top, sideMat, sideMat]);
  board.position.set((x0 + x1) / 2, -BASE_T / 2, (z0 + z1) / 2);
  board.receiveShadow = board.castShadow = true;
  board.name = 'board';
  scene.add(board);
  const boardBody = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMatPh });
  boardBody.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, BASE_T / 2, d / 2)));
  boardBody.position.set(board.position.x, board.position.y, board.position.z);
  world.addBody(boardBody);
  woodBodies.add(boardBody);

  const walnut = woodTextures({ light: [118, 80, 52], dark: [58, 36, 22], rings: 9, planks: 5 });
  const TW = w + 12, TD = d + 7, TT = 0.5;
  for (const t of [walnut.map, walnut.rough]) { t.rotation = Math.PI / 2; t.center.set(0.5, 0.5); }   // Bretter längs zur Tischkante
  walnut.map.repeat.set(TD / 14, TW / 14); walnut.rough.repeat.copy(walnut.map.repeat);
  const tableTop = new THREE.MeshStandardMaterial({ map: walnut.map, roughnessMap: walnut.rough, roughness: 0.9 });
  const tableSide = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.7 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(TW, TT, TD), [tableSide, tableSide, tableTop, tableSide, tableSide, tableSide]);
  table.position.set(board.position.x, -BASE_T - TT / 2, board.position.z);
  table.receiveShadow = true;
  table.name = 'table';
  scene.add(table);
  const tableBody = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMatPh });
  tableBody.addShape(new CANNON.Box(new CANNON.Vec3(TW / 2, TT / 2, TD / 2)));
  tableBody.position.set(table.position.x, table.position.y, table.position.z);
  world.addBody(tableBody);
  woodBodies.add(tableBody);
}

export { woodBodies, makeBase };
