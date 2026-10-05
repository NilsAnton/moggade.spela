import * as THREE from 'three';

const G = {
  leg: new THREE.BoxGeometry(0.2, 0.8, 0.24).translate(0, -0.4, 0),
  belt: new THREE.BoxGeometry(0.64, 0.1, 0.38),
  torso: new THREE.BoxGeometry(0.62, 0.62, 0.36),
  vest: new THREE.BoxGeometry(0.5, 0.4, 0.4),
  head: new THREE.BoxGeometry(0.4, 0.42, 0.4),
  visor: new THREE.BoxGeometry(0.34, 0.11, 0.04),
  gun: new THREE.BoxGeometry(0.08, 0.12, 0.62),
  arm: new THREE.BoxGeometry(0.12, 0.12, 0.38),
};
const dark = new THREE.MeshStandardMaterial({ color: 0x24272e, roughness: 0.7, metalness: 0.2 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.4, metalness: 0.7 });

// En annan spelare: modell, namnskylt och interpolering mellan server-snapshots.
export class RemotePlayer {
  constructor(scene) {
    this.scene = scene;
    this.buf = [];
    this.sp = -1;
    this.alive = false;
    this.prot = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.walk = 0;
    this.deathT = 0;
    this.name = '';
    this.color = '#ffffff';

    this.mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.55, metalness: 0.1 });
    this.visor = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: this.color, emissiveIntensity: 1.2, roughness: 0.2 });

    const g = (this.group = new THREE.Group());
    const mesh = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.body = new THREE.Group();
    g.add(this.body);

    this.legL = new THREE.Group(); this.legL.position.set(-0.14, 0.8, 0); this.body.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.14, 0.8, 0); this.body.add(this.legR);
    mesh(G.leg, dark, 0, 0, 0, this.legL);
    mesh(G.leg, dark, 0, 0, 0, this.legR);
    mesh(G.belt, dark, 0, 0.84, 0, this.body);
    mesh(G.torso, this.mat, 0, 1.12, 0, this.body);
    mesh(G.vest, dark, 0, 1.15, -0.03, this.body);

    this.head = new THREE.Group(); this.head.position.set(0, 1.45, 0); this.body.add(this.head);
    mesh(G.head, this.mat, 0, 0.21, 0, this.head);
    mesh(G.visor, this.visor, 0, 0.24, -0.205, this.head);

    this.arms = new THREE.Group(); this.arms.position.set(0, 1.32, 0); this.body.add(this.arms);
    this.gun = mesh(G.gun, gunMat, 0.16, 0, -0.4, this.arms);
    mesh(G.arm, this.mat, 0.24, -0.04, -0.12, this.arms);
    mesh(G.arm, this.mat, -0.02, -0.04, -0.3, this.arms).rotation.y = -0.6;
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.16, 0.02, -0.74);
    this.arms.add(this.muzzle);

    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 256; this.tagCanvas.height = 64;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false }));
    this.tag.position.y = 2.2;
    this.tag.scale.set(1.4, 0.35, 1);
    g.add(this.tag);

    g.visible = false;
    scene.add(g);
  }

  setWeapon(w) {
    const len = [1, 0.7, 0.9, 1.4, 0.35][w] ?? 1;
    this.gun.scale.z = len;
    this.gun.position.z = -0.1 - 0.3 * len;
    this.muzzle.position.z = -0.12 - 0.62 * len;
  }

  setInfo(name, color) {
    if (name === this.name && color === this.color) return;
    this.name = name;
    this.color = color;
    this.mat.color.set(color);
    this.visor.emissive.set(color);
    const c = this.tagCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    c.font = '600 34px "Chakra Petch", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.strokeText(name, 128, 32);
    c.fillStyle = color;
    c.fillText(name, 128, 32);
    this.tagTex.needsUpdate = true;
  }

  push(ts, x, y, z, yaw, pitch, alive, sp, prot, sl) {
    this.sliding = !!sl;
    if (sp !== this.sp) { this.sp = sp; this.buf.length = 0; }
    this.buf.push({ t: ts, x, y, z, yaw, pitch });
    if (this.buf.length > 40) this.buf.shift();
    if (alive && !this.alive) {
      this.alive = true;
      this.deathT = 0;
      this.body.rotation.set(0, 0, 0);
      this.body.position.y = 0;
      this.tag.visible = true;
      this.group.visible = true;
    } else if (!alive && this.alive) {
      this.die();
    }
    this.prot = !!prot;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0.0001;
    this.deathDir = Math.random() < 0.5 ? 1 : -1;
    this.tag.visible = false;
  }

  muzzlePos(v) {
    this.group.updateMatrixWorld();
    return this.muzzle.getWorldPosition(v);
  }

  update(rt, dt) {
    const b = this.buf;
    if (!b.length) return;
    let a = b[b.length - 1], c = a;
    if (rt <= b[0].t) a = c = b[0];
    else if (rt < c.t) {
      for (let i = b.length - 2; i >= 0; i--) {
        if (b[i].t <= rt) { a = b[i]; c = b[i + 1]; break; }
      }
    }
    const k = c.t === a.t ? 0 : (rt - a.t) / (c.t - a.t);
    const nx = a.x + (c.x - a.x) * k, ny = a.y + (c.y - a.y) * k, nz = a.z + (c.z - a.z) * k;
    const speed = Math.hypot(nx - this.pos.x, nz - this.pos.z) / Math.max(dt, 1e-3);
    this.pos.set(nx, ny, nz);
    let dy = c.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = a.yaw + dy * k;
    this.pitch = a.pitch + (c.pitch - a.pitch) * k;

    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch * 0.6;
    this.arms.rotation.x = this.pitch;

    const spd = Math.min(speed, 9);
    this.walk += dt * spd * 1.8;
    const amp = this.alive ? Math.min(spd / 5, 1) * 0.7 : 0;
    this.legL.rotation.x = Math.sin(this.walk) * amp;
    this.legR.rotation.x = -Math.sin(this.walk) * amp;

    // glidning: luta bakåt och sänk kroppen
    this.slideK = (this.slideK ?? 0) + ((this.sliding && this.alive ? 1 : 0) - (this.slideK ?? 0)) * Math.min(1, dt * 14);
    if (this.alive) {
      this.body.rotation.x = this.slideK * 0.9;
      this.body.position.y = -this.slideK * 0.35;
      if (this.slideK > 0.1) { this.legL.rotation.x = -this.slideK * 1.2; this.legR.rotation.x = -this.slideK * 0.9; }
    }

    if (!this.alive && this.deathT > 0) {
      this.deathT += dt;
      const p = Math.min(this.deathT / 0.45, 1);
      const e = 1 - (1 - p) ** 3;
      this.body.rotation.x = e * 1.45;
      this.body.rotation.z = this.deathDir * e * 0.25;
      if (this.deathT > 2.2) { g.visible = false; this.deathT = 0; }
    }

    const glow = this.prot ? 0.35 + 0.25 * Math.sin(performance.now() * 0.012) : 0;
    this.mat.emissive.set(this.color).multiplyScalar(glow);
  }

  dispose() {
    this.scene.remove(this.group);
    this.mat.dispose();
    this.visor.dispose();
    this.tagTex.dispose();
    this.tag.material.dispose();
  }
}
