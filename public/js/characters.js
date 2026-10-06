// Gubbar – delas mellan klient och server. Varje gubbe har ett vapen (index i WEAPONS) och en förmåga på E.
// Alla siffror går att ändra i .env (se config.js).
export const CHARACTERS = [
  {
    id: 'soldier', name: 'SOLDAT', desc: 'Pålitlig allroundsoldat.',
    weapon: 0, hp: 100, speed: 1,
    ability: { id: 'stim', name: 'STIM', desc: '', cooldown: 12000 },
  },
  {
    id: 'runner', name: 'LÖPARE', desc: 'Snabb och svår att träffa.',
    weapon: 1, hp: 85, speed: 1.12,
    ability: { id: 'dash', name: 'DASH', desc: '', cooldown: 2500 },
  },
  {
    id: 'tank', name: 'TANK', desc: 'Tål mycket. Krossar allt på nära håll.',
    weapon: 2, hp: 150, speed: 0.9,
    ability: { id: 'slam', name: 'MARKSTÖT', desc: '', cooldown: 7000 },
  },
  {
    id: 'sniper', name: 'SKYTT', desc: 'Tar höjd och plockar folk på avstånd.',
    weapon: 3, hp: 90, speed: 0.95,
    ability: { id: 'leap', name: 'SUPERHOPP', desc: '', cooldown: 5000 },
  },
  {
    id: 'scout', name: 'SPANARE', desc: 'Ser allt. Straffar den som syns.',
    weapon: 5, hp: 95, speed: 1.02,
    ability: { id: 'radar', name: 'RADAR', desc: '', cooldown: 15000 },
  },
  {
    id: 'fortress', name: 'FÄSTNING', desc: 'Står kvar när alla andra faller.',
    weapon: 6, hp: 120, speed: 0.92,
    ability: { id: 'armor', name: 'PANSAR', desc: '', cooldown: 14000 },
  },
];

// Förmågornas värden
export const SLAM = { radius: 5, damage: 50 };
export const ARMOR = { ms: 4000, factor: 0.5 };
export const ABILITY = {
  stimHp: 40, // HP som stim ger tillbaka
  radarMs: 4000, // hur länge radarn visar fiender
  dashSpeed: 22, // fart (m/s) i dashen
  leapPower: 13.5, // hur högt superhoppet går (hopp är 7.6)
};

const sec = (ms) => `${Math.round(ms / 100) / 10} s`.replace('.', ',');

// Beskrivningarna byggs från siffrorna, så att menyn alltid stämmer med inställningarna
export function describeAbilities() {
  const d = {
    stim: `Få tillbaka ${ABILITY.stimHp} HP direkt`,
    dash: 'Kasta dig framåt i full fart',
    slam: `Hoppa och slå ner – upp till ${SLAM.damage} skada runt dig`,
    leap: 'Hoppa upp på tak och containrar',
    radar: `Se alla fiender genom väggar i ${sec(ABILITY.radarMs)}`,
    armor: `Ta bara ${Math.round(ARMOR.factor * 100)} % skada i ${sec(ARMOR.ms)}`,
  };
  for (const ch of CHARACTERS) ch.ability.desc = d[ch.ability.id] ?? ch.ability.desc;
}
describeAbilities();
