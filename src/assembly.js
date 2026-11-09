// Aufbau-Animation beim Start
import * as THREE from 'three';
import { scene, balls, state } from './core.js';
import { rockerMesh } from './track.js';
import { bellMesh, bellThread } from './bell.js';
import { trayMesh, gateMesh, carriage, crank, pedal } from './lift.js';
import { play } from './audio.js';

// Beim Start wird die Bahn in ~10 s zusammengesetzt: zuerst die Grundplatte auf den Tisch, dann die Teile von
// unten nach oben (Pfosten, Bahnen, Liftgestell), danach die beweglichen Teile und zuletzt die Glocke.
// Jedes Teil senkt sich von oben an seinen Platz. Der Versatz wirkt nur beim Zeichnen; die Physik ruht so lange.
// wait: alles ausgeblendet, die Animation beginnt erst mit releaseAssembly() (Startknopf)
const asm = { t: 0, end: 0, items: [], wait: false };
function startAssembly(wait = false) {
  asm.wait = wait;
  const late = new Set([trayMesh, gateMesh, carriage, crank, pedal, rockerMesh]);
  const last = new Set([bellMesh, bellThread]);
  const box = new THREE.Box3(), parts = [], moving = [], bellParts = [];
  let board = null;
  for (const o of scene.children) {
    if (!(o.isMesh || o.isGroup || o.isLine) || o.name === 'table' || o.name === 'leds' || balls.some((b) => b.mesh === o)) continue;
    if (o.name === 'board') { board = o; continue; }
    if (last.has(o)) { bellParts.push(o); continue; }
    if (late.has(o)) { moving.push(o); continue; }
    box.setFromObject(o);
    // grosse Teile bekommen mehr Zeit als Schrauben und Füsse
    parts.push({ o, key: Math.round(box.min.y / 0.3) * 100 + (box.min.x + box.max.x) / 2, w: 0.05 + Math.min(box.max.distanceTo(box.min), 6) });
  }
  parts.sort((a, b) => a.key - b.key);
  const items = [];
  if (board) items.push({ o: board, t0: 0.2, dur: 0.9, h: 1.0 });
  const T0 = 1.1, T1 = 7.2, W = parts.reduce((a, p) => a + p.w, 0) - parts.at(-1).w;
  let acc = 0;
  for (const { o, w } of parts) { items.push({ o, t0: T0 + (acc / W) * (T1 - T0), dur: 0.7, h: 1.4 }); acc += w; }
  moving.forEach((o, i) => items.push({ o, t0: 7.6 + i * 0.22, dur: 0.7, h: 1.2 }));
  bellParts.forEach((o) => items.push({ o, t0: 9.0, dur: 0.8, h: 0.9 }));
  for (const it of items) { it.o.visible = false; it.dy = 0; it.landed = false; }
  asm.items = items;
  asm.t = 0;
  asm.end = Math.max(...items.map((it) => it.t0 + it.dur)) + 0.2;
}
const building = () => asm.t < asm.end;
// vor dem Zeichnen: Teile einblenden und anheben; nach dem Zeichnen wieder zurück
function assemblyApply(dt) {
  if (!building()) return;
  if (!state.paused && !asm.wait) asm.t += dt;
  const _p = new THREE.Vector3();
  for (const it of asm.items) {
    const u = (asm.t - it.t0) / it.dur;
    it.o.visible = u >= 0;
    const e = 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;   // sanft absetzen
    it.dy = (1 - e) * it.h;
    it.o.position.y += it.dy;
    if (u >= 1 && !it.landed) {
      it.landed = true;
      play('click1', 0.25, 0.7 + Math.random() * 0.2, it.o.getWorldPosition(_p));
    }
  }
  if (!building()) for (const it of asm.items) it.o.visible = true;
}
function assemblyRestore() {
  for (const it of asm.items) { it.o.position.y -= it.dy; it.dy = 0; }
}

const releaseAssembly = () => { asm.wait = false; };

export { startAssembly, releaseAssembly, building, assemblyApply, assemblyRestore };
