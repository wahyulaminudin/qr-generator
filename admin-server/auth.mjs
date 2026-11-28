/* GitHub OAuth server. No employee database; existing public QR URLs stay unchanged. */
const FLOW_COOKIE = '__Host-employee-flow';
const SESSION_COOKIE = '__Host-employee-session';
const SESSION_SECONDS = 4 * 60 * 60;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const decode = text => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid token');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
};
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const securityHeaders = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function response(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', ...extra } });
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
}
function readCookie(request, name) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(payload, secret) {
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}
async function verify(token, config, kind, now) {
  try {
    if (token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(config.secret), decode(parts[1]), encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (payload.kind !== kind || payload.aud !== config.origin || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || payload.exp <= now || payload.iat > now + 30 || payload.exp - payload.iat > (kind === 'flow' ? 600 : SESSION_SECONDS)) return null;
    return payload;
  } catch { return null; }
}
function configFrom(env) {
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || env.SESSION_SECRET?.length < 32 || !env.SESSION_SECRET || !/^\d+$/.test(env.ADMIN_GITHUB_ID)) throw new Error('Missing server configuration');
  const profile = new URL(env.PUBLIC_PROFILE_BASE);
  if (profile.protocol !== 'https:' || profile.username || profile.password || profile.search || profile.hash || !profile.pathname.endsWith('/')) throw new Error('Invalid public profile URL');
  return { origin: origin.origin, profileBase: profile.href, id: String(env.ADMIN_GITHUB_ID), clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, secret: env.SESSION_SECRET };
}
function loginPage(message = '', enabled = true) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Login Admin — Employee Identity</title><link rel="stylesheet" href="/style.css"><style>body{min-height:100vh;display:grid;place-items:center;padding:24px;background:#092542 url('/assets/skyline.svg') center bottom/cover no-repeat}.login-card{width:min(100%,440px);background:white;border:1px solid #dfe7f1;border-radius:16px;padding:36px;box-shadow:0 24px 80px #0003}.login-card h1{font-size:30px}.login-card p{color:#687b93;font-size:15px;line-height:1.7;margin:16px 0}.login-card .button{display:block;text-align:center;margin-top:24px}.login-card .message{background:#f2f6fc;padding:14px;border-radius:8px;color:#244465}.login-card small{display:block;color:#687b93;line-height:1.7;margin-top:24px}</style></head><body><main class="login-card"><p class="section-kicker">EMPLOYEE IDENTITY</p><h1>Akses Generator</h1><p>Masuk dengan akun GitHub administrator untuk membuat QR Code karyawan.</p>${message ? `<p class="message" role="status">${escapeHTML(message)}</p>` : ''}${enabled ? '<a class="button button-primary" href="/auth/github">Masuk dengan GitHub</a>' : ''}<small>Gunakan akun GitHub Anda. Password hanya dimasukkan di github.com.<br>Halaman hasil scan tetap dapat dibuka tanpa login.</small></main></body></html>`;
}
export function createHandler({ generatorHTML, reportaseHTML = '', fetchGitHub = fetch, now = () => Math.floor(Date.now() / 1000), reportFailure = () => {} }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    // Explicitly allow only public assets. Private source and HTML never fall through.
    if (request.method === 'GET' && (/^\/assets\/[A-Za-z0-9_./ -]+$/.test(pathname.replace(/%20/gi, ' ')) || ['/style.css', '/script.js', '/qr-tools.js', '/photo-tools.js', '/generator-types.css', '/reportase.css', '/reportase.js', '/reportase-tools.js'].includes(pathname))) {
      return env.ASSETS ? env.ASSETS.fetch(request) : response('Not found', 404);
    }
    if (!['/', '/index.html', '/generator', '/generator-reportase', '/auth/github', '/auth/callback', '/auth/logout'].includes(pathname)) return response('Not found', 404);
    let config;
    try { config = configFrom(env); } catch { return response(loginPage('Login admin belum diaktifkan. Konfigurasi server harus diselesaikan terlebih dahulu.', false), 503); }
    if (url.origin !== config.origin) return response('Origin tidak diizinkan.', 400);
    const session = await verify(readCookie(request, SESSION_COOKIE), config, 'session', now());
    const authorized = session?.id === config.id && typeof session.csrf === 'string' && /^[A-Za-z0-9_-]{43}$/.test(session.csrf);
    if (pathname === '/auth/logout') {
      const origin = request.headers.get('Origin');
      if (!authorized || request.method !== 'POST' || (origin && origin !== config.origin && origin !== 'null')) return response('Permintaan tidak diizinkan.', 403);
      // A no-referrer HTML policy can produce Origin:null on a same-site form POST.
      // The unpredictable, session-bound hidden token remains required in every case.
      const body = await request.text();
      if (body.length > 1024 || new URLSearchParams(body).get('csrf') !== session.csrf) return response('Permintaan tidak diizinkan.', 403);
      return response(null, 303, { Location: '/', 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
    }
    if (request.method !== 'GET') return response('Method not allowed', 405, { Allow: 'GET' });
    if (pathname === '/generator' || pathname === '/generator-reportase') {
      if (!authorized) return response(null, 303, { Location: '/' });
      const source = pathname === '/generator-reportase' ? reportaseHTML : generatorHTML;
      if (!source) return response('Not found', 404);
      const html = source.replaceAll('href="reportase.html"', 'href="/generator-reportase"').replaceAll('href="index.html"', 'href="/generator"').replace('id="base-url"', `id="base-url" value="${escapeHTML(config.profileBase)}"`).replace('</nav>', `</nav><form action="/auth/logout" method="post" style="padding:0"><input type="hidden" name="csrf" value="${escapeHTML(session.csrf)}"><button class="text-button" type="submit">Keluar</button></form>`);
      return response(html);
    }
    if (pathname === '/' || pathname === '/index.html') {
      if (authorized) return response(null, 303, { Location: '/generator' });
      const messages = { denied: 'Akun GitHub ini tidak memiliki akses administrator.', cancelled: 'Login dibatalkan. Silakan coba kembali.', failed: 'Login tidak berhasil. Silakan coba kembali.' };
      return response(loginPage(messages[url.searchParams.get('error')] || ''));
    }
    if (pathname === '/auth/github') {
      const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
      const nonce = random();
      const verifier = random();
      const timestamp = now();
      const flow = await sign({ kind: 'flow', aud: config.origin, iat: timestamp, exp: timestamp + 600, nonce, verifier }, config.secret);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/auth/callback`, state: nonce, code_challenge: encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))), code_challenge_method: 'S256', allow_signup: 'false', scope: '' }).toString();
      return response(null, 303, { Location: authorize.href, 'Set-Cookie': cookie(FLOW_COOKIE, flow, 600) });
    }
    // The token exchange and immutable GitHub user-ID check happen only on the server.
    const headers = new Headers({ ...securityHeaders, Location: '/?error=failed' });
    headers.append('Set-Cookie', cookie(FLOW_COOKIE, '', 0));
    let phase = 'flow';
    try {
      const flow = await verify(readCookie(request, FLOW_COOKIE), config, 'flow', now());
      const codes = url.searchParams.getAll('code');
      const states = url.searchParams.getAll('state');
      if (!flow || states.length !== 1 || flow.nonce !== states[0] || codes.length !== 1 || !codes[0] || codes[0].length > 512) throw new Error('Invalid OAuth flow');
      phase = 'token-exchange';
      // Workers supports manual/follow, not redirect:error. Non-2xx responses are rejected below.
      const tokenResponse = await fetchGitHub('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Employee-Identity-Admin' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: codes[0], redirect_uri: `${config.origin}/auth/callback`, code_verifier: flow.verifier }).toString(), signal: AbortSignal.timeout(10000) });
      if (!tokenResponse.ok) { phase = `token-http-${tokenResponse.status}`; throw new Error('Token exchange failed'); }
      phase = 'token-response';
      const token = await tokenResponse.json();
      if (!token.access_token || token.error || token.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid access token');
      phase = 'identity';
      const userResponse = await fetchGitHub('https://api.github.com/user', { redirect: 'manual', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Employee-Identity-Admin' }, signal: AbortSignal.timeout(10000) });
      if (!userResponse.ok) throw new Error('Identity check failed');
      const user = await userResponse.json();
      if (String(user.id) !== config.id) {
        headers.set('Location', '/?error=denied');
      } else {
        phase = 'session';
        const timestamp = now();
        const signed = await sign({ kind: 'session', aud: config.origin, id: config.id, csrf: encode(crypto.getRandomValues(new Uint8Array(32))), iat: timestamp, exp: timestamp + SESSION_SECONDS }, config.secret);
        headers.append('Set-Cookie', cookie(SESSION_COOKIE, signed, SESSION_SECONDS));
        headers.set('Location', '/generator');
      }
    } catch (error) { reportFailure(phase, ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.name : 'Error'); /* No error messages or sensitive values. */ }
    return new Response(null, { status: 303, headers });
  };
}
