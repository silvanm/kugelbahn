// Ton: Web Audio mit Klängen aus sounds/ (ElevenLabs)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { H, camera, world, balls, state } from './core.js';
import { rocker } from './track.js';
import { bell } from './bell.js';
import { woodBodies } from './base.js';
import { tray, lift } from './lift.js';
import { chimes } from './chimes.js';

// Klänge aus sounds/ (mit ElevenLabs generiert). Jede Kugel hat zwei Roll-Schleifen (Acryl, Draht), deren
// Lautstärke und Tonhöhe ihrer Geschwindigkeit folgen; Stösse lösen kurze Einzelklänge aus. Lautstärke und
// Stereo-Position hängen von der Lage zur Kamera ab.
const SND = ['roll_acrylic', 'roll_rail', 'motor', 'click1', 'click2', 'click3', 'impact', 'rattle', 'switch', 'bell'];
const CLICKS = ['click1', 'click2', 'click3'];
const audio = { on: false, ready: false, ctx: null, buf: {}, master: null, voices: new Map(), motor: null, win: 0, n: 0 };
let simTime = 0;
const _sv = new THREE.Vector3();

async function audioInit() {
  const ctx = audio.ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4;
  audio.master = ctx.createGain();
  audio.master.gain.value = 0.8;
  audio.master.connect(comp).connect(ctx.destination);
  await Promise.all(SND.map(async (n) => {
    const r = await fetch(`sounds/${n}.wav`);
    audio.buf[n] = await ctx.decodeAudioData(await r.arrayBuffer());
  }));
  audio.motor = loopVoice('motor');
  audio.ready = true;
}
function audioSuspend() {
  if (!audio.ctx) return;
  if (audio.on && !state.paused && !document.hidden) audio.ctx.resume(); else audio.ctx.suspend();
}
document.addEventListener('visibilitychange', audioSuspend);
async function toggleSound() {
  audio.on = !audio.on;
  if (audio.on && !audio.ctx) await audioInit();
  audioSuspend();
  return audio.on;
}

// Abstand und Seite relativ zur Kamera -> Lautstärkefaktor k und Stereo-Panorama
function spatial(p) {
  _sv.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
  const d = Math.max(_sv.length(), 0.1);
  return { k: THREE.MathUtils.clamp(14 / d, 0.25, 1.6), pan: THREE.MathUtils.clamp((_sv.x / d) * 1.3, -0.9, 0.9) };
}
function loopVoice(name) {
  const ctx = audio.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), pan = ctx.createStereoPanner();
  src.buffer = audio.buf[name];
  src.loop = true;
  g.gain.value = 0;
  src.connect(g).connect(pan).connect(audio.master);
  src.start(0, Math.random() * src.buffer.duration);   // zufälliger Einstieg, damit nicht alle Kugeln gleich klingen
  return { src, g, pan };
}
function stopVoice(v) { v.src.stop(); v.src.disconnect(); v.g.disconnect(); v.pan.disconnect(); }
function setVoice(v, gain, rate, pan, t) {
  v.g.gain.setTargetAtTime(gain, t, 0.04);
  v.src.playbackRate.setTargetAtTime(rate, t, 0.05);
  v.pan.pan.setTargetAtTime(pan, t, 0.05);
}
function play(name, gain, rate, pos) {
  if (!audio.on || !audio.ready) return;
  const ctx = audio.ctx, now = ctx.currentTime;
  if (now - audio.win > 0.1) { audio.win = now; audio.n = 0; }
  if (++audio.n > 12) return;   // höchstens 12 Einzelklänge pro 100 ms (Kugelhaufen im Lift)
  const { k, pan } = spatial(pos);
  const src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
  src.buffer = audio.buf[name];
  src.playbackRate.value = rate;
  g.gain.value = Math.min(1.5, gain * k);
  p.pan.value = pan;
  src.connect(g).connect(p).connect(audio.master);
  src.start();
}

// Klangstab der Klangrinne: Metallophon-Ton synthetisch (Teiltöne eines frei schwingenden Stabs,
// die hohen klingen schneller ab), dazu ein kurzer Anschlag
const BAR_PARTIALS = [[1, 1, 1.8], [2.756, 0.32, 0.55], [5.404, 0.12, 0.22], [8.933, 0.05, 0.1]];   // [Verhältnis, Pegel, Abklingzeit s]
chimes.onHit = (freq, gain, pos) => {
  if (!audio.on || !audio.ready) return;
  const ctx = audio.ctx, t = ctx.currentTime;
  const { k, pan } = spatial(pos);
  const out = ctx.createGain(), p = ctx.createStereoPanner();
  out.gain.value = Math.min(1.2, gain * k * 0.55);
  p.pan.value = pan;
  out.connect(p).connect(audio.master);
  for (const [ratio, amp, dec] of BAR_PARTIALS) {
    const f = freq * ratio;
    if (f > 16000) continue;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec * (1.2 - 0.4 * Math.min(1, freq / 2000)));
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dec * 1.2 + 0.05);
  }
  play(CLICKS[(Math.random() * 3) | 0], gain * 0.12, 1.6, pos);   // weicher Anschlag der Kugel
};

// Kugel trifft die Glocke
let bellT = -1;
bell.addEventListener('collide', (e) => {
  if (!e.body.ball || !audio.on || simTime - bellT < 0.15) return;
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
  if (v < 0.2) return;
  bellT = simTime;
  play('bell', Math.min(1, 0.35 + v / 3), 0.97 + Math.random() * 0.06, bell.position);
});
// Wippe schlägt auf ihren Anschlag ('collide' kommt nur beim ersten Kontakt, aber je Kontaktpunkt -> Sperrzeit)
let switchT = -1;
rocker.addEventListener('collide', (e) => {
  if (e.body.ball || !audio.on || simTime - switchT < 0.2) return;
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
  if (v > 0.1) { switchT = simTime; play('switch', Math.min(1, v / 1.5), 1, rocker.position); }
});

// Nach jedem Physikschritt (vor der Schienenführung):
//  - welche Kugeln liegen auf (Rollgeräusch nur bei Kontakt)
//  - Stösse erkennen an der sprunghaften Geschwindigkeitsänderung der Kugel. Die 'collide'-Events von cannon-es
//    taugen dafür nicht: sie feuern bei jedem Übergang auf ein neues Bahnsegment.
const _dv = new CANNON.Vec3();
function audioContacts() {
  simTime += H;
  if (!audio.on) return;
  for (const c of world.contacts) {
    const a = c.bi.ball, b = c.bj.ball;
    if (a && b) { a.hitBall = b; b.hitBall = a; continue; }
    if (a) { a.touchT = simTime; a.hitBody = c.bj; if (c.bj === tray) a.trayT = simTime; if (woodBodies.has(c.bj)) a.woodT = simTime; }
    if (b) { b.touchT = simTime; b.hitBody = c.bi; if (c.bi === tray) b.trayT = simTime; if (woodBodies.has(c.bi)) b.woodT = simTime; }
  }
  for (const ball of balls) {
    const b = ball.body, pv = ball.pv ||= b.velocity.clone();
    b.velocity.vsub(pv, _dv);
    _dv.y += 9.81 * H;   // Schwerkraft-Anteil herausrechnen
    const dv = _dv.length(), jumped = ball.pp && b.position.distanceTo(ball.pp) > 0.5;   // Respawn
    pv.copy(b.velocity);
    (ball.pp ||= b.position.clone()).copy(b.position);
    const other = ball.hitBall, body = ball.hitBody;
    ball.hitBall = ball.hitBody = undefined;
    if (ball.held || ball.rail !== undefined || jumped || simTime - (ball.hitT ?? -1) < 0.12) continue;
    if (other && dv > 0.4) {
      if (other.hitT === simTime) continue;   // Paar nur einmal vertonen
      ball.hitT = simTime;
      play(CLICKS[(Math.random() * 3) | 0], Math.min(1, dv / 2.5) * 0.9, 0.9 + Math.random() * 0.25, b.position);
      if (dv > 2.5) play('rattle', Math.min(1, (dv - 2.5) / 3) * 0.5, 1, b.position);
    } else if (body && dv > 0.9) {
      ball.hitT = simTime;
      play('impact', Math.min(1, (dv - 0.6) / 3.5) * 0.9, (body === rocker ? 1.3 : woodBodies.has(body) ? 0.55 : 0.85) + Math.random() * 0.3, b.position);   // Holz klingt dumpfer
    }
  }
}

// Pro Frame: Roll-Schleifen und Liftmotor nachführen
const _rv = new CANNON.Vec3();
function audioUpdate() {
  if (!audio.on || !audio.ready) return;
  const t = audio.ctx.currentTime;
  for (const ball of balls) {
    let v = audio.voices.get(ball);
    if (!v) audio.voices.set(ball, v = { a: loopVoice('roll_acrylic'), r: loopVoice('roll_rail') });
    const b = ball.body;
    // im Lift zählt nur die Bewegung relativ zur Schale
    const onTray = simTime - (ball.trayT ?? -1) < 0.06;
    const sp = onTray ? (b.velocity.vsub(tray.velocity, _rv), _rv.length()) : b.velocity.length();
    const onRail = ball.rail !== undefined;
    const touching = !ball.held && (onRail || simTime - (ball.touchT ?? -1) < 0.06);
    const { k, pan } = spatial(b.position);
    const lvl = touching ? Math.min(1, sp / 5) ** 1.3 * k : 0;
    const rate = 0.65 + Math.min(sp, 8) * 0.11;
    const onWood = simTime - (ball.woodT ?? -1) < 0.06;   // auf Holz: dumpfer und leiser
    setVoice(v.a, onRail ? 0 : lvl * (onWood ? 0.35 : 0.55), rate * (onWood ? 0.6 : 1), pan, t);
    setVoice(v.r, onRail ? lvl * 0.45 : 0, rate * 0.9, pan, t);
  }
  for (const [ball, v] of audio.voices) {
    if (!balls.includes(ball)) { stopVoice(v.a); stopVoice(v.r); audio.voices.delete(ball); }
  }
  const moving = lift.ph !== 'load' && lift.ph !== 'dump';
  const m = spatial(tray.position);
  setVoice(audio.motor, moving ? 0.3 * m.k : 0, lift.ph === 'up' ? 0.95 : 1.08, m.pan, t);   // bergauf mit Last etwas tiefer
}

export { audio, audioSuspend, toggleSound, play, audioContacts, audioUpdate };
