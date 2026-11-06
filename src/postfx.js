// Nachbearbeitung: Kontaktschatten (GTAO), Tiefenschärfe (Bokeh), Ausgabe
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera, controls } from './core.js';

// Kontaktschatten (GTAO) und Tiefenschärfe (Bokeh). Mehrfach-Abtastung im Ziel, sonst fehlt die Kantenglättung.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 0.6, scale: 1.2, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.9;
// Acryl ist durchsichtig und soll keine Verdeckung erzeugen: für den Normalen/Tiefen-Durchgang ausblenden
const gtaoHide = gtao.overrideVisibility.bind(gtao);
gtao.overrideVisibility = () => {
  gtaoHide();
  scene.traverse((o) => { if (o.isMesh && o.material.transparent) o.visible = false; });
};
composer.addPass(gtao);
const bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.0004, maxblur: 0.006 });
bokeh.enabled = false;   // standardmässig aus, per Knopf zuschaltbar
composer.addPass(bokeh);
composer.addPass(new OutputPass());
let focusDist = camera.position.distanceTo(controls.target);
// Autofokus auf den Drehpunkt der Kamera (bzw. die verfolgte Kugel), weich nachgeführt
function updateFocus() {
  focusDist += (camera.position.distanceTo(controls.target) - focusDist) * 0.1;
  bokeh.uniforms.focus.value = focusDist;
}

export { composer, bokeh, updateFocus };
