import * as THREE from 'three';
import { FLASH } from './effects.js';

const lerp = (a, b, k) => a + (b - a) * k;

const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.75, roughness: 0.32 });
const poly = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.1, roughness: 0.65 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 });
const glove = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
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
  knife: {
    sightY: 0, muzzle: -0.35,
    parts: [
      [0.035, 0.05, 0.14, 'poly', 0, 0, 0.02],
      [0.08, 0.015, 0.02, 'metal', 0, 0, -0.06],
      [0.008, 0.045, 0.24, 'metal', 0, 0.005, -0.19],
      [0.009, 0.006, 0.2, 'accent', 0, 0.03, -0.17],
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

// Vapnet du ser i första person. Byggt av lådor, skalat ner så det inte klipper in i väggar.
export class Weapon {
  constructor(camera, color) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.4);
    camera.add(this.root);

    this.accent = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 0.9 });
    this.sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.8 });
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

  setType(type) {
    if (type === this.type) return;
    this.type = type;
    if (this.model) {
      this.root.remove(this.model);
      this.model.traverse((o) => o.geometry?.dispose());
    }
    const spec = MODELS[type];
    this.model = new THREE.Group();
    this.mag = null;
    for (const part of spec.parts) {
      let mesh;
      if (part[0] === 'barrel' || part[0] === 'scope' || part[0] === 'lens') {
        const [, r, len, mat, x, y, z] = part;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), this.mats[mat]);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, y, z);
      } else {
        const [w, h, d, mat, x, y, z, rx = 0, ry = 0, tag] = part;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mats[mat]);
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
    hand(0.07, 0.06, 0.12, glove, -0.01, -0.05, spec.muzzle * 0.45);
    hand(0.06, 0.08, 0.06, glove, 0.02, -0.08, 0.1, -0.3);
    hand(0.09, 0.09, 0.34, this.sleeve, -0.1, -0.1, spec.muzzle * 0.45 + 0.16, 0.1, -0.55);
    hand(0.09, 0.09, 0.3, this.sleeve, 0.07, -0.13, 0.25, 0.3, 0.2);

    this.muzzle.position.set(0, 0.015, spec.muzzle);
    this.model.add(this.muzzle);
    this.root.add(this.model);
    this.adsPos.set(0, -spec.sightY * 0.4, -0.11);
    if (type === 'knife') this.adsPos.copy(this.hip);
    this.kickPower = type === 'shotgun' || type === 'sniper' ? 2.2 : type === 'smg' ? 0.7 : type === 'knife' ? 3 : 1;
    this.swap = 1;
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
    if (this.type === 'knife') {
      // hugg framåt och snett över
      const st = Math.min(this.kick, 1);
      p.z -= st * 0.06;
      p.x -= st * 0.04;
      rot.y -= st * 0.6;
      rot.x -= st * 0.3;
    }

    this.flashT -= dt;
    if (this.flashT <= 0) this.flash.visible = false;
  }
}
