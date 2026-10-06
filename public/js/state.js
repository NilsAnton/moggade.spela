import { CHARACTERS } from './characters.js';
import { WEAPONS } from './weapons.js';

import { COLORS } from './progress.js';

export { COLORS };

// ---------- inställningar ----------
export const CROSS_COLORS = ['#ffffff', '#19e3ff', '#80ed99', '#ffd23f', '#ff4d6d', '#ff2bd6'];
export const settings = {
  name: '', color: COLORS[Math.floor(Math.random() * 4)], title: '', sens: 1, vol: 0.7, char: 0,
  fov: 75, cross: CROSS_COLORS[0], crossSize: 1, fullscreen: true, adsSens: 1, // adsSens = känslighet när du siktar/kikar (1 = 100 %)
  skins: {}, // vapen-id -> skin-id (se skins.js); skins.gloves = handskar
};
try { Object.assign(settings, JSON.parse(localStorage.getItem('moggade') || '{}')); } catch {}
if (!CHARACTERS[settings.char]) settings.char = 0;
export const saveSettings = () => { try { localStorage.setItem('moggade', JSON.stringify(settings)); } catch {} };
// ---------- spelstatus ----------
export const G = {
  C: CHARACTERS[settings.char], W: null, mode: 'ffa', practice: false,
  ws: null, playing: false, locked: false, roundOver: false, killLimit: 25, chatOpen: false,
  jumpQueued: false, myVote: -1, myLevel: 0, voteMaps: [], votes: [],
  serverOffset: null, roundEndAt: 0, roundDeadline: 0, deathAt: 0, killerId: null,
  firing: false, ads: false, lookDX: 0, lookDY: 0,
  eyeY: null, bobT: 0, stepT: 0, lastSend: 0, flashT: 0, shake: 0, menuAngle: 0, scoped: false,
  radarUntil: 0, armorUntil: 0, fovPunch: 0, heartT: 0, roundXp: 0,
  mapIndex: -1, solids: [],
  slot: 0, primaryW: null, slotGun: [null, null], heroOpen: false,
};
G.W = WEAPONS[G.C.weapon];
G.primaryW = G.W;

export const me = {
  id: null, p: [0, 0, 0], v: [0, 0, 0], ground: false, yaw: 0, pitch: 0, hp: 100, maxHp: 100, alive: false, sp: 0,
  protect: false, sprint: false, streak: 0,
  slideT: 0, slideCd: 0, dashT: 0, slamArmed: false, abilityReady: 0,
};
export const gun = { ammo: G.W.mag, lastShot: 0, reloading: false, reloadStart: 0, reloadEnd: 0, bloom: 0, recoil: 0, trigger: true };
export const remotes = new Map();
export const roster = new Map();
export const killTimes = [];
export const keys = {};
