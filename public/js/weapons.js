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
];

export function damageAt(w, head, dist) {
  let d = head ? w.head : w.body;
  if (w.falloff && dist > w.falloff) d *= Math.max(0.3, 1 - (dist - w.falloff) / 25);
  return Math.round(d);
}
