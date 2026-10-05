import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const rand = Math.random;

// ---------- procedurella texturer ----------
function canvasTexture(size, draw, color = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, s, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function stains(g, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * s, y = rand() * s, r = 10 + rand() * s * 0.25;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${alpha * rand()})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const TEX = {
  ground: (g, s) => {
    g.fillStyle = '#2b2f37'; g.fillRect(0, 0, s, s);
    stains(g, s, 6, 0.25);
    speckle(g, s, 5000, 0.12, true);
    speckle(g, s, 5000, 0.18, false);
    g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  },
  concrete: (g, s) => {
    g.fillStyle = '#8b8e95'; g.fillRect(0, 0, s, s);
    stains(g, s, 10, 0.18);
    speckle(g, s, 4000, 0.15, true);
    speckle(g, s, 4000, 0.15, false);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(1, 1, s - 2, s - 2);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [x, y] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      g.beginPath(); g.arc(x * s, y * s, 4, 0, Math.PI * 2); g.fill();
    }
  },
  blocks: (g, s) => {
    g.fillStyle = '#6e727b'; g.fillRect(0, 0, s, s);
    stains(g, s, 8, 0.2);
    speckle(g, s, 5000, 0.14, true);
    speckle(g, s, 5000, 0.14, false);
    const rows = 4, bh = s / rows;
    g.strokeStyle = 'rgba(20,20,25,0.55)'; g.lineWidth = 3;
    for (let r = 0; r < rows; r++) {
      g.beginPath(); g.moveTo(0, r * bh); g.lineTo(s, r * bh); g.stroke();
      const off = r % 2 ? s / 4 : 0;
      for (let x = off; x <= s; x += s / 2) { g.beginPath(); g.moveTo(x, r * bh); g.lineTo(x, (r + 1) * bh); g.stroke(); }
    }
  },
  plate: (g, s) => {
    g.fillStyle = '#4a5059'; g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, 0.1, true);
    for (let y = 0; y < s; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) {
        g.save(); g.translate(x + 4, y + 8); g.rotate(((y / 16) % 2 ? 1 : -1) * 0.7);
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(-5, -1.5, 10, 3);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-5, 1.5, 10, 1.5);
        g.restore();
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);
  },
  crate: (g, s) => {
    g.fillStyle = '#9c6c3c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? 0 : 255},${rand() < 0.5 ? 0 : 200},0,${0.05 + rand() * 0.06})`;
      g.fillRect(0, (i * s) / 6, s, s / 6);
      g.fillStyle = 'rgba(40,20,5,0.45)'; g.fillRect(0, (i * s) / 6, s, 2);
    }
    speckle(g, s, 2500, 0.15, false);
    const b = s * 0.11;
    g.fillStyle = '#6a4220';
    g.fillRect(0, 0, s, b); g.fillRect(0, s - b, s, b); g.fillRect(0, 0, b, s); g.fillRect(s - b, 0, b, s);
    g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillRect(-s * 0.7, -b / 2, s * 1.4, b); g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(b, b, s - 2 * b, s - 2 * b); g.strokeRect(1, 1, s - 2, s - 2);
    g.fillStyle = 'rgba(30,30,30,0.8)';
    for (const [x, y] of [[0.055, 0.055], [0.945, 0.055], [0.055, 0.945], [0.945, 0.945]]) {
      g.beginPath(); g.arc(x * s, y * s, 5, 0, Math.PI * 2); g.fill();
    }
  },
  ribs: (g, s) => ribs(g, s, '#a8432c'),
  ribsBlue: (g, s) => ribs(g, s, '#2d5f8f'),
};

function ribs(g, s, color) {
  {
    g.fillStyle = color; g.fillRect(0, 0, s, s);
    const n = 10, w = s / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.12)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = grd; g.fillRect(i * w, 0, w, s);
    }
    stains(g, s, 10, 0.35);
    speckle(g, s, 3000, 0.2, false);
  }
}

function windowTextures() {
  const lit = [];
  const facade = canvasTexture(128, (g, s) => {
    g.fillStyle = '#1b1e29'; g.fillRect(0, 0, s, s);
    speckle(g, s, 800, 0.15, false);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = '#0c0e14';
      g.fillRect(x * 32 + 6, y * 32 + 8, 20, 16);
      lit.push(rand() < 0.35);
    }
  });
  const emissive = canvasTexture(128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    let i = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (lit[i++]) {
        g.fillStyle = rand() < 0.8 ? `hsl(${30 + rand() * 15},90%,${55 + rand() * 20}%)` : `hsl(${190 + rand() * 20},80%,60%)`;
        g.fillRect(x * 32 + 6, y * 32 + 8, 20, 16);
      }
    }
  });
  return { facade, emissive };
}

// Gör UV:er i världsskala så texturer inte sträcks ut på stora lådor.
function boxGeometry(p, s, tile) {
  const [w, h, d] = s;
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
      }
    }
  }
  g.translate(p[0], p[1], p[2]);
  return g;
}

function skyDome(t) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(t.sky.top) },
      mid: { value: new THREE.Color(t.sky.mid) },
      horizon: { value: new THREE.Color(t.sky.horizon) },
      bottom: { value: new THREE.Color(t.sky.bottom) },
      sunDir: { value: new THREE.Vector3(...t.sunDir).normalize() },
      sunColor: { value: new THREE.Color(t.sun) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, mid, horizon, bottom, sunDir, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        col = mix(col, top, smoothstep(0.2, 0.85, h));
        col = mix(col, bottom, smoothstep(0.0, 0.15, -h));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 20.0 + pow(s, 12.0) * 0.3 + pow(s, 3.0) * 0.1);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
}

function skyline(group, t) {
  const { facade, emissive } = windowTextures();
  const geos = [];
  const n = 54;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.06;
    const r = 70 + rand() * 70;
    const w = 8 + rand() * 14, d = 8 + rand() * 14, h = 14 + rand() * 50;
    const g = boxGeometry([Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r], [w, h, d], 8);
    g.rotateY(rand() * Math.PI);
    geos.push(g);
  }
  const mat = new THREE.MeshStandardMaterial({
    map: facade, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: t.windows, roughness: 0.9,
  });
  group.add(new THREE.Mesh(mergeGeometries(geos), mat));
}

let envTexture = null;

// Bygger en bana i en egen grupp. Returnerar en funktion som tar bort den igen.
export function buildWorld(scene, renderer, map) {
  const t = map.theme;
  const group = new THREE.Group();
  scene.add(group);

  scene.background = new THREE.Color(t.sky.horizon);
  scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
  renderer.toneMappingExposure = t.exposure;
  if (!envTexture) envTexture = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.3;

  group.add(skyDome(t));
  group.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemi));

  const sun = new THREE.DirectionalLight(t.sun, t.sunIntensity);
  sun.position.set(...t.sunDir).normalize().multiplyScalar(70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -48; sc.right = sc.top = 48; sc.near = 1; sc.far = 180;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);

  const T = {};
  const tex = (name) => (T[name] ??= canvasTexture(256, TEX[name]));
  const MATS = {
    ground: { tex: 'ground', tile: 4, rough: 0.92, metal: 0 },
    wall: { tex: 'blocks', tile: 4, rough: 0.9, metal: 0 },
    concrete: { tex: 'concrete', tile: 3, rough: 0.88, metal: 0 },
    metal: { tex: 'plate', tile: 2, rough: 0.42, metal: 0.65 },
    crate: { tex: 'crate', tile: 0, rough: 0.78, metal: 0 },
    container: { tex: 'ribs', tile: 2.6, rough: 0.55, metal: 0.45 },
    container2: { tex: 'ribsBlue', tile: 2.6, rough: 0.55, metal: 0.45 },
  };

  const groups = new Map();
  const neonLights = [];
  for (const b of map.boxes) {
    const key = b.m === 'neon' ? `neon:${b.c}` : b.m;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(boxGeometry(b.p, b.s, b.m === 'neon' ? 0 : MATS[b.m].tile));
    if (b.m === 'neon' && Math.max(b.s[0], b.s[2]) > 3) neonLights.push(b);
  }

  for (const [key, geos] of groups) {
    const neon = key.startsWith('neon:');
    const mat = neon
      ? new THREE.MeshStandardMaterial({ color: '#000', emissive: key.slice(5), emissiveIntensity: 1.6 })
      : new THREE.MeshStandardMaterial({ map: tex(MATS[key].tex), roughness: MATS[key].rough, metalness: MATS[key].metal });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = !neon && key !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const b of neonLights.slice(0, 4)) {
    const l = new THREE.PointLight(b.c, 2, 7, 2);
    l.position.set(b.p[0], b.p[1], b.p[2]);
    group.add(l);
  }

  skyline(group, t);

  return () => {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.emissiveMap?.dispose(); o.material.dispose(); }
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    });
  };
}