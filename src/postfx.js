// Nachbearbeitung: Kontaktschatten (GTAO), Leuchten (Bloom), Ausgabe
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera } from './core.js';

// Kontaktschatten (GTAO). Mehrfach-Abtastung im Ziel, sonst fehlt die Kantenglättung.
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
// Leuchten der LEDs: nur sehr helle Pixel (über 1.0 im linearen Farbraum) strahlen über, im LED-Modus aktiv
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 1.1);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());

export { composer, bloom };
