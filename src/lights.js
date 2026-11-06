// LED-Licht (umschaltbar): Abendstimmung mit LED-Streifen an der Grundplatte, LED-Ringen an den Trichtern,
// leuchtenden Murmelkernen und Überstrahlen (Bloom). Im Tageslicht ist alles aus.
// Die Punktlichter bleiben immer in der Szene (nur Intensität 0), sonst kompiliert three.js beim Umschalten
// alle Shader neu und das Bild hängt kurz.
import * as THREE from 'three';
import { R, scene, renderer, hemi, sun, balls } from './core.js';
import { FUN, FUN2 } from './track.js';
import { bloom } from './postfx.js';

const DAY = { hemi: hemi.intensity, sun: sun.intensity, sunColor: sun.color.clone(), env: 1, bg: new THREE.Color(0x1b1d22), exposure: renderer.toneMappingExposure };
const NIGHT = { hemi: 0.1, sun: 0.35, sunColor: new THREE.Color(0x9fb4ff), env: 0.22, bg: new THREE.Color(0x07080b), exposure: 1.15 };

const leds = new THREE.Group();
leds.name = 'leds';                 // die Aufbau-Animation lässt die Gruppe aus
leds.visible = false;
const ledGeo = new THREE.BoxGeometry(1, 1, 1);
const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });   // Farbe kommt pro LED aus instanceColor (Werte > 1 = Leuchten)
const strips = [];                  // { mesh, n, color(i, t) -> setRGB }
const funnels = [];                 // { F, mesh, n, light, wallTop, glow }
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Viele kleine LEDs als eine InstancedMesh: ein Zeichenaufruf pro Streifen
function ledStrip(points, size, colorFn) {
  const mesh = new THREE.InstancedMesh(ledGeo, ledMat, points.length);
  points.forEach(({ p, yaw }, i) => {
    _q.setFromAxisAngle(_s.set(0, 1, 0), yaw);
    _m.compose(p, _q, _s.set(size, size * 0.5, size));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setRGB(0, 0, 0));
  });
  leds.add(mesh);
  const s = { mesh, n: points.length, colorFn };
  strips.push(s);
  return s;
}

function makeLights() {
  // Streifen rundum an der Oberkante der Grundplatte, leicht nach aussen versetzt
  const board = scene.getObjectByName('board');
  const { width: w, depth: d } = board.geometry.parameters;
  const bx = board.position.x, bz = board.position.z, y = -0.035, off = 0.012, step = 0.09;
  const pts = [];
  const side = (x0, z0, x1, z1, yaw) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / step);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; pts.push({ p: new THREE.Vector3(x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * u), yaw }); }
  };
  const X0 = bx - w / 2 - off, X1 = bx + w / 2 + off, Z0 = bz - d / 2 - off, Z1 = bz + d / 2 + off;
  side(X0, Z1, X1, Z1, 0); side(X1, Z1, X1, Z0, Math.PI / 2); side(X1, Z0, X0, Z0, 0); side(X0, Z0, X0, Z1, Math.PI / 2);
  // Langsam umlaufender Regenbogen
  ledStrip(pts, 0.045, (i, n, t, c) => c.setHSL((i / n + t * 0.03) % 1, 0.9, 0.55).multiplyScalar(2.6));

  // LED-Ring knapp unter der Oberkante jeder Trichterwand, dazu ein farbiges Licht über der Mitte
  for (const [F, wallH] of [[FUN, 0.25], [FUN2, 0.35]]) {
    const wallTop = F.yHole + F.depth + wallH, n = Math.round((2 * Math.PI * F.rOut) / 0.11), ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push({ p: new THREE.Vector3(F.x + (F.rOut + 0.03) * Math.cos(a), wallTop - 0.07, F.z + (F.rOut + 0.03) * Math.sin(a)), yaw: -a });
    }
    const strip = ledStrip(ring, 0.05, null);
    const light = new THREE.PointLight(0xffffff, 0, 4.5, 2);
    light.position.set(F.x, wallTop + 0.55, F.z);
    scene.add(light);   // ausserhalb der Gruppe: bleibt immer da (Intensität 0 bei Tag)
    funnels.push({ F, strip, light, wallTop, glow: 0, hue: F === FUN ? 0.55 : 0.85 });
    strip.colorFn = (i, nn, t, c, f) => {
      // Lauflicht: ein heller Punkt kreist; je mehr Kugeln im Trichter, desto heller und schneller
      const head = (t * (0.35 + f.glow * 0.5)) % 1, dist = Math.min(Math.abs(i / nn - head), 1 - Math.abs(i / nn - head));
      const k = 0.9 + f.glow * 1.6 + 3.5 * Math.exp(-dist * 40);
      c.setHSL((f.hue + t * 0.02) % 1, 0.85, 0.55).multiplyScalar(k);
    };
    strip.f = funnels.at(-1);
  }
  scene.add(leds);
}

const led = { on: false, mix: 0 };    // mix blendet weich zwischen Tag (0) und LED (1)
function setLed(on) { led.on = on; bloom.enabled = on; }

function updateLights(dt, t, assembling) {
  const target = led.on ? 1 : 0;
  led.mix += (target - led.mix) * (1 - Math.exp(-dt * 3));
  if (Math.abs(led.mix - target) < 0.002) led.mix = target;
  const m = led.mix;
  hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, m);
  sun.intensity = THREE.MathUtils.lerp(DAY.sun, NIGHT.sun, m);
  sun.color.copy(DAY.sunColor).lerp(NIGHT.sunColor, m);
  scene.environmentIntensity = THREE.MathUtils.lerp(DAY.env, NIGHT.env, m);
  scene.background.copy(DAY.bg).lerp(NIGHT.bg, m);
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exposure, NIGHT.exposure, m);

  // LEDs gehen erst an, wenn die Bahn fertig aufgebaut ist
  const ledLevel = assembling ? 0 : m;
  leds.visible = ledLevel > 0.01;
  for (const f of funnels) {
    let n = 0;
    for (const b of balls) {
      const p = b.body.position;
      if (Math.hypot(p.x - f.F.x, p.z - f.F.z) < f.F.rOut && p.y > f.F.yHole - 0.2 && p.y < f.wallTop + R) n++;
    }
    f.glow += (Math.min(n, 3) / 3 - f.glow) * (1 - Math.exp(-dt * (n ? 6 : 1.5)));
    f.light.color.setHSL((f.hue + t * 0.02) % 1, 0.85, 0.55);
    f.light.intensity = ledLevel * (4 + f.glow * 7);
  }
  if (leds.visible) {
    for (const s of strips) {
      for (let i = 0; i < s.n; i++) { s.colorFn(i, s.n, t, _c, s.f); s.mesh.setColorAt(i, _c.multiplyScalar(ledLevel)); }
      s.mesh.instanceColor.needsUpdate = true;
    }
  }
  // Murmelkerne leuchten im LED-Modus von innen
  for (const b of balls) { const core = b.mesh.children[0]; if (core) core.material.emissiveIntensity = 0.15 + 2.6 * ledLevel; }
}

export { led, makeLights, setLed, updateLights };
