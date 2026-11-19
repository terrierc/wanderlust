// Passphrase gate for the whole site. Without a valid access cookie, nothing is served: not the app,
// not your data, not the map files. The passphrase lives only in the Netlify environment variable
// WANDERLUST_PASSPHRASE; changing it signs every device out.
const COOKIE = 'elsewhere_access', DAYS = 180, enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(secret, msg) { const k = await crypto.subtle.importKey('raw', enc.encode('elsewhere-gate|' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64(await crypto.subtle.sign('HMAC', k, enc.encode(msg))); }
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// Two people, two passphrases: WANDERLUST_PASSPHRASE (You) and WANDERLUST_PASSPHRASE_PARTNER (Partner).
// Each can be changed or removed on its own, which signs only that person out.
const people = () => [['me', Netlify.env.get('WANDERLUST_PASSPHRASE')], ['partner', Netlify.env.get('WANDERLUST_PASSPHRASE_PARTNER')]].filter(([, s]) => s && s.length >= 10);
async function who(token) {
  const parts = (token || '').split('.'); if (!parts[0] || +parts[0] < Date.now() / 1000) return null;
  for (const [id, secret] of people()) {
    if (parts.length === 3 && parts[1] === id && same(parts[2], await sign(secret, parts[0] + '|' + id))) return id;
    if (parts.length === 2 && id === 'me' && same(parts[1], await sign(secret, parts[0]))) return id; // earlier single-passphrase cookies
  }
  return null;
}
const page = (msg = '') => `<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Wanderlust</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e2721;color:#f4f0e6;font:17px/1.5 system-ui,sans-serif}form{width:min(92vw,380px)}h1{font:400 2.4rem Georgia,serif;margin:0 0 .2em}p{color:#c9d3c8}label{display:block;font-weight:600;margin:18px 0 6px}input{box-sizing:border-box;width:100%;min-height:48px;border-radius:10px;border:1px solid #ffffff40;background:#ffffff12;color:#fff;font:inherit;padding:0 14px}button{margin-top:14px;width:100%;min-height:48px;border:0;border-radius:99px;background:#e6cb98;color:#0e2721;font:700 1rem system-ui;cursor:pointer}.e{color:#f3b7a8}</style><form method="post" action="/__unlock"><h1>wanderlust ✦</h1><p>A private travel atlas.</p>${msg ? '<p class="e" role="alert">' + msg + '</p>' : ''}<label for="p">Passphrase</label><input id="p" name="passphrase" type="password" autocomplete="current-password" required autofocus><button>Open</button></form></html>`;
const locked = (req, msg, status = 401) => (req.headers.get('accept') || '').includes('text/html')
  ? new Response(page(msg), { status, headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
  : new Response(JSON.stringify({ error: 'Locked. Open Wanderlust and enter the passphrase.' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async (req, context) => {
  if (!people().length) return new Response('Wanderlust is locked until WANDERLUST_PASSPHRASE (10+ characters) is set in the Netlify site settings.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  const url = new URL(req.url);
  if (/^\/feed\/[a-f0-9]{48}\.ics$/.test(url.pathname)) return context.next(); // calendar apps: the long random token in the URL is the key
  if (url.pathname === '/s/sw.js' || /^\/s\/[A-Za-z0-9_-]{43}(\/data\.json)?\/?$/.test(url.pathname)) { const h = new Headers(req.headers); h.delete('x-elsewhere-person'); return context.next(new Request(req, { headers: h })); } // read-only trip links: the 256-bit token in the URL is the key
  if (url.pathname === '/__unlock' && req.method === 'POST') {
    const form = await req.formData().catch(() => null), given = String(form?.get('passphrase') || '');
    await new Promise(r => setTimeout(r, 700)); // slows guessing
    let person = null; for (const [id, secret] of people()) if (!person && same(await sign(secret, 'check|' + given), await sign(secret, 'check|' + secret))) person = [id, secret]; // first match wins: identical passphrases sign in as You
    if (!person) return locked(req, 'That passphrase did not match.');
    const exp = String(Math.floor(Date.now() / 1000) + DAYS * 86400);
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=${exp}.${person[0]}.${await sign(person[1], exp + '|' + person[0])}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/__lock') return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  const person = await who(context.cookies.get(COOKIE));
  if (person) { const h = new Headers(req.headers); h.set('x-elsewhere-person', person); const res = await context.next(new Request(req, { headers: h })); res.headers.set('X-Robots-Tag', 'noindex, nofollow'); return res; }
  return locked(req);
};
export const config = { path: '/*' };
