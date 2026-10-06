// Vapen – delas mellan klient och server.
export const WEAPONS = [
  {
    id: 'rifle', name: 'AUTOKARBIN', desc: 'Allround. Stabil på alla avstånd.',
    auto: true, fireMs: 100, mag: 30, reloadMs: 1700, body: 22, head: 55, pellets: 1,
    hip: 0.012, adsSpread: 0.002, moveSpread: 0.025, kick: 0.011, adsFov: 55, speed: 1, falloff: 0,
    stats: { dmg: 0.5, rate: 0.7, range: 0.75, mobility: 0.6 },
  },
  {
    id: 'smg', name: 'SMG', desc: 'Snabb och rörlig. Bäst på nära håll.',
    auto: true, fireMs: 65, mag: 35, reloadMs: 1400, body: 14, head: 30, pellets: 1,
    hip: 0.02, adsSpread: 0.009, moveSpread: 0.012, kick: 0.006, adsFov: 62, speed: 1.12, falloff: 0,
    stats: { dmg: 0.32, rate: 1, range: 0.4, mobility: 0.95 },
  },
  {
    id: 'shotgun', name: 'HAGELGEVÄR', desc: 'Förödande nära. Värdelös långt bort.',
    auto: false, fireMs: 800, mag: 6, reloadMs: 2200, body: 13, head: 20, pellets: 9,
    hip: 0.065, adsSpread: 0.05, moveSpread: 0.01, kick: 0.04, adsFov: 65, speed: 1.02, falloff: 12,
    stats: { dmg: 0.95, rate: 0.2, range: 0.15, mobility: 0.7 },
  },
  {
    id: 'sniper', name: 'PRICKSKYTT', desc: 'Ett skott i huvudet räcker. Långsam.',
    auto: false, fireMs: 1300, mag: 5, reloadMs: 2600, body: 80, head: 150, pellets: 1,
    hip: 0.09, adsSpread: 0, moveSpread: 0.04, kick: 0.05, adsFov: 20, speed: 0.92, falloff: 0, scope: true,
    stats: { dmg: 1, rate: 0.1, range: 1, mobility: 0.35 },
  },
  {
    id: 'knife', name: 'KNIV', desc: 'Snabba hugg på nära håll. Alla har den på 2.',
    auto: false, fireMs: 450, mag: Infinity, reloadMs: 0, body: 50, head: 50, pellets: 1, melee: true, range: 2.6,
    hip: 0, adsSpread: 0, moveSpread: 0, kick: 0.01, adsFov: 75, speed: 1.1, falloff: 0,
    stats: { dmg: 1, rate: 0.4, range: 0, mobility: 1 },
  },
  {
    id: 'dmr', name: 'DMR', desc: 'Halvautomatisk precision. Två skott i huvudet.',
    auto: false, fireMs: 240, mag: 12, reloadMs: 2000, body: 38, head: 85, pellets: 1,
    hip: 0.03, adsSpread: 0.0008, moveSpread: 0.03, kick: 0.02, adsFov: 32, speed: 0.97, falloff: 0, scope: 'dmr',
    stats: { dmg: 0.75, rate: 0.35, range: 0.9, mobility: 0.55 },
  },
  {
    id: 'lmg', name: 'KULSPRUTA', desc: 'Enormt magasin. Håll in och regna bly.',
    auto: true, fireMs: 85, mag: 75, reloadMs: 3600, body: 20, head: 44, pellets: 1,
    hip: 0.026, adsSpread: 0.006, moveSpread: 0.035, kick: 0.009, adsFov: 58, speed: 0.9, falloff: 0,
    stats: { dmg: 0.45, rate: 0.85, range: 0.65, mobility: 0.3 },
  },
];

// Gun Game: vapen i ordning och hur många kills varje nivå kräver.
export const GUNGAME = [
  { w: 0, kills: 2 },
  { w: 1, kills: 2 },
  { w: 6, kills: 2 },
  { w: 2, kills: 2 },
  { w: 5, kills: 2 },
  { w: 3, kills: 2 },
  { w: 4, kills: 1 },
];

export function damageAt(w, head, dist) {
  let d = head ? w.head : w.body;
  if (w.falloff && dist > w.falloff) d *= Math.max(0.3, 1 - (dist - w.falloff) / 25);
  return Math.round(d);
}
