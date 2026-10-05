// Gubbar – delas mellan klient och server. Varje gubbe har ett vapen (index i WEAPONS) och en förmåga på E.
export const CHARACTERS = [
  {
    id: 'soldier', name: 'SOLDAT', desc: 'Pålitlig allroundsoldat.',
    weapon: 0, hp: 100, speed: 1,
    ability: { id: 'stim', name: 'STIM', desc: 'Få tillbaka 40 HP direkt', cooldown: 12000 },
  },
  {
    id: 'runner', name: 'LÖPARE', desc: 'Snabb och svår att träffa. Dubbelhopp.',
    weapon: 1, hp: 85, speed: 1.12, doubleJump: true,
    ability: { id: 'dash', name: 'DASH', desc: 'Kasta dig framåt i full fart', cooldown: 2500 },
  },
  {
    id: 'tank', name: 'TANK', desc: 'Tål mycket. Krossar allt på nära håll.',
    weapon: 2, hp: 150, speed: 0.9,
    ability: { id: 'slam', name: 'MARKSTÖT', desc: 'Hoppa och slå ner – skadar alla runt dig', cooldown: 7000 },
  },
  {
    id: 'sniper', name: 'SKYTT', desc: 'Tar höjd och plockar folk på avstånd.',
    weapon: 3, hp: 90, speed: 0.95,
    ability: { id: 'leap', name: 'SUPERHOPP', desc: 'Hoppa upp på tak och containrar', cooldown: 5000 },
  },
];

export const SLAM = { radius: 5, damage: 50 };
export const STIM_HP = 40;
