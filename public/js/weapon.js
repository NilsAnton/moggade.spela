import * as THREE from 'three';
import { FLASH } from './effects.js';

const lerp = (a, b, k) => a + (b - a) * k;

// Vapnet du ser i första person. Byggt av lådor, skalat ner så det inte klipper in i väggar.
export class Weapon {
  constructor(camera, color) {
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.root.scale.setScalar(0.4);
    camera.add(this.root);

    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.75, roughness: 0.32 });
    const poly = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.1, roughness: 0.65 });
    this.accent = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 2.5 });
    this.sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.8 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
    const dot = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.1, 0.08) });

    const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      this.model.add(m);
      return m;
    };

    box(0.07, 0.09, 0.42, metal, 0, 0, 0);
    box(0.075, 0.07, 0.22, poly, 0, 0.005, -0.27);
    box(0.077, 0.008, 0.18, this.accent, 0, 0.022, -0.27);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.46);
    this.model.add(barrel);
    box(0.03, 0.03, 0.05, metal, 0, 0.015, -0.56);
    this.mag = box(0.045, 0.16, 0.07, poly, 0, -0.11, -0.06, 0.2);
    box(0.04, 0.11, 0.05, poly, 0, -0.08, 0.1, -0.3);
    box(0.05, 0.075, 0.2, poly, 0, -0.01, 0.3);
    box(0.054, 0.02, 0.2, this.accent, 0, 0.02, 0.3);

    // rödpunktssikte
    box(0.03, 0.02, 0.1, metal, 0, 0.055, -0.03);
    box(0.05, 0.006, 0.014, metal, 0, 0.102, -0.05);
    box(0.05, 0.006, 0.014, metal, 0, 0.065, -0.05);
    box(0.006, 0.04, 0.014, metal, -0.022, 0.0835, -0.05);
    box(0.006, 0.04, 0.014, metal, 0.022, 0.0835, -0.05);
    box(0.004, 0.004, 0.004, dot, 0, 0.0835, -0.05);

    // händer och ärmar
    box(0.07, 0.06, 0.12, glove, -0.01, -0.045, -0.28);
    box(0.06, 0.08, 0.06, glove, 0.02, -0.08, 0.1, -0.3);
    box(0.09, 0.09, 0.34, this.sleeve, -0.1, -0.1, -0.12, 0.1, -0.55);
    box(0.09, 0.09, 0.3, this.sleeve, 0.07, -0.13, 0.25, 0.3, 0.2);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.015, -0.6);
    this.model.add(this.muzzle);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: FLASH, color: new THREE.Color(6, 4, 2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.hip = new THREE.Vector3(0.1, -0.1, -0.2);
    this.adsPos = new THREE.Vector3(0, -0.0334, -0.11);
    this.adsK = 0;
    this.sprintK = 0;
    this.kick = 0;
    this.land = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.flashT = 0;
  }

  setColor(color) {
    this.accent.emissive.set(color);
    this.sleeve.color.set(color).multiplyScalar(0.55);
  }

  fire() {
    this.kick = 1;
    this.flashT = 0.045;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(0.22 + Math.random() * 0.12);
  }

  muzzleWorld(v) {
    return this.muzzle.getWorldPosition(v);
  }

  // s: { ads, sprint, bob, bobAmt, lookDX, lookDY, reload (0..1 eller -1), alive }
  update(dt, s) {
    this.root.visible = s.alive;
    const k = (r) => Math.min(1, dt * r);
    this.adsK = lerp(this.adsK, s.ads ? 1 : 0, k(14));
    this.sprintK = lerp(this.sprintK, s.sprint ? 1 : 0, k(8));
    this.kick *= Math.exp(-dt * 16);
    this.land *= Math.exp(-dt * 8);
    this.swayX = lerp(this.swayX, Math.max(-0.03, Math.min(0.03, -s.lookDX * 0.0006)), k(10));
    this.swayY = lerp(this.swayY, Math.max(-0.03, Math.min(0.03, s.lookDY * 0.0006)), k(10));

    const a = this.adsK;
    const p = this.root.position.lerpVectors(this.hip, this.adsPos, a);
    const bob = s.bobAmt * (1 - a * 0.85);
    p.x += Math.sin(s.bob) * 0.006 * bob + this.swayX * 0.5 * (1 - a * 0.7);
    p.y += -Math.abs(Math.cos(s.bob)) * 0.006 * bob - this.swayY * 0.5 * (1 - a * 0.7) - this.land * 0.02;
    p.z += this.kick * (0.012 + 0.006 * (1 - a));
    p.x += this.sprintK * 0.02;
    p.y -= this.sprintK * 0.02;

    const r = s.reload >= 0 ? Math.sin(s.reload * Math.PI) : 0;
    p.y -= r * 0.03;
    this.mag.visible = !(s.reload > 0.25 && s.reload < 0.55);

    const rot = this.model.rotation;
    rot.x = this.kick * 0.06 * (1 - a * 0.6) - this.sprintK * 0.3 - r * 0.35 + this.swayY * 0.6;
    rot.y = this.sprintK * 0.7 + this.swayX * 0.8;
    rot.z = r * 0.5 + Math.sin(s.bob) * 0.01 * bob;

    this.flashT -= dt;
    if (this.flashT <= 0) this.flash.visible = false;
  }
}
