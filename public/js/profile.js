// Spelarprofil: XP, nivå, rang och livstidsstatistik. Sparas lokalt i webbläsaren.
const KEY = 'moggade-profile';

export const RANKS = ['REKRYT', 'MENIG', 'KORPRAL', 'SERGEANT', 'FÄNRIK', 'LÖJTNANT', 'KAPTEN', 'MAJOR', 'ÖVERSTE', 'GENERAL', 'MOGGAD LEGEND'];

// XP-belöningar
export const XP = { kill: 100, head: 40, multi: 50, streak: 25, win: 500, round: 150, level: 60, assistDmg: 0.5 };

// Färger (index i COLORS) och vilken nivå som låser upp dem
export const COLOR_UNLOCK = [1, 1, 1, 1, 3, 6, 10, 15];

const fresh = () => ({ xp: 0, kills: 0, deaths: 0, heads: 0, wins: 0, games: 0, bestStreak: 0, shots: 0, hits: 0, dmg: 0 });

export const profile = fresh();
try { Object.assign(profile, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

export function saveProfile() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
}

// XP som krävs för att gå från nivå n till n+1
export const xpFor = (n) => 400 + n * 200;

export function levelInfo(xp = profile.xp) {
  let lvl = 1, left = xp;
  while (left >= xpFor(lvl)) { left -= xpFor(lvl); lvl++; }
  return { lvl, cur: left, need: xpFor(lvl), rank: rankName(lvl) };
}

export function rankName(lvl) {
  return RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 5))];
}

// Ger XP och returnerar { gained, levelUp, info }
export function addXp(amount) {
  const before = levelInfo().lvl;
  profile.xp += Math.max(0, Math.round(amount));
  saveProfile();
  const info = levelInfo();
  return { gained: amount, levelUp: info.lvl > before ? info.lvl : 0, info };
}
