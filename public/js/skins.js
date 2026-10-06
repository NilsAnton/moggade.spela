// Skins – hur vapnen ser ut. Lägg till nya skins i listan för vapnet; den första är standard.
//
//   id      unikt namn, t.ex. 'm9-fade'
//   name    det som visas för spelaren
//   model   (bara kniv) vilken knivmodell: 'm9' (fler modeller läggs till i weapon.js → KNIVES)
//   colors  färger som ersätter standardfärgerna. Allt du inte anger behåller standardfärgen:
//             metal  stomme och pipa        poly   plast och grepp      wood  trädelar
//             blade  knivblad               handle knivskaft
//   finish  (valfritt) { metalness, roughness } för metalldelarna/bladet, t.ex. blankare eller mattare
//
// Exempel på ett nytt skin:
//   { id: 'm9-guld', name: 'M9 Bayonett | Guld', model: 'm9',
//     colors: { blade: '#d4a73a', handle: '#2a1c0c' }, finish: { metalness: 1, roughness: 0.18 } },
export const SKINS = {
  rifle: [{ id: 'rifle', name: 'Standard', colors: {} }],
  smg: [{ id: 'smg', name: 'Standard', colors: {} }],
  shotgun: [{ id: 'shotgun', name: 'Standard', colors: {} }],
  sniper: [{ id: 'sniper', name: 'Standard', colors: {} }],
  dmr: [{ id: 'dmr', name: 'Standard', colors: {} }],
  lmg: [{ id: 'lmg', name: 'Standard', colors: {} }],
  knife: [
    { id: 'm9', name: 'M9 Bayonett | Stål', model: 'm9', colors: { blade: '#c9ced6', handle: '#1c1f25' } },
  ],
};

// Handskar – syns på alla vapen. glove = själva handsken, pad = knogskyddet. Den första är standard.
export const GLOVES = [
  { id: 'leather', name: 'Läderhandskar', colors: { glove: '#7a5a3c', pad: '#3a2b1f' } },
];

export function gloveFor(id) {
  return GLOVES.find((g) => g.id === id) ?? GLOVES[0];
}

// Skinet för ett vapen (eller standardskinet om id saknas/är okänt)
export function skinFor(weaponId, skinId) {
  const list = SKINS[weaponId] ?? [];
  return list.find((s) => s.id === skinId) ?? list[0] ?? { id: 'default', name: 'Standard', colors: {} };
}
