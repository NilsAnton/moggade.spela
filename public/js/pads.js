// Hälsoplattor: grönt glödande platta med ett svävande kors när den är redo, grå med en laddningsring annars.
// Servern bestämmer när någon tar en platta – här visas bara läget.
import * as THREE from 'three';

const GREEN = new THREE.Color('#3dff8a');
const GREY = new THREE.Color('#4a505c');

export class Pads {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = {
      base: new THREE.CylinderGeometry(0.95, 1.05, 0.08, 32),
      glow: new THREE.CircleGeometry(0.8, 32).rotateX(-Math.PI / 2),
      bar: new THREE.BoxGeometry(0.52, 0.16, 0.16),
    };
  }

  // positions: [[x, y, z], ...] från banan
  build(positions = []) {
    this.clear();
    for (const p of positions) {
      const g = new THREE.Group();
      g.position.set(p[0], p[1], p[2]);

      const base = new THREE.Mesh(this.geo.base, new THREE.MeshStandardMaterial({ color: '#1a1d24', roughness: 0.5, metalness: 0.6 }));
      base.position.y = 0.04;
      base.receiveShadow = true;
      const glowMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.85 });
      const glow = new THREE.Mesh(this.geo.glow, glowMat);
      glow.position.y = 0.085;

      // laddningsring: byggs om bara när den ändras märkbart
      const ringMat = new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 0.95, 48, 1, Math.PI / 2, 0.001).rotateX(-Math.PI / 2), ringMat);
      ring.position.y = 0.09;

      const crossMat = new THREE.MeshStandardMaterial({ color: '#0b2416', emissive: GREEN, emissiveIntensity: 2.2 });
      const cross = new THREE.Group();
      cross.add(new THREE.Mesh(this.geo.bar, crossMat));
      const v = new THREE.Mesh(this.geo.bar, crossMat);
      v.rotation.z = Math.PI / 2;
      cross.add(v);
      cross.position.y = 1.1;

      const light = new THREE.PointLight(GREEN, 2.5, 5, 2);
      light.position.y = 0.9;

      g.add(base, glow, ring, cross, light);
      this.scene.add(g);
      this.list.push({ g, glowMat, ring, ringMat, cross, light, readyAt: 0, total: 1, shown: -1 });
    }
  }

  // msLeft: [ms kvar tills plattan är redo, ...] från servern
  setState(msLeft = []) {
    const now = performance.now();
    msLeft.forEach((ms, i) => {
      const pad = this.list[i];
      if (!pad) return;
      pad.readyAt = now + ms;
      if (ms > 0) pad.total = Math.max(ms, pad.readyAt - now);
    });
  }

  update(dt, now) {
    for (const pad of this.list) {
      const left = pad.readyAt - now;
      const ready = left <= 0;
      pad.cross.visible = ready;
      pad.cross.rotation.y += dt * 1.8;
      pad.cross.position.y = 1.1 + Math.sin(now * 0.003) * 0.08;
      pad.light.intensity = ready ? 2.2 + Math.sin(now * 0.005) * 0.6 : 0;
      pad.glowMat.color.copy(ready ? GREEN : GREY);
      pad.glowMat.opacity = ready ? 0.65 + Math.sin(now * 0.005) * 0.2 : 0.35;
      // ring som fylls medan plattan laddar
      const k = ready ? 0 : 1 - left / pad.total;
      const step = Math.round(k * 48);
      pad.ring.visible = !ready;
      if (step !== pad.shown && !ready) {
        pad.shown = step;
        pad.ring.geometry.dispose();
        pad.ring.geometry = new THREE.RingGeometry(0.84, 0.95, 48, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2)).rotateX(-Math.PI / 2);
      }
    }
  }

  position(i) {
    return this.list[i]?.g.position;
  }

  clear() {
    for (const pad of this.list) {
      this.scene.remove(pad.g);
      pad.ring.geometry.dispose();
      pad.g.traverse((o) => { if (o.material) o.material.dispose(); });
    }
    this.list = [];
  }
}
