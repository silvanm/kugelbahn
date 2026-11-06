// Materialien: Acryl (mit Gebrauchsspuren), Metalle, Kunststoffe
import * as THREE from 'three';

// Acrylglas für die Bahnen (kein Transmission-Pass, sonst wären die Glaskugeln dahinter unsichtbar).
// Fresnel: frontal fast klar, unter flachem Winkel stark spiegelnd. Die Spiegelung wird NICHT mit der
// Transparenz abgeschwächt (vormultiplizierte Ausgabe: Körperfarbe * alpha + volle Spiegelung).
const ACR_NOISE = `
  float acrHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float acrNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(acrHash(i), acrHash(i + vec3(1,0,0)), f.x), mix(acrHash(i + vec3(0,1,0)), acrHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(acrHash(i + vec3(0,0,1)), acrHash(i + vec3(1,0,1)), f.x), mix(acrHash(i + vec3(0,1,1)), acrHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;
const acrylic = (color, aMin = 0.06, aMax = 0.75) => {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.aMin = { value: aMin };
    sh.uniforms.aMax = { value: aMax };
    sh.vertexShader = 'varying vec3 vAcrW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvAcrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float aMin;\nuniform float aMax;\nvarying vec3 vAcrW;\n' + ACR_NOISE + sh.fragmentShader
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      // Gebrauchsspuren in Weltkoordinaten (die Bahnteile haben keine UVs):
      // feine Kratzer in drei Richtungen, nur abschnittsweise sichtbar, und Fingerabdrücke als rauere Flecken
      float acrScr = 0.0;
      for (int k = 0; k < 3; k++) {
        vec3 dir = normalize(vec3(sin(float(k) * 2.1 + 0.3), cos(float(k) * 1.7) * 0.6, cos(float(k) * 2.1 + 0.3)));
        float l = dot(vAcrW, dir) * 55.0 + acrNoise(vAcrW * 1.3 + float(k) * 7.0) * 4.0;
        float dl = abs(fract(l) - 0.5);
        float line = 1.0 - smoothstep(0.0, fwidth(l) * 1.2 + 0.015, 0.5 - dl);
        float gate = 0.6 * smoothstep(0.86, 0.93, acrNoise(vAcrW * vec3(9.0, 7.0, 9.0) + float(k) * 31.0));
        acrScr = max(acrScr, line * gate);
      }
      float acrFp = 0.7 * smoothstep(0.7, 0.85, acrNoise(vAcrW * 1.7 + 50.0))
                  * (0.55 + 0.45 * sin(acrNoise(vAcrW * 14.0) * 60.0));
      material.roughness = clamp(material.roughness + acrFp * 0.3 + acrScr * 0.35, 0.0, 1.0);
      #ifdef USE_CLEARCOAT
        material.clearcoatRoughness = clamp(material.clearcoatRoughness + acrFp * 0.35 + acrScr * 0.5, 0.0, 1.0);
      #endif`)
      .replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - clamp(abs(dot(normal, geometryViewDir)), 0.0, 1.0), 3.0);
      float acrA = mix(aMin, aMax, fres) + acrFp * 0.015 + acrScr * 0.03;
      vec3 acrSpec = totalSpecular;
      #ifdef USE_CLEARCOAT
        acrSpec += (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;
      #endif
      acrSpec += vec3(acrScr * 0.02 + acrFp * 0.005);   // Kratzer und Fett streuen etwas Licht
      gl_FragColor = vec4(totalDiffuse * acrA + acrSpec, acrA);`);
  };
  return m;
};
const plasticMat = acrylic(0x9fc4d8, 0.08, 0.8);
// Opal-Acryl (durchgefärbt, undurchsichtig) für den Boden der Sammelrinne, damit die flache Rampe gut sichtbar ist
const opalMat = new THREE.MeshPhysicalMaterial({ color: 0xe9eef2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.3, sheenColor: 0xffffff, envMapIntensity: 1.2 });
// Schatten von Acryl: zufällig ausgedünnte Tiefenwerte -> mit dem weichen Schattenfilter ein heller, durchscheinender Schatten
const acrylicDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaHash: true });
acrylicDepth.onBeforeCompile = (sh) => {   // three.js setzt die Deckkraft nur bei BasicDepthPacking -> hier selbst vorgeben
  sh.fragmentShader = 'const float acrShadow = 0.15;\n' + sh.fragmentShader.replace('#include <alphahash_fragment>', 'diffuseColor.a = acrShadow;\n#include <alphahash_fragment>');
};
// Kanten aus dickem Acryl leiten Licht und leuchten hell auf – mit dem typischen grünlichen Stich
const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0xcdf0dc, emissive: 0x24503a, roughness: 0.05, clearcoat: 1, envMapIntensity: 2, transparent: true, opacity: 0.9 });

const railMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.5 });   // anthrazit
const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 });
const liftMat = new THREE.MeshStandardMaterial({ color: 0xd9a521, metalness: 0.3, roughness: 0.35 });
const gateMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.4 });
const troughMat = acrylic(0xb8d8e8);
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb08d3c, metalness: 0.7, roughness: 0.3 });
const funnelMat = acrylic(0x56b3b8, 0.1, 0.8);
const wireMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dc, metalness: 0.9, roughness: 0.2 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
const alu = new THREE.MeshStandardMaterial({ color: 0xc4c9cf, metalness: 0.85, roughness: 0.32 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.4, roughness: 0.5 });

export { acrylic, plasticMat, opalMat, acrylicDepth, edgeMat, railMat, steelMat, liftMat, gateMat, troughMat, rimMat, funnelMat, wireMat, brassMat, alu, darkMat };
