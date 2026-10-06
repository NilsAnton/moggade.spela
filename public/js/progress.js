// Progression – delas mellan klient och server: XP, nivåer, rang och belöningar.
// Servern räknar all XP. Klienten visar bara det servern skickar.

export const RANKS = ['REKRYT', 'MENIG', 'KORPRAL', 'SERGEANT', 'FÄNRIK', 'LÖJTNANT', 'KAPTEN', 'MAJOR', 'ÖVERSTE', 'GENERAL', 'LOCKDOWN-LEGEND'];

// XP-belöningar
export const XP = { kill: 100, head: 40, multi: 50, streak: 25, win: 500, round: 150, level: 60 };

// XP som krävs för att gå från nivå n till n+1
export const xpFor = (n) => 400 + n * 200;

export function levelInfo(xp = 0) {
  let lvl = 1, left = xp;
  while (left >= xpFor(lvl)) { left -= xpFor(lvl); lvl++; }
  return { lvl, cur: left, need: xpFor(lvl), rank: rankName(lvl) };
}

export function rankName(lvl) {
  return RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 5))];
}

// ---------- belöningar ----------
// Lägg till nya här. type: 'color' (din färg) eller 'title' (visas efter ditt namn på poängtavlan).
export const REWARDS = [
  { id: 'c-red', type: 'color', lvl: 1, value: '#ff4d6d', name: 'Röd' },
  { id: 'c-yellow', type: 'color', lvl: 1, value: '#ffb703', name: 'Gul' },
  { id: 'c-blue', type: 'color', lvl: 1, value: '#4cc9f0', name: 'Blå' },
  { id: 'c-green', type: 'color', lvl: 1, value: '#80ed99', name: 'Grön' },
  { id: 'c-purple', type: 'color', lvl: 3, value: '#c77dff', name: 'Lila' },
  { id: 'c-pink', type: 'color', lvl: 6, value: '#ff8fab', name: 'Rosa' },
  { id: 'c-orange', type: 'color', lvl: 10, value: '#f77f00', name: 'Orange' },
  { id: 'c-white', type: 'color', lvl: 15, value: '#e9ecef', name: 'Vit' },

  { id: 't-none', type: 'title', lvl: 1, value: '', name: 'Ingen titel' },
  { id: 't-rookie', type: 'title', lvl: 2, value: 'Nykomling', name: 'Nykomling' },
  { id: 't-trigger', type: 'title', lvl: 4, value: 'Skjutglad', name: 'Skjutglad' },
  { id: 't-cold', type: 'title', lvl: 7, value: 'Kallblodig', name: 'Kallblodig' },
  { id: 't-hunter', type: 'title', lvl: 12, value: 'Huvudjägare', name: 'Huvudjägare' },
  { id: 't-veteran', type: 'title', lvl: 18, value: 'Veteran', name: 'Veteran' },
  { id: 't-unstoppable', type: 'title', lvl: 25, value: 'Ostoppbar', name: 'Ostoppbar' },
  { id: 't-legend', type: 'title', lvl: 40, value: 'Legend', name: 'Legend' },
];

export const COLORS = REWARDS.filter((r) => r.type === 'color').map((r) => r.value);
export const TITLES = REWARDS.filter((r) => r.type === 'title');

export const hasReward = (type, value, lvl) => REWARDS.some((r) => r.type === type && r.value === value && r.lvl <= lvl);
export const newRewards = (from, to) => REWARDS.filter((r) => r.lvl > from && r.lvl <= to);

// ---------- profil ----------
const FIELDS = ['xp', 'kills', 'deaths', 'heads', 'wins', 'games', 'bestStreak', 'shots', 'hits', 'dmg'];
export const freshProfile = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));

// Tvättar en profil som kommer utifrån (gäst-profil från webbläsaren, gammal sparning)
export function cleanProfile(o) {
  const p = freshProfile();
  if (o && typeof o === 'object') {
    for (const f of FIELDS) {
      const v = Math.floor(Number(o[f]));
      if (Number.isFinite(v) && v > 0) p[f] = Math.min(v, 1e9);
    }
  }
  return p;
}
