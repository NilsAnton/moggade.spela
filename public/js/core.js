import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSolids } from './physics.js';
import { MAPS, RANGE } from './maps.js';
import { WEAPONS } from './weapons.js';
import { CHARACTERS } from './characters.js';
import { buildWorld } from './world.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';
import { Weapon } from './weapon.js';
import { Pads } from './pads.js';
import { G, settings } from './state.js';


export const WALK = 5.6, SPRINT = 8.8, ADS_SPEED = 3.4;
export const SEND_MS = 33, INTERP_MS = 100;
export const STREAKS = { 3: 'PÅ GÅNG', 5: 'DOMINERAR', 7: 'OSTOPPBAR', 10: 'GUDALIK', 15: 'LEGENDARISK' };
export const MULTI = { 2: 'DUBBELKILL', 3: 'TRIPPELKILL', 4: 'MEGAKILL', 5: 'MONSTERKILL' };

export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// ---------- rendering ----------
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.02, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const pr = renderer.getPixelRatio();
export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, {
  type: THREE.HalfFloatType, samples: 4,
}));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.4, 0.95));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

export const pads = new Pads(scene);
export let disposeWorld = null;
export function loadMap(i) {
  if (i === G.mapIndex) return;
  disposeWorld?.();
  G.mapIndex = i;
  const def = i === 'range' ? RANGE : MAPS[i];
  disposeWorld = buildWorld(scene, renderer, def);
  G.solids = makeSolids(def.boxes);
  pads.build(def.pads);
}
loadMap(0);

export const effects = new Effects(scene);
export const sound = new Sound();
sound.setVolume(settings.vol);
export const weapon = new Weapon(camera, settings.color);
weapon.setGloves(settings.skins?.gloves);
weapon.setType(WEAPONS[CHARACTERS[settings.char].weapon].id);
export const flashLight = new THREE.PointLight('#ffb060', 0, 10, 2);
flashLight.position.set(0.1, -0.05, -0.6);
camera.add(flashLight);
