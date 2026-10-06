import { RULES } from './config.js';
import * as THREE from 'three';
import { MAPS } from './maps.js';
import { WEAPONS, GUNGAME } from './weapons.js';
import { CHARACTERS } from './characters.js';
import { G, gun, me, remotes, roster } from './state.js';
import { $, camera, esc, weapon } from './core.js';
import { currentSpread } from './local.js';

// ---------- HUD ----------
export function hitmarker(kill) {
  const el = $('hitmarker');
  el.className = '';
  void el.offsetWidth;
  el.className = kill ? 'show kill' : 'show';
}

export function damageIndicator(from) {
  const dx = from[0] - me.p[0], dz = from[1] - me.p[2];
  const rel = Math.atan2(-dx, -dz) - me.yaw;
  const el = document.createElement('div');
  el.className = 'dmg';
  el.style.transform = `translate(-50%, -50%) rotate(${-rel}rad)`;
  $('dmg-indicators').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function feed(html) {
  const el = document.createElement('div');
  el.className = 'entry';
  el.innerHTML = html;
  const kf = $('killfeed');
  kf.prepend(el);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 5500);
  setTimeout(() => el.remove(), 6000);
}

export let centerTimer = 0;
export function centerMsg(title, sub) {
  const el = $('center-msg');
  el.innerHTML = `<div class="big">${title}</div><div class="small">${sub}</div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

export const gg = () => G.mode === 'gungame' && !G.practice;
export const levelName = (lvl) => `${lvl + 1}/${GUNGAME.length} ${WEAPONS[GUNGAME[lvl]?.w]?.name ?? ''}`;

export function sortedRoster() {
  return [...roster.values()].sort((a, b) => (gg() ? b.lvl - a.lvl : 0) || b.k - a.k || a.d - b.d);
}

export function renderScoreboard() {
  $('sb-mode').textContent = gg() ? 'GUN GAME' : 'FREE FOR ALL';
  $('sb-limit').textContent = gg()
    ? `${MAPS[G.mapIndex]?.name ?? ''} · första kniv-kill vinner`
    : `${MAPS[G.mapIndex]?.name ?? ''} · först till ${G.killLimit} kills`;
  $('sb-body').innerHTML = sortedRoster().map((p, i) => `
    <tr class="${p.id === me.id ? 'me' : ''}">
      <td>${i + 1}</td>
      <td><span class="rk${p.acc || p.bot ? '' : ' guest'}" title="${p.acc ? 'Inloggad' : p.bot ? 'Bot' : 'Gäst (nivån sparas bara lokalt)'}">${p.r ?? 1}</span><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.ti ? ` <em class="ti">${esc(p.ti)}</em>` : ''}</td>
      <td class="muted">${gg() ? levelName(p.lvl) : CHARACTERS[p.c]?.name ?? ''}</td>
      <td>${p.k}</td><td>${p.d}</td><td>${(p.k / Math.max(1, p.d)).toFixed(2)}</td><td>${p.ping}</td>
    </tr>`).join('');
}

export function renderTopbar() {
  const list = sortedRoster();
  const mine = roster.get(me.id);
  const rank = list.findIndex((p) => p.id === me.id) + 1;
  const leader = list[0];
  if (gg()) {
    const next = GUNGAME[G.myLevel + 1];
    $('my-score').innerHTML = mine
      ? `<b>NIVÅ ${G.myLevel + 1}</b> <span>/ ${GUNGAME.length}</span> <small>${next ? `NÄSTA: ${WEAPONS[next.w].name}` : 'KNIV-KILL VINNER!'} · PLATS ${rank}</small>`
      : '';
  } else {
    $('my-score').innerHTML = mine ? `<b>${mine.k}</b> <span>/ ${G.killLimit}</span> <small>PLATS ${rank} AV ${list.length}</small>` : '';
  }
  $('leader').innerHTML = leader && leader.id !== me.id
    ? `LEDARE <b style="color:${leader.color}">${esc(leader.name)}</b> ${gg() ? `nivå ${leader.lvl + 1}` : leader.k}`
    : list.length > 1 ? '<b>DU LEDER</b>' : '';
  $('ping').textContent = mine ? `${mine.ping} ms` : '';
}

export function showScoreboard(show) {
  $('scoreboard').classList.toggle('hidden', !show);
}

export function updateHud(now) {
  if (!G.playing) return;
  $('hp-num').textContent = me.hp;
  const frac = me.hp / (me.maxHp || 100);
  const hp = $('health');
  hp.style.setProperty('--hp', Math.max(0, Math.min(1, frac)));
  hp.classList.toggle('warn', frac <= 0.6 && frac > 0.3);
  hp.classList.toggle('crit', frac <= 0.3);
  const cd = Math.max(0, me.abilityReady - now);
  $('ability-name').textContent = G.C.ability.name;
  $('ability-cd').textContent = cd > 0 ? (cd / 1000).toFixed(1) : '';
  $('ability').classList.toggle('ready', cd <= 0);
  $('ability').style.setProperty('--p', G.C.ability.cooldown ? 1 - cd / G.C.ability.cooldown : 1);
  $('ammo-num').textContent = G.W.melee ? '—' : gun.ammo;
  $('ammo-max').textContent = G.W.melee ? '' : G.W.mag;
  $('ammo').querySelector('.sep').classList.toggle('hidden', !!G.W.melee);
  $('ammo').style.setProperty('--r', gun.reloading ? Math.min(1, (now - gun.reloadStart) / G.W.reloadMs) : 0);
  const lowAmmo = !G.W.melee && gun.ammo <= Math.ceil(G.W.mag / 4);
  $('ammo-num').classList.toggle('low', lowAmmo);
  $('weapon-name').textContent = G.W.name;
  $('slot-1').textContent = G.primaryW?.name ?? '';
  $('slots').dataset.s = G.slot;
  $('reload-hint').textContent = gun.reloading ? 'LADDAR OM…' : lowAmmo ? 'R – LADDA OM' : '';
  $('vignette').style.opacity = me.alive && frac < 0.6 ? (1 - frac / 0.6) * 0.85 : 0;
  $('protect').classList.toggle('hidden', !(me.alive && me.protect));
  const radarOn = me.alive && now < G.radarUntil, armorOn = me.alive && now < G.armorUntil;
  for (const r of remotes.values()) r.setMarked(radarOn);
  $('buff').textContent = radarOn ? `RADAR ${((G.radarUntil - now) / 1000).toFixed(1)}` : armorOn ? `PANSAR ${((G.armorUntil - now) / 1000).toFixed(1)}` : '';
  $('buff').className = radarOn ? 'radar' : armorOn ? 'armor' : 'hidden';
  $('scope').className = G.scoped ? (G.W.scope === 'dmr' ? 'dmr' : '') : 'hidden';

  const ch = $('crosshair');
  ch.classList.toggle('hidden', !me.alive || (G.ads && weapon.adsK > 0.5) || me.sprint);
  ch.style.setProperty('--gap', `${6 + currentSpread() * 500}px`);

  const left = Math.max(0, G.roundDeadline - now) / 1000;
  $('timer').textContent = G.roundOver ? '' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('timer').classList.toggle('low', left < 30);

  if (!me.alive && !G.roundOver) {
    const left = Math.max(0, RULES.respawnMs - (now - G.deathAt));
    $('death-timer').textContent = left > 0 ? `TILLBAKA OM ${(left / 1000).toFixed(1)} S` : 'SPAWNAR…';
    $('death-bar').style.width = `${(1 - left / Math.max(1, RULES.respawnMs)) * 100}%`;
  }
  if (G.roundOver) {
    $('re-timer').textContent = `Ny runda om ${Math.max(0, Math.ceil((G.roundEndAt - now) / 1000))}`;
  }
}

// ---------- skadesiffror ----------
export const dmgNums = [];
export const _proj = new THREE.Vector3();
export function damageNumber(pos, amount, head, kill) {
  const el = document.createElement('div');
  el.className = 'dmg-num' + (head ? ' head' : '') + (kill ? ' kill' : '');
  el.textContent = amount;
  $('dmg-numbers').appendChild(el);
  dmgNums.push({ el, pos, t: 0, dx: (Math.random() - 0.5) * 30 });
}
export function updateDamageNumbers(dt) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.t += dt;
    if (d.t > 0.9) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    _proj.copy(d.pos).project(camera);
    if (_proj.z > 1) { d.el.style.opacity = 0; continue; }
    const x = (_proj.x * 0.5 + 0.5) * innerWidth + d.dx * d.t, y = (-_proj.y * 0.5 + 0.5) * innerHeight - d.t * 60;
    d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - d.t) * 2})`;
    d.el.style.opacity = d.t > 0.6 ? (0.9 - d.t) / 0.3 : 1;
  }
}
