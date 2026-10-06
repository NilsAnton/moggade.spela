import { RULES } from './config.js';
import * as THREE from 'three';
import { MAPS } from './maps.js';
import { WEAPONS } from './weapons.js';
import { CHARACTERS } from './characters.js';
import { profile, account, levelInfo } from './profile.js';
import { RemotePlayer } from './player.js';
import { G, gun, killTimes, me, remotes, roster, settings } from './state.js';
import { $, MULTI, STREAKS, camera, effects, esc, loadMap, pads, scene, sound, weapon } from './core.js';
import { centerMsg, damageIndicator, damageNumber, feed, hitmarker, renderScoreboard, renderTopbar, showScoreboard } from './hud.js';
import { onProf, showMenu, xpPopup } from './menu.js';
import { chatLine } from './input.js';
import { panFor, showWeapon } from './local.js';

// ---------- nätverk ----------
export function connect() {
  $('status').textContent = 'Ansluter…';
  G.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  G.ws.onopen = () => {
    G.roundXp = 0;
    send({
      t: 'join', mode: G.mode, name: settings.name, color: settings.color, title: settings.title ?? '', c: settings.char,
      prof: account.user ? undefined : profile, // gäster tar med sin profil, inloggade har den på servern
    });
  };
  G.ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  G.ws.onclose = () => {
    G.ws = null;
    G.playing = false;
    me.alive = false;
    for (const r of remotes.values()) r.dispose();
    remotes.clear();
    roster.clear();
    $('status').textContent = G.leaving ? '' : 'Anslutningen bröts. Välj ett spelläge för att ansluta igen.';
    G.leaving = false;
    $('death').classList.add('hidden');
    $('roundend').classList.add('hidden');
    document.exitPointerLock();
    showMenu(true);
  };
}

export function send(m) {
  if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(m));
}

export function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      me.id = m.id;
      G.killLimit = m.killLimit;
      G.playing = true;
      G.roundOver = !!m.roundOver;
      G.roundDeadline = performance.now() + m.left;
      loadMap(m.map);
      pads.setState(m.pads);
      $('status').textContent = '';
      showMenu(!G.locked);
      break;
    case 'spawn':
      G.C = CHARACTERS[m.c] ?? CHARACTERS[0];
      G.W = G.primaryW = WEAPONS[m.w ?? G.C.weapon];
      G.slot = 0;
      G.slotGun = [null, null];
      showWeapon();
      G.myLevel = m.lvl ?? 0;
      me.maxHp = m.hp;
      me.slideT = me.dashT = 0;
      me.slamArmed = false;
      me.abilityReady = 0;
      G.radarUntil = G.armorUntil = 0;
      me.p = [...m.p];
      me.v = [0, 0, 0];
      me.yaw = m.yaw;
      me.pitch = 0;
      me.sp = m.sp;
      me.alive = true;
      me.hp = m.hp;
      me.streak = 0;
      gun.ammo = G.W.mag;
      gun.reloading = false;
      gun.recoil = 0;
      gun.bloom = 0;
      G.eyeY = null;
      $('death').classList.add('hidden');
      sound.spawn();
      break;
    case 's': onSnapshot(m); break;
    case 'roster': onRoster(m); break;
    case 'shot': {
      const r = remotes.get(m.id);
      if (!r) break;
      const from = r.muzzlePos(new THREE.Vector3());
      const ends = Array.isArray(m.e[0]) ? m.e : [m.e];
      for (const e of ends) {
        const to = new THREE.Vector3(...e);
        effects.tracer(from, to);
        if (!m.hit) effects.sparksAt(to);
      }
      if (WEAPONS[m.w]?.melee) {
        if (camera.position.distanceTo(from) < 15) sound.whoosh();
        break;
      }
      effects.flash(from);
      sound.shoot(Math.max(0.1, camera.position.distanceTo(from)), panFor(from), WEAPONS[m.w]?.id);
      break;
    }
    case 'hc':
      hitmarker(m.kill);
      if (m.d) {
        const r = remotes.get(m.v);
        if (r) damageNumber(r.pos.clone().setY(r.pos.y + (m.head ? 2 : 1.4)), m.d, m.head, m.kill);
      }
      if (m.head) sound.headshot(); else sound.hit();
      if (m.kill) sound.kill();
      break;
    case 'hurt':
      me.hp = m.hp;
      damageIndicator(m.from);
      sound.hurt();
      G.shake = 0.6;
      $('vignette').classList.remove('flash');
      void $('vignette').offsetWidth;
      $('vignette').classList.add('flash');
      break;
    case 'kill': onKill(m); break;
    case 'roundEnd': {
      G.roundOver = true;
      G.roundEndAt = performance.now() + m.ms;
      const w = roster.get(m.winner);
      $('re-title').innerHTML = m.winner === me.id ? 'DU VANN!' : `<span style="color:${w?.color}">${esc(w?.name ?? '?')}</span> VANN`;
      if (m.winner === me.id) sound.levelUp();
      { const li = levelInfo(); $('re-xp').innerHTML = `<b>+${G.roundXp} XP</b> denna runda · nivå ${li.lvl} ${li.rank} <i><em style="width:${(li.cur / li.need) * 100}%"></em></i>`; }
      G.roundXp = 0;
      G.voteMaps = m.maps;
      G.votes = m.maps.map(() => 0);
      G.myVote = -1;
      renderVotes();
      $('roundend').classList.remove('hidden');
      G.firing = false;
      showScoreboard(true);
      break;
    }
    case 'roundStart':
      G.roundOver = false;
      G.roundDeadline = performance.now() + m.left;
      loadMap(m.map);
      pads.setState(m.pads);
      for (const r of remotes.values()) r.buf.length = 0;
      $('roundend').classList.add('hidden');
      showScoreboard(false);
      centerMsg(MAPS[m.map].name, 'NY RUNDA');
      break;
    case 'votes': G.votes = m.v; renderVotes(); break;
    case 'level':
      G.myLevel = m.lvl;
      if (m.down) {
        centerMsg('KNIVAD!', `Ner till nivå ${m.lvl + 1}`);
        break;
      }
      G.primaryW = WEAPONS[m.w];
      G.slotGun[0] = null; // nytt vapen = fullt magasin
      if (G.slot === 0) {
        G.W = G.primaryW;
        showWeapon();
        gun.ammo = G.W.mag;
        gun.reloading = false;
      }
      centerMsg(`NIVÅ ${m.lvl + 1}`, G.primaryW.name);
      sound.stim();
      renderTopbar();
      break;
    case 'fx': {
      if (m.k === 'slam') {
        const p = new THREE.Vector3(...m.p);
        effects.shockwave(p);
        if (m.id !== me.id) sound.slam(camera.position.distanceTo(p), panFor(p));
      } else if (m.k === 'armor') {
        if (m.id === me.id) G.armorUntil = performance.now() + m.ms;
        else remotes.get(m.id)?.setArmor(m.ms);
        const r = remotes.get(m.id);
        const pos = m.id === me.id ? new THREE.Vector3(me.p[0], me.p[1] + 1, me.p[2]) : r?.pos.clone().setY(r.pos.y + 1);
        if (pos) effects.heal(pos);
      } else if (m.k === 'stim') {
        const pos = m.id === me.id ? new THREE.Vector3(me.p[0], me.p[1] + 1, me.p[2]) : remotes.get(m.id)?.pos.clone().setY((remotes.get(m.id)?.pos.y ?? 0) + 1);
        if (pos) effects.heal(pos);
      }
      break;
    }
    case 'ping': send({ t: 'pong', s: m.s }); break;
    case 'prof': onProf(m); break;
    case 'wp': remotes.get(m.id)?.setWeapon(m.w); break;
    case 'pads': {
      pads.setState(m.s);
      const pos = pads.position(m.i);
      if (pos) effects.heal(pos.clone().setY(pos.y + 1));
      if (m.by === me.id) { sound.stim(); xpPopup(`+${RULES.padHp} HP`); }
      break;
    }
    case 'pos':
      // servern godkände inte rörelsen – tillbaka till senaste giltiga position
      me.p = [...m.p];
      me.v = [0, 0, 0];
      me.sp = m.sp;
      me.dashT = me.slideT = 0;
      G.eyeY = null;
      break;
    case 'chat': {
      const p = roster.get(m.id);
      chatLine(`<b style="color:${p?.color ?? '#fff'}">${esc(p?.name ?? '?')}:</b> ${esc(m.text)}`);
      sound.chat();
      break;
    }
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) { r.dispose(); remotes.delete(m.id); }
      break;
    }
    case 'msg': feed(`<span class="sys">${esc(m.text)}</span>`); break;
    case 'full': $('status').textContent = 'Servern är full'; break;
  }
}

export function onSnapshot(m) {
  const now = performance.now();
  const off = m.ts - now;
  if (G.serverOffset === null || Math.abs(off - G.serverOffset) > 250) G.serverOffset = off;
  else G.serverOffset += (off - G.serverOffset) * 0.05;

  for (const [id, x, y, z, yaw, pitch, hp, alive, sp, prot, , sl, maxHp] of m.p) {
    if (id === me.id) { me.hp = hp; me.maxHp = maxHp; me.protect = !!prot; continue; }
    let r = remotes.get(id);
    if (!r) {
      r = new RemotePlayer(scene);
      const info = roster.get(id);
      if (info) { r.setInfo(info.name, info.color); r.setWeapon(info.w); }
      remotes.set(id, r);
    }
    r.push(m.ts, x, y, z, yaw, pitch, alive, sp, prot, sl);
  }
}

export function onRoster(m) {
  G.killLimit = m.killLimit;
  roster.clear();
  for (const p of m.list) {
    roster.set(p.id, p);
    const r = remotes.get(p.id);
    if (r) { r.setInfo(p.name, p.color); r.setWeapon(p.w); }
  }
  for (const [id, r] of remotes) if (!roster.has(id)) { r.dispose(); remotes.delete(id); }
  renderScoreboard();
  renderTopbar();
}

export function updateDeathWeapon() {
  $('death-weapon').innerHTML = `<span class="on">${CHARACTERS[settings.char].name}</span><span><kbd>H</kbd>byt gubbe</span>`;
}

export function renderVotes() {
  $('re-next').innerHTML = `<div class="vote-title">RÖSTA PÅ NÄSTA BANA</div><div class="votes">${G.voteMaps.map((name, i) => `
    <div class="vote ${i === G.myVote ? 'mine' : ''}"><kbd>${i + 1}</kbd> <b>${name}</b> <span>${G.votes[i] ?? 0} röst${G.votes[i] === 1 ? '' : 'er'}</span></div>`).join('')}</div>`;
}

export function onKill(m) {
  const k = roster.get(m.k), v = roster.get(m.v);
  const name = (p, id) => `<b style="color:${p?.color ?? '#fff'}">${esc(id === me.id ? 'DU' : p?.name ?? '?')}</b>`;
  const wname = m.how === 'slam' ? 'MARKSTÖT' : m.how === 'knife' ? 'KNIV' : WEAPONS[m.w]?.name ?? '';
  feed(`${name(k, m.k)} <span class="gun">${m.head ? '⌖ ' : ''}${wname}</span> ${name(v, m.v)}`);
  remotes.get(m.v)?.die();

  if (m.v === me.id) {
    killTimes.length = 0;
    me.alive = false;
    G.firing = false;
    G.scoped = false;
    G.deathAt = performance.now();
    G.killerId = m.k;
    $('death-by').innerHTML = `av ${name(k, m.k)} · ${wname}${m.head ? ' · HEADSHOT' : ''}`;
    updateDeathWeapon();
    $('death').classList.remove('hidden');
    sound.death();
  } else if (m.k === me.id) {
    me.streak = m.streak;
    const now = performance.now();
    while (killTimes.length && now - killTimes[0] > 4000) killTimes.shift();
    killTimes.push(now);
    const multi = MULTI[Math.min(killTimes.length, 5)];
    G.fovPunch = 1;
    if (multi) sound.multi(killTimes.length); // XP:n för killen kommer från servern
    centerMsg(multi ?? (m.head ? 'HEADSHOT' : 'ELIMINERAD'), `${esc(v?.name ?? '')}${STREAKS[m.streak] ? ` · ${STREAKS[m.streak]}` : ''}`);
    if (multi && killTimes.length >= 3) feed(`<span class="sys">${esc(k?.name ?? '?')} – ${multi}!</span>`);
  }
  if (STREAKS[m.streak] && m.streak >= 5) feed(`<span class="sys">${esc(k?.name ?? '?')} ${STREAKS[m.streak]} (${m.streak} i rad)</span>`);
}
