import './boot.js'; // först: lägger in spelvärdena från servern innan något annat laddas
import * as THREE from 'three';
import { G, remotes } from './state.js';
import { INTERP_MS, composer, effects, pads } from './core.js';
import { updateDamageNumbers, updateHud } from './hud.js';
import { initMenu, showMenu } from './menu.js';
import { initInput } from './input.js';
import { menuCamera, updateLocal } from './local.js';
import { updatePractice, updatePracticeHud } from './practice.js';

// ---------- loop ----------
export const clock = new THREE.Clock();
export function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (G.practice) { updatePractice(dt, now); updatePracticeHud(); }
  if (G.playing) updateLocal(dt, now);
  else menuCamera(dt);
  const rt = G.serverOffset === null ? 0 : now + G.serverOffset - INTERP_MS;
  for (const r of remotes.values()) r.update(rt, dt);
  effects.update(dt);
  pads.update(dt, now);
  updateDamageNumbers(dt);
  updateHud(now);
  composer.render();
}
initMenu();
initInput();
showMenu(true);
frame();
