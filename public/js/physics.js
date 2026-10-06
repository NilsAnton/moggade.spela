// Delas mellan klient och server – ingen three.js här, bara arrayer [x, y, z].

// MAX_HS = högsta tillåtna fart i sidled (dash, bunny hop och glidhopp kan aldrig gå över den)
export const PLAYER = { R: 0.4, H: 1.8, EYE: 1.65, STEP: 0.55, GRAVITY: 22, JUMP: 7.6, MAX_HS: 24 };
export const HITBOX = { BODY_R: 0.38, BODY_H: 1.45, HEAD_R: 0.25, HEAD_TOP: 1.9 };

export function makeSolids(map) {
  return map.filter((b) => b.solid).map((b) => ({
    min: [b.p[0] - b.s[0] / 2, b.p[1] - b.s[1] / 2, b.p[2] - b.s[2] / 2],
    max: [b.p[0] + b.s[0] / 2, b.p[1] + b.s[1] / 2, b.p[2] + b.s[2] / 2],
  }));
}

// Returnerar den överlappande lådan med högst topp (för att kunna kliva upp/landa rätt).
export function collide(solids, p) {
  const { R, H } = PLAYER;
  let best = null;
  for (const b of solids) {
    if (p[0] + R > b.min[0] && p[0] - R < b.max[0] &&
        p[2] + R > b.min[2] && p[2] - R < b.max[2] &&
        p[1] + H > b.min[1] && p[1] < b.max[1]) {
      if (!best || b.max[1] > best.max[1]) best = b;
    }
  }
  return best;
}

// Som collide, men med lite marginal – positioner skickas avrundade till 0.01 över nätet.
export function stuck(solids, p) {
  const R = PLAYER.R - 0.05, y = p[1] + 0.05, H = PLAYER.H - 0.1;
  return solids.some((b) =>
    p[0] + R > b.min[0] && p[0] - R < b.max[0] &&
    p[2] + R > b.min[2] && p[2] - R < b.max[2] &&
    y + H > b.min[1] && y < b.max[1]);
}

// Står fötterna på något (golv, låda, tak)?
export function grounded(solids, p) {
  const R = PLAYER.R;
  return solids.some((b) =>
    p[0] + R > b.min[0] && p[0] - R < b.max[0] &&
    p[2] + R > b.min[2] && p[2] - R < b.max[2] &&
    p[1] >= b.max[1] - 0.05 && p[1] <= b.max[1] + 0.15);
}

// body: { p: [x,y,z] (fötter), v: [x,y,z], ground: bool }
export function moveBody(body, solids, dt) {
  const { STEP, H, GRAVITY } = PLAYER;
  const maxV = Math.max(Math.abs(body.v[0]), Math.abs(body.v[1]), Math.abs(body.v[2]));
  const steps = Math.max(1, Math.ceil((maxV * dt) / 0.15));
  const h = dt / steps;

  for (let s = 0; s < steps; s++) {
    for (const ax of [0, 2]) {
      const d = body.v[ax] * h;
      if (!d) continue;
      body.p[ax] += d;
      const hit = collide(solids, body.p);
      if (!hit) continue;
      const rise = hit.max[1] - body.p[1];
      let stepped = false;
      if (body.ground && rise > 0 && rise <= STEP) {
        const oy = body.p[1];
        body.p[1] = hit.max[1] + 0.001;
        if (collide(solids, body.p)) body.p[1] = oy;
        else stepped = true;
      }
      if (!stepped) { body.p[ax] -= d; body.v[ax] = 0; }
    }

    body.v[1] -= GRAVITY * h;
    body.p[1] += body.v[1] * h;
    body.ground = false;
    const hit = collide(solids, body.p);
    if (hit) {
      if (body.v[1] <= 0) { body.p[1] = hit.max[1]; body.ground = true; }
      else body.p[1] = hit.min[1] - H - 0.001;
      body.v[1] = 0;
    }
  }
}

// Stråle mot AABB. Returnerar { t, axis, sign } (normal = sign längs axis) eller null.
export function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i], s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, axis: -1, sign: 0 };
  return { t: tmin, axis, sign };
}

export function raycastWorld(solids, o, d, maxT = 300) {
  let best = null;
  for (const b of solids) {
    const h = rayBox(o, d, b.min, b.max);
    if (h && h.t < maxT && (!best || h.t < best.t)) best = h;
  }
  if (!best) return null;
  const n = [0, 0, 0];
  if (best.axis >= 0) n[best.axis] = best.sign;
  else { n[0] = -d[0]; n[1] = -d[1]; n[2] = -d[2]; }
  return { t: best.t, n };
}

// low = glider: hela kroppen blir lägre
export function hitboxes(x, y, z, low = false) {
  const { BODY_R, HEAD_R } = HITBOX;
  const BODY_H = low ? 0.85 : HITBOX.BODY_H;
  const HEAD_TOP = low ? 1.3 : HITBOX.HEAD_TOP;
  return {
    head: { min: [x - HEAD_R, y + BODY_H, z - HEAD_R], max: [x + HEAD_R, y + HEAD_TOP, z + HEAD_R] },
    body: { min: [x - BODY_R, y, z - BODY_R], max: [x + BODY_R, y + BODY_H, z + BODY_R] },
  };
}
