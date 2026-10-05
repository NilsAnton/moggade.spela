// Banan "Skymning" – delas mellan klient och server.
// Varje låda: p = mittpunkt, s = storlek, m = material, solid = kollision, c = neonfärg.

const CYAN = '#19e3ff';
const PINK = '#ff2bd6';
const AMBER = '#ffb020';

const boxes = [];

// y är lådans undersida
function add(x, y, z, w, h, d, m = 'concrete', extra = {}) {
  boxes.push({ p: [x, y + h / 2, z], s: [w, h, d], m, solid: m !== 'neon', ...extra });
}

// Lägger ut samma sak fyra gånger, roterat 90° runt mitten – ger en rättvis FFA-bana.
function add4(x, y, z, w, h, d, m, extra) {
  add(x, y, z, w, h, d, m, extra);
  add(-z, y, x, d, h, w, m, extra);
  add(-x, y, -z, w, h, d, m, extra);
  add(z, y, -x, d, h, w, m, extra);
}

const rot4 = ([x, y, z]) => [[x, y, z], [-z, y, x], [-x, y, -z], [z, y, -x]];

// Mark och ytterväggar
add(0, -1, 0, 72, 1, 72, 'ground');
add4(0, 0, -32, 66, 6, 2, 'wall');
add4(0, 6, -32, 66, 0.3, 2.4, 'metal');
add4(-14, 3.2, -30.96, 8, 0.12, 0.08, 'neon', { c: CYAN });
add4(14, 3.2, -30.96, 8, 0.12, 0.08, 'neon', { c: PINK });

// Mittplattform med trappor åt fyra håll
add(0, 0, 0, 8, 2, 8, 'metal');
for (let k = 0; k < 3; k++) add4(0, 0, -(4.4 + 0.8 * k), 3, (3 - k) * 0.5, 0.8, 'concrete');
add4(0, 1.9, -4.03, 8, 0.1, 0.06, 'neon', { c: CYAN });
add4(-2.8, 2, -2.8, 1.2, 1.2, 1.2, 'crate');

// Torn i hörnen med trappa
add4(-22, 0, -22, 6, 3, 6, 'concrete');
add4(-22, 2.9, -18.97, 6, 0.1, 0.06, 'neon', { c: PINK });
add4(-24.85, 3, -22, 0.3, 0.9, 6, 'metal');
add4(-22, 3, -24.85, 6, 0.9, 0.3, 'metal');
for (let k = 0; k < 6; k++) add4(-18.6 + 0.8 * k, 0, -24, 0.8, (6 - k) * 0.5, 2, 'concrete');

// Skydd
add4(-10, 0, -14, 8, 1.1, 0.6, 'concrete');
add4(0, 0, -18, 4, 1.1, 0.6, 'concrete');
add4(-12, 0, -4, 1.2, 6, 1.2, 'concrete');
add4(-12, 2.5, -4, 1.26, 0.1, 1.26, 'neon', { c: AMBER });
add4(8, 0, -8, 1.5, 1.5, 1.5, 'crate');
add4(8.2, 1.5, -8.1, 1.1, 1.1, 1.1, 'crate');
add4(-6, 0, -20, 1.5, 1.5, 1.5, 'crate');
add4(-4.4, 0, -20.3, 1.2, 1.2, 1.2, 'crate');
add4(14, 0, -24, 2, 2, 2, 'crate');
add4(24, 0, -4, 2.6, 2.6, 6, 'container');

export const MAP = boxes;
export const SPAWNS = [...rot4([0, 0, -26]), ...rot4([-16, 0, 8]), ...rot4([-22, 3, -21])];
export const BOUNDS = 31;
