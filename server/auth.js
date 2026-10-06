// Inloggning med Discord (OAuth2). Vi frågar bara efter "identify": namn och profilbild, inget annat.
// Kräver DISCORD_CLIENT_ID och DISCORD_CLIENT_SECRET. Utan dem går det bara att spela som gäst.
import express from 'express';
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'lockdown_session';
const STATE_COOKIE = 'lockdown_oauth';
const DISCORD = 'https://discord.com';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, req, name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export const discordEnabled = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

export function avatarUrl(discordId, avatar) {
  return avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64` : null;
}

export function authRouter(db) {
  const r = express.Router();
  const redirectUri = (req) => `${process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`}/auth/discord/callback`;

  r.get('/auth/discord', (req, res) => {
    if (!discordEnabled()) return res.status(404).send('Discord-inloggning är inte inställd på servern.');
    const state = crypto.randomBytes(16).toString('base64url');
    setCookie(res, req, STATE_COOKIE, state, 600);
    const q = new URLSearchParams({
      response_type: 'code', client_id: process.env.DISCORD_CLIENT_ID, scope: 'identify',
      redirect_uri: redirectUri(req), state, prompt: 'none',
    });
    res.redirect(`${DISCORD}/oauth2/authorize?${q}`);
  });

  r.get('/auth/discord/callback', async (req, res) => {
    const fail = (why) => { console.log(`[inloggning] misslyckades: ${why}`); res.redirect('/?login=fel'); };
    if (!discordEnabled()) return fail('inte inställd');
    const { code, state } = req.query;
    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    setCookie(res, req, STATE_COOKIE, '', 0);
    if (!code || !state || state !== expected) return fail('fel state');
    try {
      const tokenRes = await fetch(`${DISCORD}/api/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri(req),
          client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
        }),
      });
      if (!tokenRes.ok) return fail(`token ${tokenRes.status}`);
      const { access_token: accessToken } = await tokenRes.json();
      const meRes = await fetch(`${DISCORD}/api/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!meRes.ok) return fail(`användare ${meRes.status}`);
      const u = await meRes.json();
      const userId = db.upsertDiscordUser(String(u.id), String(u.global_name || u.username).slice(0, 32), avatarUrl(u.id, u.avatar));
      const s = db.createSession(userId);
      setCookie(res, req, SESSION_COOKIE, s.token, s.maxAge);
      res.redirect('/');
    } catch (e) {
      fail(e.message);
    }
  });

  r.post('/auth/logout', (req, res) => {
    db.endSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    setCookie(res, req, SESSION_COOKIE, '', 0);
    res.json({ ok: true });
  });

  return r;
}

// Vem är inloggad? (för både HTTP och WebSocket – kakan följer med automatiskt)
export function userIdFrom(db, req) {
  return db.sessionUser(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}
