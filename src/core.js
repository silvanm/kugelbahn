// Grundgerüst: Konstanten, Renderer, Szene, Kamera, Licht, Physik-Welt und gemeinsamer Zustand
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

// ---------------------------------------------------------------- Konstanten
const R = 0.22;          // Kugelradius
const W = 0.7;           // Innenbreite der Rinne
const T = 0.1;           // Bodendicke
const RT = 0.06;         // Schienendicke
const RH = 0.2;          // Schienenhöhe
const WH = 0.9;          // Höhe der Prallwand
const Y_TOP = 9.75;      // Rinnenboden am Lift-Auslauf (oben)
const H = 1 / 120;       // fester Physik-Zeitschritt
const MAX_BALLS = 40;

// ---------------------------------------------------------------- Renderer / Szene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // Nachbearbeitung (Schatten, Unschärfe) kostet pro Pixel
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d22);
scene.fog = new THREE.Fog(0x1b1d22, 25, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
// Studio-Umgebung für Spiegelungen: dunkler Raum mit hellen Softboxen -> klare Lichtkanten auf Acryl und Glas
function studioEnv() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = room.geometry.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {   // Verlauf: oben hellgrau, Horizont mittel, unten dunkel
    const h = pos.getY(i) / 50, c = h > 0 ? 0.16 + 0.22 * h : 0.1 + 0.06 * (1 + h);
    cols.push(c, c * 1.02, c * 1.06);
  }
  room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(room);
  const box = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.97), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  box(30, 6, 0, 40, 0, 6);        // grosse Deckenleuchte
  box(8, 22, -38, 10, 10, 4);     // Streiflicht links
  box(8, 22, 30, 12, -28, 3.5);   // Streiflicht rechts hinten
  box(18, 5, 10, 8, 40, 2.5);     // Frontlicht
  return pmrem.fromScene(env, 0.02).texture;
}
scene.environment = studioEnv();

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(10, 10.5, 16);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.6, 4.6, 1.2);
controls.enableDamping = true;
controls.autoRotate = true;      // langsame Kamerafahrt um die Bahn, per Knopf abschaltbar
controls.autoRotateSpeed = 0.5;  // 2 = 30 s pro Umlauf -> 2 min pro Umlauf
controls.maxPolarAngle = Math.PI * 0.49;

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x30343c, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 14, bottom: -4, near: 1, far: 45 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------- Physik-Welt
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 15;
world.allowSleep = false;

const ballMat = new CANNON.Material('ball');
const trackMat = new CANNON.Material('track');
world.addContactMaterial(new CANNON.ContactMaterial(ballMat, trackMat, { friction: 0.2, restitution: 0.25 }));
world.addContactMaterial(new CANNON.ContactMaterial(ballMat, ballMat, { friction: 0, restitution: 0.5 }));   // glattes Glas: eine Kugelsäule darf die unterste nicht festklemmen

const sync = (obj, body) => { obj.position.copy(body.position); obj.quaternion.copy(body.quaternion); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Gemeinsamer, veränderlicher Zustand (Modul-Variablen lassen sich von aussen nicht neu zuweisen)
const balls = [];                          // { body, mesh, rail?, held?, ... }
const state = { paused: false, laps: 0 };

export { R, W, T, RT, RH, WH, Y_TOP, H, MAX_BALLS, renderer, scene, camera, controls, hemi, sun, world, ballMat, trackMat, sync, V, balls, state };
