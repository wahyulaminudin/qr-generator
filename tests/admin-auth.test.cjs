const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const env = {
  APP_ORIGIN: 'https://admin.example.com', GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret',
  SESSION_SECRET: 'testing-secret-with-at-least-32-characters', ADMIN_GITHUB_ID: '168415197',
  PUBLIC_PROFILE_BASE: 'https://employeeinformation.github.io/',
};
async function fixture({ userId = 168415197, tokenFails = false, tokenRedirects = false } = {}) {
  const { createHandler } = await import(pathToFileURL(path.join(__dirname, '..', 'admin-server', 'auth.mjs')).href);
  let seconds = 100000;
  const calls = [];
  const handler = createHandler({ generatorHTML: source, reportaseHTML: fs.readFileSync(path.join(__dirname, '..', 'reportase.html'), 'utf8'), now: () => seconds, fetchGitHub: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual', 'Cloudflare supports manual redirects; credentials must never follow another origin');
    if (url.endsWith('/access_token') && tokenRedirects) return Response.redirect('https://attacker.example/token', 302);
    if (url.endsWith('/access_token')) return Response.json(tokenFails ? { error: 'bad_verification_code' } : { access_token: 'fixture-token-never-sent-to-browser', token_type: 'bearer' });
    if (url === 'https://api.github.com/user') return Response.json({ id: userId, login: 'test-user' });
    throw new Error('Unexpected outgoing request');
  } });
  const send = (url, init = {}, settings = env) => handler(new Request(new URL(url, env.APP_ORIGIN), init), settings);
  return { send, calls, advance: value => { seconds += value; } };
}
function cookies(response) { return response.headers.getSetCookie(); }
function cookieValue(response, prefix) { return cookies(response).find(value => value.startsWith(prefix)).split(';')[0]; }
async function login(f) {
  const begin = await f.send('/auth/github');
  const destination = new URL(begin.headers.get('Location'));
  const flow = cookieValue(begin, '__Host-employee-flow=');
  const callback = `/auth/callback?code=fixture-code&state=${destination.searchParams.get('state')}`;
  const result = await f.send(callback, { headers: { Cookie: flow } });
  return { begin, destination, flow, callback, result };
}
test('anonymous visitors cannot obtain generator HTML and incomplete configuration fails closed', async () => {
  const f = await fixture();
  const publicPage = await f.send('/');
  assert.match(await publicPage.text(), /Masuk dengan GitHub/);
  const protectedPage = await f.send('/generator');
  assert.equal(protectedPage.status, 303);
  assert.equal(protectedPage.headers.get('Location'), '/');
  assert.equal(await protectedPage.text(), '');
  assert.equal((await f.send('/generator', {}, { ...env, SESSION_SECRET: '' })).status, 503);
  assert.equal((await f.send('https://attacker.example/generator')).status, 400);
  assert.equal((await f.send('/generator-reportase')).status, 303);
  const publicLogo = await f.send('/assets/Logo%20Reportase%20Times%20Metalik.png', {}, { ...env, ASSETS: { fetch: () => new Response('public asset') } });
  assert.equal(publicLogo.status, 200, 'logo filename with encoded spaces is a permitted public asset');
  for (const url of ['/generator.html', '/reportase.html', '/admin-server/auth.mjs', '/.env', '/output/admin-deployment/worker.mjs', '/private/index.html']) assert.equal((await f.send(url)).status, 404);
});
test('GitHub OAuth binds state and PKCE; only the allowed immutable user ID receives a session', async () => {
  const f = await fixture();
  const { begin, destination, result } = await login(f);
  assert.equal(destination.origin, 'https://github.com');
  assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(destination.searchParams.get('scope'), '');
  assert.match(begin.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(result.headers.get('Location'), '/generator');
  const session = cookieValue(result, '__Host-employee-session=');
  assert.ok(!session.includes('fixture-token'));
  const page = await f.send('/generator', { headers: { Cookie: session } });
  const html = await page.text();
  assert.match(html, /id="profile-form"/);
  assert.match(html, /id="base-url" value="https:\/\/employeeinformation.github.io\/"/);
  assert.match(html, /action="\/auth\/logout" method="post"/);
  assert.equal(page.headers.get('Cache-Control'), 'no-store, private');
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!html.includes(env.SESSION_SECRET));
  assert.ok(!html.includes('fixture-token'));
  assert.match(html, /href="\/generator-reportase"/);
  const pressPage = await f.send('/generator-reportase', { headers: { Cookie: session } });
  const pressHTML = await pressPage.text();
  assert.equal(pressPage.status, 200);
  assert.match(pressHTML, /id="rt-form"/);
  assert.match(pressHTML, /href="\/generator"/);
  assert.match(pressHTML, /href="\/generator-reportase" aria-current="page"/);
  assert.match(pressHTML, /id="base-url" value="https:\/\/employeeinformation.github.io\/"/);
  assert.match(pressHTML, /name="csrf"/);
  assert.equal(pressPage.headers.get('Cache-Control'), 'no-store, private');
  const tokenBody = Object.fromEntries(new URLSearchParams(f.calls[0].options.body));
  assert.equal(f.calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(f.calls[0].options.headers['User-Agent'], 'Employee-Identity-Admin');
  assert.match(tokenBody.code_verifier, /^[A-Za-z0-9_-]{43}$/);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokenBody.code_verifier));
  assert.equal(Buffer.from(digest).toString('base64url'), destination.searchParams.get('code_challenge'));
  const outsider = await login(await fixture({ userId: 99 }));
  assert.equal(outsider.result.headers.get('Location'), '/?error=denied');
  assert.ok(!cookies(outsider.result).some(cookie => cookie.startsWith('__Host-employee-session=')));
});
test('missing, incorrect, duplicate and expired OAuth state never exchange a code', async () => {
  const f = await fixture();
  const begin = await f.send('/auth/github');
  const state = new URL(begin.headers.get('Location')).searchParams.get('state');
  const flow = cookieValue(begin, '__Host-employee-flow=');
  for (const [url, headers] of [
    [`/auth/callback?code=x&state=${state}`, {}],
    ['/auth/callback?code=x&state=wrong', { Cookie: flow }],
    [`/auth/callback?code=x&state=${state}&state=${state}`, { Cookie: flow }],
  ]) assert.equal((await f.send(url, { headers })).headers.get('Location'), '/?error=failed');
  f.advance(601);
  assert.equal((await f.send(`/auth/callback?code=x&state=${state}`, { headers: { Cookie: flow } })).headers.get('Location'), '/?error=failed');
  assert.equal(f.calls.length, 0);
});
test('tampered, expired and cross-site sessions cannot open the generator; logout requires same-origin POST', async () => {
  const f = await fixture();
  const { result } = await login(f);
  const session = cookieValue(result, '__Host-employee-session=');
  const tokenStart = session.indexOf('=') + 1;
  const altered = session.slice(0, tokenStart) + (session[tokenStart] === 'A' ? 'B' : 'A') + session.slice(tokenStart + 1);
  assert.equal((await f.send('/generator', { headers: { Cookie: altered } })).status, 303);
  const otherEnv = { ...env, APP_ORIGIN: 'https://other.example.com' };
  assert.equal((await f.send('https://other.example.com/generator', { headers: { Cookie: session } }, otherEnv)).status, 303);
  assert.equal((await f.send('/auth/logout', { headers: { Cookie: session } })).status, 403);
  assert.equal((await f.send('/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: 'https://attacker.example' } })).status, 403);
  const generatorHTML = await (await f.send('/generator', { headers: { Cookie: session } })).text();
  const csrf = generatorHTML.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)[1];
  const logout = await f.send('/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: env.APP_ORIGIN }, body: new URLSearchParams({ csrf }).toString() });
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  f.advance(14401);
  assert.equal((await f.send('/generator', { headers: { Cookie: session } })).status, 303);
});
test('GitHub failures do not issue sessions or expose upstream error details', async () => {
  const f = await fixture({ tokenFails: true });
  const { result } = await login(f);
  assert.equal(result.headers.get('Location'), '/?error=failed');
  assert.ok(!cookies(result).some(cookie => cookie.startsWith('__Host-employee-session=')));
  assert.equal(await result.text(), '');
});
test('provider redirects cannot forward OAuth secrets or produce an admin session', async () => {
  const f = await fixture({ tokenRedirects: true });
  const { result } = await login(f);
  assert.equal(result.headers.get('Location'), '/?error=failed');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.ok(!cookies(result).some(cookie => cookie.startsWith('__Host-employee-session=')));
});
test('logout under no-referrer accepts Origin:null only with the session-bound CSRF token', async () => {
  const f = await fixture();
  const { result } = await login(f);
  const session = cookieValue(result, '__Host-employee-session=');
  const html = await (await f.send('/generator', { headers: { Cookie: session } })).text();
  const csrf = html.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)[1];
  for (const token of ['', 'invalid']) {
    assert.equal((await f.send('/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: 'null' }, body: new URLSearchParams({ csrf: token }).toString() })).status, 403);
  }
  const logout = await f.send('/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: 'null' }, body: new URLSearchParams({ csrf }).toString() });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
});
