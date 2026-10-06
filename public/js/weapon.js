import * as THREE from 'three';
import { FLASH } from './effects.js';
import { skinFor, gloveFor } from './skins.js';

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.75, roughness: 0.32 });
const poly = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.1, roughness: 0.65 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 });
const lens = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.1 });
const dot = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.1, 0.08) });

// Varje vapen: lista av delar [w, h, d, material, x, y, z, rx?, ry?] + sikteshöjd och mynning.
function redDot(z) {
  return [
    [0.03, 0.02, 0.1, 'metal', 0, 0.055, z + 0.02],
    [0.05, 0.006, 0.014, 'metal', 0, 0.102, z],
    [0.05, 0.006, 0.014, 'metal', 0, 0.065, z],
    [0.006, 0.04, 0.014, 'metal', -0.022, 0.0835, z],
    [0.006, 0.04, 0.014, 'metal', 0.022, 0.0835, z],
    [0.004, 0.004, 0.004, 'dot', 0, 0.0835, z],
  ];
}

const MODELS = {
  rifle: {
    sightY: 0.0835, muzzle: -0.6,
    parts: [
      [0.07, 0.09, 0.42, 'metal', 0, 0, 0],
      [0.075, 0.07, 0.22, 'poly', 0, 0.005, -0.27],
      [0.077, 0.008, 0.18, 'accent', 0, 0.022, -0.27],
      ['barrel', 0.012, 0.18, 'metal', 0, 0.015, -0.46],
      [0.03, 0.03, 0.05, 'metal', 0, 0.015, -0.56],
      [0.045, 0.16, 0.07, 'poly', 0, -0.11, -0.06, 0.2, 0, 'mag'],
      [0.04, 0.11, 0.05, 'poly', 0, -0.08, 0.1, -0.3],
      [0.05, 0.075, 0.2, 'poly', 0, -0.01, 0.3],
      ...redDot(-0.05),
    ],
  },
  smg: {
    sightY: 0.0835, muzzle: -0.42,
    parts: [
      [0.065, 0.085, 0.3, 'metal', 0, 0, 0],
      [0.07, 0.065, 0.12, 'poly', 0, 0, -0.2],
      [0.072, 0.008, 0.1, 'accent', 0, 0.02, -0.2],
      ['barrel', 0.011, 0.1, 'metal', 0, 0.012, -0.3],
      [0.04, 0.22, 0.05, 'poly', 0, -0.14, -0.08, 0.1, 0, 'mag'],
      [0.04, 0.1, 0.05, 'poly', 0, -0.08, 0.08, -0.3],
      [0.02, 0.04, 0.2, 'metal', 0, -0.01, 0.24],
      ...redDot(-0.04),
    ],
  },
  shotgun: {
    sightY: 0.07, muzzle: -0.66,
    parts: [
      [0.075, 0.09, 0.34, 'metal', 0, 0, 0],
      ['barrel', 0.02, 0.48, 'metal', 0, 0.02, -0.4],
      [0.065, 0.06, 0.18, 'wood', 0, -0.035, -0.36, 0, 0, 'mag'],
      [0.077, 0.008, 0.12, 'accent', 0, 0.046, -0.05],
      [0.045, 0.11, 0.06, 'wood', 0, -0.08, 0.12, -0.35],
      [0.06, 0.09, 0.26, 'wood', 0, -0.025, 0.3, 0.12],
      [0.008, 0.012, 0.008, 'dot', 0, 0.07, -0.62],
      [0.02, 0.025, 0.02, 'metal', 0, 0.055, -0.02],
    ],
  },
  knife: { sightY: 0, muzzle: -0.3, parts: [], knife: true },
  dmr: {
    sightY: 0.1, muzzle: -0.72,
    parts: [
      [0.068, 0.09, 0.44, 'metal', 0, 0, 0],
      [0.074, 0.075, 0.26, 'poly', 0, 0.004, -0.3],
      [0.076, 0.008, 0.22, 'accent', 0, 0.026, -0.3],
      ['barrel', 0.012, 0.26, 'metal', 0, 0.015, -0.55],
      [0.034, 0.034, 0.07, 'metal', 0, 0.015, -0.68],
      ['scope', 0.022, 0.2, 'metal', 0, 0.1, -0.04],
      ['lens', 0.02, 0.005, 'lens', 0, 0.1, -0.14],
      [0.02, 0.04, 0.03, 'metal', 0, 0.065, -0.09],
      [0.02, 0.04, 0.03, 'metal', 0, 0.065, 0.02],
      [0.045, 0.12, 0.07, 'poly', 0, -0.09, -0.07, 0.15, 0, 'mag'],
      [0.04, 0.11, 0.05, 'poly', 0, -0.08, 0.12, -0.3],
      [0.055, 0.09, 0.24, 'poly', 0, -0.015, 0.34],
      [0.006, 0.006, 0.006, 'dot', 0, 0.1, -0.15],
    ],
  },
  lmg: {
    sightY: 0.0835, muzzle: -0.7,
    parts: [
      [0.085, 0.1, 0.46, 'metal', 0, 0, 0],
      [0.09, 0.03, 0.3, 'metal', 0, 0.06, -0.02],
      [0.086, 0.009, 0.26, 'accent', 0, 0.077, -0.02],
      [0.08, 0.08, 0.2, 'poly', 0, 0, -0.32],
      ['barrel', 0.016, 0.3, 'metal', 0, 0.015, -0.55],
      [0.04, 0.04, 0.06, 'metal', 0, 0.015, -0.68],
      [0.11, 0.12, 0.12, 'poly', -0.06, -0.1, -0.05, 0, 0, 'mag'],
      [0.006, 0.12, 0.006, 'metal', -0.03, -0.09, -0.5, 0.4],
      [0.006, 0.12, 0.006, 'metal', 0.03, -0.09, -0.5, 0.4],
      [0.045, 0.11, 0.05, 'poly', 0, -0.09, 0.13, -0.3],
      [0.06, 0.09, 0.24, 'poly', 0, -0.02, 0.34],
      ...redDot(-0.08).map((q) => { const c = [...q]; c[5] += 0.02; return c; }),
    ],
  },
  sniper: {
    sightY: 0.1, muzzle: -0.86,
    parts: [
      [0.07, 0.09, 0.48, 'metal', 0, 0, 0],
      ['barrel', 0.013, 0.55, 'metal', 0, 0.015, -0.5],
      [0.035, 0.035, 0.06, 'metal', 0, 0.015, -0.8],
      ['scope', 0.028, 0.28, 'metal', 0, 0.1, -0.05],
      ['lens', 0.026, 0.005, 'lens', 0, 0.1, -0.19],
      [0.02, 0.04, 0.03, 'metal', 0, 0.06, -0.12],
      [0.02, 0.04, 0.03, 'metal', 0, 0.06, 0.04],
      [0.072, 0.008, 0.3, 'accent', 0, 0.046, -0.05],
      [0.045, 0.1, 0.07, 'poly', 0, -0.1, -0.05, 0, 0, 'mag'],
      [0.04, 0.11, 0.05, 'poly', 0, -0.08, 0.14, -0.3],
      [0.06, 0.1, 0.28, 'poly', 0, -0.02, 0.38],
    ],
  },
};

// ---------- knivar ----------
// Varje knivmodell är en funktion som bygger kniven av materialen (m.blade, m.handle, m.metal, m.accent).
// Knivens nolläge = mitt på skaftet, bladet pekar framåt (-z) och eggen nedåt (-y).
// När man inspekterar snurrar kniven runt sin längdaxel (z).
// Nya modeller: lägg till en funktion här och peka på den med model: '...' i skins.js.
export const KNIVES = {
  m9(m) {
    const g = new THREE.Group();
    // Skaft: räfflat, lite ovalt
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.017, 0.12, 12), m.handle);
    handle.rotation.x = Math.PI / 2;
    handle.scale.set(0.8, 1, 1);
    g.add(handle);
    for (let i = 0; i < 6; i++) { // räfflor
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.0158, 0.0018, 6, 14), m.handle);
      r.scale.set(0.82, 1, 1);
      r.position.z = 0.042 - i * 0.017;
      g.add(r);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.1), m.accent); // färgrand i spelarens färg
    strip.position.set(0, 0.0155, 0);
    g.add(strip);
    // Knopp längst bak
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.036, 0.018), m.metal);
    pommel.position.z = 0.068;
    g.add(pommel);
    // Parerstång med ringen överst (för gevärspipan)
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.012), m.metal);
    guard.position.set(0, 0.004, -0.066);
    g.add(guard);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 18), m.metal);
    ring.position.set(0, 0.046, -0.066);
    g.add(ring);
    // Bladet: rak egg, clip point mot spetsen och sågtänder på ryggen (ritat i sidled, x = framåt)
    const s = new THREE.Shape();
    s.moveTo(0, -0.017);
    s.lineTo(0.15, -0.017);
    s.quadraticCurveTo(0.19, -0.014, 0.21, 0.004); // eggen böjer upp mot spetsen
    s.lineTo(0.135, 0.017); // clip point
    for (let u = 0.12; u > 0.035; u -= 0.009) { s.lineTo(u - 0.0045, 0.0225); s.lineTo(u - 0.009, 0.017); } // sågtänder
    s.lineTo(0, 0.017);
    s.lineTo(0, -0.017);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {
      depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.002, bevelSegments: 2, curveSegments: 12,
    }), m.blade);
    blade.geometry.translate(0, 0, -0.00175);
    blade.geometry.rotateY(Math.PI / 2); // ritningens x blir framåt (-z)
    blade.position.z = -0.072;
    g.add(blade);
    // Blodränna längs bladet (båda sidor)
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.0074, 0.004, 0.1), m.metal);
    fuller.position.set(0, 0.004, -0.13);
    g.add(fuller);
    return g;
  },
};

// Material för ett skin (standardmaterialen med skinets färger)
function skinMaterials(skin) {
  const c = skin.colors ?? {}, f = skin.finish ?? {};
  const own = [];
  const make = (base, color, extra = {}) => {
    if (!color && !Object.keys(extra).length) return base;
    const m = base.clone();
    if (color) m.color.set(color);
    Object.assign(m, extra);
    own.push(m);
    return m;
  };
  return {
    own,
    metal: make(metal, c.metal, f),
    poly: make(poly, c.poly),
    wood: make(wood, c.wood),
    blade: make(bladeMat, c.blade, f),
    handle: make(poly, c.handle ?? '#1c1f25'),
  };
}
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.95, roughness: 0.22 });

// Hur kniven hålls i första person (i vapnets ram): position, rotation, storlek, armens riktning och läge i bild
export const KNIFE_GRIP = { pos: [0, 0, -0.02], rot: [0.15, 0.95, -0.35], scale: 1.65, arm: [0.25, -0.5, 0.85], hip: [0.11, -0.1, -0.21] };

// Vapnet du ser i första person. Byggt av lådor, skalat ner så det inte klipper in i väggar.
export class Weapon {
  constructor(camera, color) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.4);
    camera.add(this.root);

    this.accent = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 0.9 });
    this.sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.8 });
    this.glove = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    this.pad = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
    this.setGloves();
    this.mats = { metal, poly, wood, lens, dot, accent: this.accent };

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: FLASH, color: new THREE.Color(4, 2.8, 1.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flash.visible = false;
    this.muzzle = new THREE.Object3D();
    this.muzzle.add(this.flash);

    this.hip = new THREE.Vector3(0.1, -0.1, -0.2);
    this.adsPos = new THREE.Vector3();
    this.adsK = 0;
    this.sprintK = 0;
    this.kick = 0;
    this.kickPower = 1;
    this.land = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.flashT = 0;
    this.swap = 0;
    this.setType('rifle');
  }

  // type = vapnets id, skinId = skin ur skins.js (utelämnat = standard)
  setType(type, skinId) {
    const skin = skinFor(type, skinId);
    if (type === this.type && skin.id === this.skinId) return;
    this.type = type;
    this.skinId = skin.id;
    if (this.model) {
      this.root.remove(this.model);
      this.model.traverse((o) => o.geometry?.dispose());
    }
    for (const m of this.skinMats?.own ?? []) m.dispose();
    this.skinMats = skinMaterials(skin);
    const mats = { ...this.mats, ...this.skinMats };
    const spec = MODELS[type];
    this.model = new THREE.Group();
    this.mag = null;
    this.spin = this.spinner = null;
    this.inspectT = 0;
    if (spec.knife) {
      // Greppet som i CS: handen runt skaftet, bladet framåt och lite inåt mot mitten, eggen nedåt.
      // spin = greppet, spinner = snurrar runt knivens längdaxel när man inspekterar.
      this.spin = new THREE.Group();
      this.spinner = new THREE.Group();
      this.spinner.add((KNIVES[skin.model] ?? KNIVES.m9)(mats));
      this.spin.add(this.spinner);
      this.spin.position.set(KNIFE_GRIP.pos[0], KNIFE_GRIP.pos[1], KNIFE_GRIP.pos[2]);
      this.spin.rotation.set(KNIFE_GRIP.rot[0], KNIFE_GRIP.rot[1], KNIFE_GRIP.rot[2]);
      this.spin.scale.setScalar(KNIFE_GRIP.scale);
      this.model.add(this.spin);
      // näven runt skaftet sitter i knivens ram (följer greppet men inte snurren)
      // Handen runt skaftet (i knivens ram). Sidan mot kameran är -x: där syns handryggen,
      // knogskyddet och fingrarna som sluter sig runt skaftet. Tummen ligger ovanpå.
      const fist = new THREE.Group();
      fist.position.set(0, 0, 0.006);
      const part = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz);
        fist.add(m);
      };
      part(0.014, 0.046, 0.066, this.glove, 0.021, 0.002, 0); // handflata (bortre sidan)
      part(0.014, 0.05, 0.07, this.glove, -0.021, 0.004, 0); // handrygg (mot kameran)
      part(0.006, 0.02, 0.06, this.pad, -0.029, 0.014, 0); // knogskydd
      for (let i = 0; i < 4; i++) { // fingrarna runt undersidan
        const z = -0.024 + i * 0.016;
        part(0.042, 0.013, 0.014, this.glove, 0, -0.023, z);
        part(0.012, 0.012, 0.0145, this.glove, -0.02, -0.017, z, 0, 0, 0.6);
      }
      part(0.012, 0.012, 0.044, this.glove, -0.004, 0.022, -0.012, 0, 0.12, 0); // tumme ovanpå
      part(0.044, 0.022, 0.02, this.glove, 0, 0.012, 0.038); // handlov bakom
      this.spin.add(fist);
      // armen in i näven nerifrån höger
      this.spin.updateMatrix();
      const fp = fist.position.clone().applyMatrix4(this.spin.matrix);
      const dir = new THREE.Vector3(...KNIFE_GRIP.arm).normalize();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.34), this.sleeve);
      arm.position.copy(fp).addScaledVector(dir, 0.19);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      this.model.add(arm);
      this.hip.set(KNIFE_GRIP.hip[0], KNIFE_GRIP.hip[1], KNIFE_GRIP.hip[2]);
    } else {
      this.hip.set(0.1, -0.1, -0.2);
    }
    for (const part of spec.parts) {
      let mesh;
      if (part[0] === 'barrel' || part[0] === 'scope' || part[0] === 'lens') {
        const [, r, len, mat, x, y, z] = part;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mats[mat]);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, y, z);
      } else {
        const [w, h, d, mat, x, y, z, rx = 0, ry = 0, tag] = part;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, 0);
        if (tag === 'mag') this.mag = mesh;
      }
      this.model.add(mesh);
    }
    // händer och ärmar
    const hand = (w, h, d, mat, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      this.model.add(m);
    };
    if (!spec.knife) {
      hand(0.07, 0.06, 0.12, this.glove, -0.01, -0.05, spec.muzzle * 0.45);
      hand(0.06, 0.08, 0.06, this.glove, 0.02, -0.08, 0.1, -0.3);
      hand(0.09, 0.09, 0.34, this.sleeve, -0.1, -0.1, spec.muzzle * 0.45 + 0.16, 0.1, -0.55);
      hand(0.09, 0.09, 0.3, this.sleeve, 0.07, -0.13, 0.25, 0.3, 0.2);
    }

    this.muzzle.position.set(0, 0.015, spec.muzzle);
    this.model.add(this.muzzle);
    this.root.add(this.model);
    this.adsPos.set(0, -spec.sightY * 0.4, -0.11);
    if (type === 'knife') this.adsPos.copy(this.hip);
    this.kickPower = { shotgun: 2.2, sniper: 2.2, dmr: 1.6, smg: 0.7, lmg: 0.85, knife: 3 }[type] ?? 1;
    this.swap = 1;
  }

  // Handskar ur skins.js (id utelämnat = standard)
  setGloves(id) {
    const g = gloveFor(id);
    this.glove.color.set(g.colors.glove);
    this.pad.color.set(g.colors.pad);
  }

  setColor(color) {
    this.accent.emissive.set(color);
    this.sleeve.color.set(color).multiplyScalar(0.55);
  }

  fire() {
    this.kick = this.kickPower;
    if (this.type === 'knife') return;
    this.flashT = 0.045;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar((0.22 + Math.random() * 0.12) * (this.type === 'shotgun' ? 1.5 : 1));
  }

  muzzleWorld(v) {
    return this.muzzle.getWorldPosition(v);
  }

  // ---------- inspektion (F) ----------
  inspect() {
    if (this.inspectT > 0) return;
    this.inspectDur = this.spin ? 3.4 : 2.6;
    this.inspectT = 0.0001;
  }

  cancelInspect() {
    this.inspectT = 0;
  }

  get inspecting() {
    return this.inspectT > 0;
  }

  // Pose vid tiden t (sekunder): förskjutning, rotation och snurr
  inspectPose(t) {
    const P = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, spin: 0 };
    if (this.spin) {
      // kniv: lyft in i bild och visa bladets ena sida → vänd och visa andra sidan
      //       → snurra två varv runt längdaxeln (som M9-inspektionen i CS) → tillbaka
      const up = ease(t / 0.4) - ease((t - 3.0) / 0.4);
      const flip = ease((t - 1.2) / 0.5);
      P.x = -0.045 * up; P.y = 0.03 * up; P.z = 0.01 * up;
      P.rx = (0.12 + Math.sin(t * 2.4) * 0.03) * up;
      P.ry = lerp(0.3, -0.35, flip) * up;
      P.rz = lerp(0.4, -0.8, flip) * up;
      P.spin = ease((t - 2.0) / 0.8) * Math.PI * 4;
    } else {
      // gevär: vrid fram och visa sidan, vänd lite, tillbaka
      const up = ease(t / 0.5) - ease((t - 2.1) / 0.5);
      const turn = ease((t - 1.1) / 0.6);
      P.x = -0.04 * up; P.y = 0.025 * up; P.z = 0.02 * up;
      P.ry = (0.55 - 0.35 * turn) * up;
      P.rz = (0.85 - 0.25 * turn) * up;
      P.rx = 0.15 * up;
    }
    return P;
  }

  // s: { ads, sprint, bob, bobAmt, lookDX, lookDY, reload (0..1 eller -1), alive, hidden }
  update(dt, s) {
    this.root.visible = s.alive && !s.hidden;
    const k = (r) => Math.min(1, dt * r);
    this.adsK = lerp(this.adsK, s.ads ? 1 : 0, k(14));
    this.sprintK = lerp(this.sprintK, s.sprint ? 1 : 0, k(8));
    this.kick *= Math.exp(-dt * 14);
    this.land *= Math.exp(-dt * 8);
    this.swap *= Math.exp(-dt * 8);
    this.swayX = lerp(this.swayX, Math.max(-0.03, Math.min(0.03, -s.lookDX * 0.0006)), k(10));
    this.swayY = lerp(this.swayY, Math.max(-0.03, Math.min(0.03, s.lookDY * 0.0006)), k(10));

    const a = this.adsK;
    const p = this.root.position.lerpVectors(this.hip, this.adsPos, a);
    const bob = s.bobAmt * (1 - a * 0.85);
    p.x += Math.sin(s.bob) * 0.006 * bob + this.swayX * 0.5 * (1 - a * 0.7);
    p.y += -Math.abs(Math.cos(s.bob)) * 0.006 * bob - this.swayY * 0.5 * (1 - a * 0.7) - this.land * 0.02 - this.swap * 0.08;
    p.z += this.kick * (0.012 + 0.006 * (1 - a));
    p.x += this.sprintK * 0.02;
    p.y -= this.sprintK * 0.02;

    const r = s.reload >= 0 ? Math.sin(s.reload * Math.PI) : 0;
    p.y -= r * 0.03;
    if (this.mag) this.mag.visible = !(s.reload > 0.25 && s.reload < 0.55);

    const rot = this.model.rotation;
    rot.x = this.kick * 0.06 * (1 - a * 0.6) - this.sprintK * 0.3 - r * 0.35 + this.swayY * 0.6 - this.swap * 0.6;
    rot.y = this.sprintK * 0.7 + this.swayX * 0.8;
    rot.z = r * 0.5 + Math.sin(s.bob) * 0.01 * bob;
    if (this.spin) {
      // hugg: kniven sveper snett över från höger till vänster
      const st = Math.min(this.kick, 1);
      p.z -= st * 0.07;
      p.x -= st * 0.05;
      rot.y -= st * 0.8;
      rot.x -= st * 0.35;
      rot.z += st * 0.5;
    }
    if (this.inspectT > 0) {
      this.inspectT += dt;
      if (this.inspectT >= this.inspectDur) this.inspectT = 0;
      else {
        const P = this.inspectPose(this.inspectT);
        p.x += P.x; p.y += P.y; p.z += P.z;
        rot.x += P.rx; rot.y += P.ry; rot.z += P.rz;
        if (this.spinner) this.spinner.rotation.z = P.spin;
      }
    }
    if (this.spinner && this.inspectT <= 0) this.spinner.rotation.z = 0;

    this.flashT -= dt;
    if (this.flashT <= 0) this.flash.visible = false;
  }
}
