// Banor – delas mellan klient och server. Servern roterar mellan dem efter varje runda.
// Varje låda: p = mittpunkt, s = storlek, m = material, solid = kollision, c = neonfärg.

function builder() {
  const boxes = [];
  // y är lådans undersida
  const add = (x, y, z, w, h, d, m = 'concrete', extra = {}) =>
    boxes.push({ p: [x, y + h / 2, z], s: [w, h, d], m, solid: m !== 'neon', ...extra });
  // Samma sak fyra gånger, roterat 90° runt mitten – rättvist för FFA.
  const add4 = (x, y, z, w, h, d, m, extra) => {
    add(x, y, z, w, h, d, m, extra);
    add(-z, y, x, d, h, w, m, extra);
    add(-x, y, -z, w, h, d, m, extra);
    add(z, y, -x, d, h, w, m, extra);
  };
  return { boxes, add, add4 };
}

const rot4 = ([x, y, z]) => [[x, y, z], [-z, y, x], [-x, y, -z], [z, y, -x]];

// ---------- Skymning: arena i solnedgång ----------
function skymning() {
  const { boxes, add, add4 } = builder();
  add(0, -1, 0, 72, 1, 72, 'ground');
  add4(0, 0, -32, 66, 6, 2, 'wall');
  add4(0, 6, -32, 66, 0.3, 2.4, 'metal');
  add4(-14, 3.2, -30.96, 8, 0.1, 0.06, 'neon', { c: '#19e3ff' });

  add(0, 0, 0, 8, 2, 8, 'metal');
  for (let k = 0; k < 3; k++) add4(0, 0, -(4.4 + 0.8 * k), 3, (3 - k) * 0.5, 0.8, 'concrete');
  add4(0, 1.92, -4.02, 8, 0.06, 0.04, 'neon', { c: '#19e3ff' });
  add4(-2.8, 2, -2.8, 1.2, 1.2, 1.2, 'crate');

  add4(-22, 0, -22, 6, 3, 6, 'concrete');
  add4(-24.85, 3, -22, 0.3, 0.9, 6, 'metal');
  add4(-22, 3, -24.85, 6, 0.9, 0.3, 'metal');
  for (let k = 0; k < 6; k++) add4(-18.6 + 0.8 * k, 0, -24, 0.8, (6 - k) * 0.5, 2, 'concrete');

  add4(-10, 0, -14, 8, 1.1, 0.6, 'concrete');
  add4(0, 0, -18, 4, 1.1, 0.6, 'concrete');
  add4(-12, 0, -4, 1.2, 6, 1.2, 'concrete');
  add4(-12, 2.5, -4, 1.24, 0.06, 1.24, 'neon', { c: '#ffb020' });
  add4(8, 0, -8, 1.5, 1.5, 1.5, 'crate');
  add4(8.2, 1.5, -8.1, 1.1, 1.1, 1.1, 'crate');
  add4(-6, 0, -20, 1.5, 1.5, 1.5, 'crate');
  add4(-4.4, 0, -20.3, 1.2, 1.2, 1.2, 'crate');
  add4(14, 0, -24, 2, 2, 2, 'crate');
  add4(24, 0, -4, 2.6, 2.6, 6, 'container');

  return {
    name: 'SKYMNING',
    bounds: 31,
    boxes,
    spawns: [...rot4([0, 0, -26]), ...rot4([-16, 0, 8]), ...rot4([-22, 3, -21])],
    theme: {
      sky: { top: '#0d1638', mid: '#47387a', horizon: '#ff8a5c', bottom: '#241a2e' },
      fog: '#a0607a', fogNear: 30, fogFar: 210,
      sun: '#ffbf8a', sunIntensity: 3.2, sunDir: [0.5, 0.58, -0.42],
      hemiSky: '#8ea2ff', hemiGround: '#5a3e44', hemi: 1.1,
      windows: 0.9, exposure: 1.05,
    },
  };
}

// ---------- Hamnen: containerhamn i dagsljus ----------
function hamnen() {
  const { boxes, add, add4 } = builder();
  add(0, -1, 0, 72, 1, 72, 'ground');
  add4(0, 0, -32, 66, 5, 2, 'wall');
  add4(0, 5, -32, 66, 0.3, 2.4, 'metal');

  // Lagerbyggnad i mitten med dörröppningar
  add4(-3.6, 0, -6, 4.8, 4, 0.4, 'concrete');
  add4(3.6, 0, -6, 4.8, 4, 0.4, 'concrete');
  add4(0, 3, -6, 2.4, 1, 0.4, 'concrete');
  add(0, 0, 0, 1.5, 1.5, 1.5, 'crate');
  add4(-4.5, 0, -4.5, 1.2, 1.2, 1.2, 'crate');
  add4(0, 3.6, -5.82, 1.6, 0.06, 0.04, 'neon', { c: '#ffb020' });

  // Containrar
  add4(-18, 0, -18, 6, 2.6, 2.6, 'container');
  for (let k = 0; k < 5; k++) add4(-14.6 + 0.8 * k, 0, -18, 0.8, (5 - k) * 0.52, 2.6, 'metal');
  add4(-22, 0, -4, 2.6, 2.6, 6, 'container2');
  add4(-10, 0, -24, 6, 2.6, 2.6, 'container2');
  add4(-6, 0, -16, 2.6, 2.6, 6, 'container');
  add4(-26, 0, -12, 2.6, 2.6, 6, 'container');
  add4(-26, 2.6, -12, 2.6, 2.6, 6, 'container2');

  // Lådor och betongbarriärer
  add4(-12, 0, -10, 1.5, 1.5, 1.5, 'crate');
  add4(-12, 1.5, -10, 1.1, 1.1, 1.1, 'crate');
  add4(-14, 0, -2, 0.6, 1.1, 4, 'concrete');
  add4(-2, 0, -26, 1.5, 1.5, 1.5, 'crate');
  add4(-28, 0, -20, 1.2, 1.2, 1.2, 'crate');

  return {
    name: 'HAMNEN',
    bounds: 31,
    boxes,
    spawns: [...rot4([0, 0, -27]), ...rot4([-28, 0, -28]), ...rot4([-14, 0, -14]), ...rot4([-18, 2.6, -18])],
    theme: {
      sky: { top: '#2f6fc4', mid: '#7fb0e6', horizon: '#dce7f1', bottom: '#5d6670' },
      fog: '#c3d1de', fogNear: 45, fogFar: 260,
      sun: '#fff1da', sunIntensity: 3.6, sunDir: [0.35, 0.82, 0.45],
      hemiSky: '#cfe3ff', hemiGround: '#6b5e50', hemi: 1.3,
      windows: 0.12, exposure: 0.95,
    },
  };
}

// ---------- Skjutbanan: övningsläge, körs bara lokalt ----------
function skjutbanan() {
  const { boxes, add } = builder();
  add(0, -1, 0, 80, 1, 130, 'ground');
  add(0, 0, -62, 80, 6, 2, 'wall');
  add(0, 0, 62, 80, 6, 2, 'wall');
  add(-40, 0, 0, 2, 6, 126, 'wall');
  add(40, 0, 0, 2, 6, 126, 'wall');

  // Skjutbås: låg disk med tak
  add(-6, 0, 38, 24, 1.1, 0.5, 'concrete');
  add(-6, 4, 41, 26, 0.3, 8, 'metal');
  for (const x of [-18.5, 6.5]) add(x, 0, 41, 0.4, 4, 0.4, 'metal');
  add(-6, 3.95, 37.2, 24, 0.05, 0.04, 'neon', { c: '#ffb020' });

  // Avståndsskyltar (10, 25, 50, 75 m från disken)
  for (const d of [10, 25, 50, 75]) {
    const z = 38 - d;
    add(-19, 0, z, 0.3, 2.5, 0.3, 'metal');
    add(-19, 2.5, z, 2.2, 1, 0.2, 'concrete');
    add(-19, 3.55, z + 0.11, 2.2, 0.06, 0.03, 'neon', { c: '#19e3ff' });
    add(-6, 0.01, z, 26, 0.02, 0.15, 'neon', { c: '#2a5a70' });
  }
  // Skydd ute på banan
  add(-12, 0, 8, 3, 1.1, 0.6, 'concrete');
  add(0, 0, -2, 3, 1.1, 0.6, 'concrete');
  add(-10, 0, -25, 1.5, 1.5, 1.5, 'crate');

  // Parkour-del till höger
  add(26, 0, 30, 1.5, 1.2, 1.5, 'crate');
  add(30, 0, 24, 2, 2.4, 2, 'crate');
  add(26, 0, 16, 2.6, 2.6, 6, 'container');
  add(33, 0, 8, 2.6, 2.6, 6, 'container2');
  add(33, 2.6, 8, 2.6, 2.6, 6, 'container');
  add(24, 0, 0, 6, 3, 6, 'concrete');
  for (let k = 0; k < 6; k++) add(24, 0, 3.4 + 0.8 * k, 3, (6 - k) * 0.5, 0.8, 'concrete');
  add(30, 0, -12, 8, 0.6, 0.6, 'concrete');
  add(22, 0, -20, 0.6, 1.1, 8, 'concrete');
  add(30, 0, -30, 6, 5, 6, 'concrete');
  add(18, 0, 20, 0.4, 6, 50, 'wall');

  return {
    name: 'SKJUTBANAN',
    bounds: 60,
    boxes,
    spawns: [[-6, 0, 42]],
    dummies: [
      { p: [-10, 0, 28] }, { p: [-2, 0, 28] },
      { p: [-14, 0, 13], move: 4, speed: 2.2 }, { p: [0, 0, 13] },
      { p: [-6, 0, -12], move: 6, speed: 4.5 }, { p: [-14, 0, -12] },
      { p: [-6, 0, -37], move: 5, speed: 3 }, { p: [2, 0, -37] },
      { p: [-10, 0, 20], move: 3, speed: 7, strafe: true },
    ],
    theme: {
      sky: { top: '#3a6fb8', mid: '#86ade0', horizon: '#e9d9c4', bottom: '#5d6670' },
      fog: '#cfc9c0', fogNear: 60, fogFar: 300,
      sun: '#fff0d8', sunIntensity: 3.4, sunDir: [-0.4, 0.75, 0.5],
      hemiSky: '#cfe3ff', hemiGround: '#6b5e50', hemi: 1.3,
      windows: 0.12, exposure: 0.95,
    },
  };
}

export const MAPS = [skymning(), hamnen()];
export const RANGE = skjutbanan();
