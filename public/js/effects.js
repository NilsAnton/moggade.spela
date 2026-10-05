import * as THREE from 'three';

function texture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOT = texture(64, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

export const FLASH = texture(128, (g, s) => {
  g.translate(s / 2, s / 2);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7);
    g.beginPath(); g.moveTo(0, -6); g.lineTo(s / 2 * (0.6 + Math.random() * 0.4), 0); g.lineTo(0, 6); g.fill();
  }
  g.beginPath(); g.arc(0, 0, s * 0.18, 0, Math.PI * 2); g.fill();
});

const HOLE = texture(64, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.25, 'rgba(10,10,10,0.95)');
  grd.addColorStop(0.45, 'rgba(40,35,30,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42); g.stroke();
  }
});

class Particles {
  constructor(scene, max, { size, additive, gravity, drag }) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.base = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.PointsMaterial({
      size, map: DOT, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(this.geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  emit(p, n, count, { speed, spread, life, color }) {
    for (let c = 0; c < count; c++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      let dx = n.x + (Math.random() * 2 - 1) * spread;
      let dy = n.y + (Math.random() * 2 - 1) * spread;
      let dz = n.z + (Math.random() * 2 - 1) * spread;
      const len = Math.hypot(dx, dy, dz) || 1;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = (dx / len) * v; this.vel[i * 3 + 1] = (dy / len) * v; this.vel[i * 3 + 2] = (dz / len) * v;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      for (let k = 0; k < 4; k++) this.base[i * 4 + k] = color[k];
    }
  }

  update(dt) {
    const damp = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 4 + 3] = 0; continue; }
      this.vel[i * 3 + 1] -= this.gravity * dt;
      for (let k = 0; k < 3; k++) { this.vel[i * 3 + k] *= damp; this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt; }
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new Particles(scene, 600, { size: 0.07, additive: true, gravity: 14, drag: 1.5 });
    this.dust = new Particles(scene, 300, { size: 0.45, additive: false, gravity: -0.4, drag: 3 });
    this.blood = new Particles(scene, 300, { size: 0.1, additive: false, gravity: 9, drag: 1 });

    const tg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.tracers = [];
    this.ti = 0;
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
        color: new THREE.Color(3, 2.2, 1.1), transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, a: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, s: 0, active: false });
    }

    const dg = new THREE.PlaneGeometry(0.16, 0.16);
    const dm = new THREE.MeshBasicMaterial({
      map: HOLE, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.decals = [];
    this.di = 0;
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(dg, dm);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }

    this.flashes = [];
    this.fi = 0;
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: FLASH, color: new THREE.Color(5, 3.5, 2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      s.visible = false;
      s.userData.t = 0;
      scene.add(s);
      this.flashes.push(s);
    }
  }

  tracer(a, b) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    t.a.copy(a);
    t.dir.subVectors(b, a);
    t.len = t.dir.length();
    if (t.len < 0.5) return;
    t.dir.divideScalar(t.len);
    t.s = 1.5;
    t.active = true;
    t.mesh.visible = true;
  }

  impact(p, n) {
    this.sparks.emit(p, n, 12, { speed: 7, spread: 0.9, life: 0.3, color: [2.5, 1.7, 0.8, 1] });
    this.dust.emit(p, n, 5, { speed: 1.4, spread: 0.6, life: 0.9, color: [0.55, 0.52, 0.5, 0.45] });
    const d = this.decals[this.di++ % this.decals.length];
    d.position.copy(p).addScaledVector(n, 0.004);
    d.lookAt(_v.copy(d.position).add(n));
    d.rotateZ(Math.random() * Math.PI * 2);
    d.scale.setScalar(0.8 + Math.random() * 0.5);
    d.visible = true;
  }

  sparksAt(p) {
    this.sparks.emit(p, _v.set(0, 1, 0), 6, { speed: 4, spread: 1, life: 0.25, color: [4, 2.6, 1.2, 1] });
  }

  blood(p, dir) {
    this.blood.emit(p, dir, 16, { speed: 3.5, spread: 0.9, life: 0.5, color: [0.55, 0.02, 0.03, 1] });
    this.blood.emit(p, dir.clone().negate(), 6, { speed: 1.5, spread: 1, life: 0.4, color: [0.4, 0.01, 0.02, 0.9] });
  }

  shockwave(p) {
    if (!this.ring) {
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.4, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      this.ring.visible = false;
      this.scene.add(this.ring);
    }
    this.ring.position.set(p.x, p.y + 0.05, p.z);
    this.ring.userData.t = 0;
    this.ring.visible = true;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.dust.emit(p, _v.set(Math.cos(a), 0.3, Math.sin(a)), 2, { speed: 9, spread: 0.2, life: 0.8, color: [0.6, 0.55, 0.5, 0.6] });
    }
    this.sparks.emit(p, _v.set(0, 1, 0), 30, { speed: 8, spread: 1, life: 0.4, color: [2.5, 1.7, 0.8, 1] });
  }

  heal(p) {
    this.sparks.emit(p, _v.set(0, 1, 0), 30, { speed: 2.5, spread: 0.8, life: 0.7, color: [0.4, 2.2, 0.8, 1] });
  }

  flash(p) {
    const s = this.flashes[this.fi++ % this.flashes.length];
    s.position.copy(p);
    s.material.rotation = Math.random() * Math.PI * 2;
    s.scale.setScalar(0.5 + Math.random() * 0.3);
    s.userData.t = 0.05;
    s.visible = true;
  }

  update(dt) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.blood.update(dt);

    for (const t of this.tracers) {
      if (!t.active) continue;
      t.s += 450 * dt;
      const tail = Math.max(0, t.s - 8), head = Math.min(t.len, t.s);
      if (tail >= t.len) { t.active = false; t.mesh.visible = false; continue; }
      t.mesh.position.copy(t.a).addScaledVector(t.dir, tail);
      t.mesh.lookAt(_v.copy(t.mesh.position).add(t.dir));
      t.mesh.scale.set(0.02, 0.02, Math.max(0.01, head - tail));
    }

    if (this.ring?.visible) {
      const r = this.ring;
      r.userData.t += dt;
      const k = r.userData.t / 0.45;
      r.scale.setScalar(0.5 + k * 5);
      r.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) r.visible = false;
    }

    for (const s of this.flashes) {
      if (!s.visible) continue;
      s.userData.t -= dt;
      if (s.userData.t <= 0) s.visible = false;
    }
  }
}
