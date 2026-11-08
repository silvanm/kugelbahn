// Einstieg: lädt die Module in Bau-Reihenfolge, verdrahtet die Bedienelemente und treibt Physik und Rendering.
// Die Import-Reihenfolge ist wichtig: Jedes Modul legt beim Laden seine Teile in Szene und Physik-Welt an.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { R, H, renderer, scene, camera, controls, world, sync, balls, state } from './core.js';
import { acrylicDepth } from './materials.js';
import { FUN, Y_FUN_RIM, LOOP, KICK, FUN2, rocker, rockerMesh, railPts, RAIL_BOX, railConstraint } from './track.js';
import { onChimes, chimesStep, updateChimes } from './chimes.js';
import { bell, bellPreStep, bellPostStep, syncBell } from './bell.js';
import { makeBase } from './base.js';
import { tray, trayMesh, gate, gateMesh, lift, PH, driveKinematics, syncLiftVisuals, advanceLift } from './lift.js';
import { spawner, spawnStep, respawnStray, clearBalls } from './balls.js';
import { audio, audioSuspend, toggleSound, audioContacts, audioUpdate } from './audio.js';
import { held } from './interaction.js';
import { startAssembly, building, assemblyApply, assemblyRestore } from './assembly.js';
import { composer, bokeh, updateFocus } from './postfx.js';
import { led, makeLights, setLed, updateLights } from './lights.js';
import { cam, enableBallCam, disableBallCam, nextBallCam, updateBallCam } from './ballcam.js';

// Grundplatte erst jetzt: ihre Grösse richtet sich nach allem, was bis hier in der Szene steht
makeBase();
makeLights();   // LED-Streifen richten sich nach der Grundplatte

// ---------------------------------------------------------------- Ablauf
function reset() {
  clearBalls(12);
  state.laps = 0;
  lift.ph = 'load'; lift.t = 0;
  held.clear(); controls.enabled = true; renderer.domElement.style.cursor = '';
}

// Im Trichter rollt die Kugel auf glatter Fläche: weniger Rollwiderstand, damit sie lange kreist
const tmp = new THREE.Vector3();
function funnelDamping() {
  for (const b of balls) {
    const body = b.body || b, p = body.position;
    const inFunnel = Math.hypot(p.x - FUN.x, p.z - FUN.z) < FUN.rOut && p.y > FUN.yHole - 0.1 && p.y < Y_FUN_RIM + R + 0.1;
    const onRails = RAIL_BOX.containsPoint(tmp.set(p.x, p.y, p.z));
    const onWood = p.y < R + 0.05 && !(p.x > 2.3 && p.x < 4.3 && Math.abs(p.z) < 0.65);   // auf Platte/Tisch, nicht in der Liftschale
    body.linearDamping = inFunnel ? 0.04 : onRails ? 0.02 : onChimes(p) ? 0.12 : onWood ? 0.7 : 0.25;   // Holz bremst stärker als glattes Acryl
  }
}

function physicsStep() {
  spawnStep();
  driveKinematics();
  funnelDamping();
  bellPreStep();
  world.step(H);
  bellPostStep();
  chimesStep();
  audioContacts();
  railConstraint();
  advanceLift();
  respawnStray();
}

// ---------------------------------------------------------------- UI
let follow = false, followIdx = 0;
const $ = (id) => document.getElementById(id);
$('add').onclick = () => { spawner.pending++; };
$('pause').onclick = (e) => { state.paused = !state.paused; e.target.textContent = state.paused ? 'Weiter' : 'Pause'; e.target.classList.toggle('on', state.paused); audioSuspend(); };
$('follow').onclick = (e) => {
  if (cam.active) setBallCam(false);
  follow = !follow;
  if (follow && balls.length) followIdx = (followIdx + 1) % balls.length;
  e.target.classList.toggle('on', follow);
};
$('reset').onclick = reset;
// Kugelkamera: an/aus, „Nächste“ wechselt die Kugel, Esc beendet
function setBallCam(on) {
  if (on) { follow = false; $('follow').classList.remove('on'); enableBallCam(); } else disableBallCam();
  $('ballcam').classList.toggle('on', on);
  $('nextBall').hidden = !on;
}
$('led').onclick = () => { setLed(!led.on); $('led').classList.toggle('on', led.on); };
$('ballcam').onclick = () => setBallCam(!cam.active);
$('nextBall').onclick = () => nextBallCam();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && cam.active) setBallCam(false); });
$('build').onclick = () => { setBallCam(false); reset(); startAssembly(); };
$('sound').onclick = async (e) => {
  const on = await toggleSound();
  e.target.classList.toggle('on', on);
  e.target.textContent = on ? '🔊 Ton' : '🔇 Ton';
};
$('dof').onclick = (e) => { bokeh.enabled = !bokeh.enabled; e.target.classList.toggle('on', bokeh.enabled); };
$('rotate').onclick = (e) => { controls.autoRotate = !controls.autoRotate; e.target.classList.toggle('on', controls.autoRotate); };
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- Loop
reset();
startAssembly();
// Debug-Zugriff (z. B. __kb.fastForward(60) simuliert 60 s ohne Rendering)
window.__kb = { finishAssembly: () => { assemblyApply(1e3); assemblyRestore(); }, led, setLed, updateLights, cam, updateBallCam, bell, composer, renderer, audio, world, CANNON, camera, controls, scene, acrylicDepth, balls, lift, rocker, railPts, LOOP, KICK, FUN2, get laps() { return state.laps; }, fastForward: (s) => { for (let i = 0; i < s / H; i++) physicsStep(); } };
const clock = new THREE.Clock();
let acc = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!state.paused && !building()) {
    acc += dt;
    while (acc >= H) { physicsStep(); acc -= H; }
  }
  for (const { body, mesh } of balls) sync(mesh, body);
  sync(trayMesh, tray);
  sync(gateMesh, gate);
  sync(rockerMesh, rocker);
  syncBell();
  syncLiftVisuals();

  if (follow && balls.length) {
    const b = balls[followIdx % balls.length].body.position;
    tmp.set(b.x, b.y, b.z);
    controls.target.lerp(tmp, 0.08);
  }
  if (cam.active) updateBallCam(dt); else controls.update(dt);
  audioUpdate();

  $('nBalls').textContent = balls.length;
  $('phase').textContent = PH[lift.ph].label;
  $('laps').textContent = state.laps;
  updateLights(dt, clock.elapsedTime, building());
  updateChimes(dt, led.mix);
  updateFocus();
  assemblyApply(dt);
  composer.render();
  assemblyRestore();
});
