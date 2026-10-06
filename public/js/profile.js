// Spelarprofil på klienten. Servern räknar all XP och statistik och skickar den hit.
// Inloggad (Discord): profilen sparas på servern. Gäst: den sparas bara i den här webbläsaren.
import { freshProfile, cleanProfile, levelInfo as infoFor } from './progress.js';

export { rankName, XP, REWARDS, TITLES, COLORS, hasReward, newRewards } from './progress.js';

const KEY = 'moggade-profile'; // samma nyckel som innan namnbytet, så att ingen tappar sina framsteg

export const profile = freshProfile();
export const account = { user: null, discord: false, loaded: false };

function loadGuest() {
  try { return cleanProfile(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return freshProfile(); }
}
Object.assign(profile, loadGuest());

export const levelInfo = (xp = profile.xp) => infoFor(xp);

// Ny profil från servern
export function setProfile(p) {
  Object.assign(profile, cleanProfile(p));
  if (!account.user) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
  }
}

// Frågar servern vem vi är. Första inloggningen flyttar gäst-profilen till kontot (en gång).
export async function loadAccount() {
  try {
    const me = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json());
    account.discord = !!me.discord;
    account.user = me.user;
    if (me.user) {
      const guest = loadGuest();
      if (me.user.canImport && guest.xp > 0) {
        const r = await fetch('/api/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prof: guest }),
        }).then((x) => x.json());
        if (r.ok) me.user.prof = r.prof;
      }
      Object.assign(profile, cleanProfile(me.user.prof));
    }
  } catch {}
  account.loaded = true;
  return account;
}

export async function logout() {
  try { await fetch('/auth/logout', { method: 'POST' }); } catch {}
  account.user = null;
  Object.assign(profile, loadGuest());
}
