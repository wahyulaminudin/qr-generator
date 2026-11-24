const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { TextEncoder, TextDecoder } = require('node:util');
const jsQR = require('jsqr');
const qrcode = require('../assets/vendor/qrcode.js');
const { paintQR, profileFile, isLocalURL } = require('../qr-tools.js');
const PhotoTools = require('../photo-tools.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// Rasterize the application renderer, then decode it using an independent library.
function raster() {
  const canvas = { width: 0, height: 0 };
  let pixels;
  const ctx = { fillStyle: '#fff', fillRect(x, y, w, h) {
    if (!pixels || pixels.length !== canvas.width * canvas.height * 4) pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    const color = this.fillStyle === '#ffffff' ? 255 : 0;
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
      const i = (row * canvas.width + col) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = color;
      pixels[i + 3] = 255;
    }
  } };
  canvas.getContext = () => ctx;
  canvas.pixels = () => pixels;
  return canvas;
}
function decode(canvas) { return jsQR(canvas.pixels(), canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data; }
const values = ['Rakha Pradana', 'EMP-2026-001', 'Network Engineer', 'Network Operations', 'Jakarta Selatan', '2027-12-31'];
const fragment = `v1.${Buffer.from(JSON.stringify(values)).toString('base64url')}.`;
const direct = `https://example.github.io/qr/template.html#${fragment}`;

test('direct and compact QR decode correctly at preview and PNG sizes', () => {
  const snapshot = profileFile(fragment);
  const compact = `https://example.github.io/qr/profiles/${snapshot.name}`;
  for (const text of [direct, compact]) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    for (const size of [(qr.getModuleCount() + 8) * 3, 2048]) {
      const canvas = raster();
      const metrics = paintQR(canvas, qr, size);
      assert.ok(metrics.margin >= 4 * metrics.unit, 'four-module white margin');
      assert.equal(decode(canvas), text, 'independent decoder recovers exact destination');
    }
  }
  const qrDirect = qrcode(0, 'M'); qrDirect.addData(direct); qrDirect.make();
  const qrCompact = qrcode(0, 'M'); qrCompact.addData(compact); qrCompact.make();
  assert.ok(qrCompact.getModuleCount() < qrDirect.getModuleCount());
});
test('long photo payload also decodes and keeps the quiet zone', () => {
  const photo = Buffer.alloc(550, 123).toString('base64url');
  const text = direct + photo;
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const canvas = raster();
  paintQR(canvas, qr, 2048);
  assert.equal(decode(canvas), text);
});
test('static profile snapshot preserves payload without embedding untrusted markup', () => {
  const file = profileFile(fragment);
  assert.match(file.name, /^p-[a-f0-9]{16}\.html$/);
  assert.ok(file.html.includes(`../template.html#${fragment}`));
  assert.ok(file.html.includes('<title>QR Studio — Profil Digital</title>'));
  assert.notEqual(profileFile(fragment + 'AA').name, file.name);
  assert.throws(() => profileFile('v1.\"><script>alert(1)</script>.'));
});
test('loopback and file targets are distinguished from accessible HTTP URLs', () => {
  for (const url of ['file:///E:/Project/index.html', 'http://localhost:5500/', 'http://127.0.0.2/', 'http://[::1]/', 'http://workspace.localhost/']) assert.equal(isLocalURL(new URL(url)), true);
  for (const url of ['https://user.github.io/qr/', 'http://192.168.1.5:4173/']) assert.equal(isLocalURL(new URL(url)), false);
});

function app(page, hash = '', href = 'https://example.github.io/qr/index.html', options = {}) {
  const nodes = new Map();
  function node(key) {
    if (!nodes.has(key)) nodes.set(key, { value: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, validity: { valid: true }, clientWidth: 340, listeners: {}, classList: { toggle() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; } });
    return nodes.get(key);
  }
  const keys = ['name', 'employeeId', 'role', 'department', 'area', 'expiry'];
  keys.forEach((key, i) => { node(`#${key}`).value = values[i]; });
  node('input[name="qr-mode"]:checked').value = 'direct';
  nodes.set('#qr-canvas', Object.assign(raster(), node('#qr-canvas')));
  const bound = keys.map((key) => ({ dataset: { bind: key }, textContent: '' }));
  const photo = [{ src: '' }];
  const document = { body: { dataset: { page } }, querySelector: (s) => options.withoutExpiryStatus && s === '#expiry-status' ? null : node(s), createElement: () => ({}), querySelectorAll(s) { return s === '[data-bind]' ? bound : s === '[data-profile-photo]' ? photo : []; } };
  const window = { location: { href, hash }, devicePixelRatio: 1, addEventListener() {} };
  const Image = class { set src(value) { this.onload(); } };
  const context = vm.createContext({ document, window, TextEncoder, TextDecoder, URL, Intl, Date, console, Uint8Array, Image, PhotoTools: options.photoResult ? { preparePhoto: () => options.photoResult } : PhotoTools, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'), qrcode, QRTools: require('../qr-tools.js'), setTimeout: () => 1, clearTimeout() {} });
  vm.runInContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), context);
  return { node, bound, photo };
}
test('compact QR decodes to the shared page with complete text and no photo or missing file dependency', () => {
  const local = app('generator', '', 'file:///E:/Project/QR_GENERATOR/index.html');
  assert.equal(local.node('#download').disabled, true);
  assert.ok(local.node('#scan-link').href.startsWith('file:'));
  assert.match(local.node('#qr-status').textContent, /Alamat masih lokal/);
  const online = app('generator');
  assert.equal(online.node('#download').disabled, false);
  assert.equal(decode(online.node('#qr-canvas')), online.node('#scan-link').href);
  online.node('input[name="qr-mode"]:checked').value = 'compact';
  online.node('#profile-form').reportValidity = () => true;
  online.node('#profile-form').listeners.submit({ preventDefault() {} });
  const compactURL = new URL(decode(online.node('#qr-canvas')));
  assert.equal(compactURL.pathname, '/qr/template.html');
  assert.ok(compactURL.hash.startsWith('#v3.'));
  assert.equal(compactURL.href, online.node('#scan-link').href);
  assert.equal(online.node('#download').disabled, false);
  const scan = app('profile', compactURL.hash);
  assert.deepEqual(scan.bound.map(node => node.textContent).slice(0, 5), values.slice(0, 5));
  assert.equal(scan.node('#scan-profile').hidden, false);
  assert.equal(scan.photo[0].hidden, true, 'no portrait or placeholder on scan');
  assert.equal(online.photo[0].hidden, true, 'preview matches scan');
  assert.equal(online.node('#photo').disabled, true);
  assert.equal(app('profile', compactURL.hash + 'AAAA').node('#scan-error').hidden, false, 'v3 rejects photo data');
});
test('complex real JPEG and PNG photos produce usable mini and clear profile variants', async () => {
  const canvas = createCanvas(600, 450);
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(600, 450);
  let seed = 7;
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let color = 0; color < 3; color++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels.data[i + color] = seed >>> 24; }
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  for (const mime of ['image/png', 'image/jpeg']) {
    const source = await loadImage(canvas.toDataURL(mime));
    const result = PhotoTools.preparePhoto(source, () => createCanvas(1, 1));
    assert.ok(result.inline && result.inline.bytes <= PhotoTools.INLINE_LIMIT);
    assert.ok(result.profile.bytes <= PhotoTools.PROFILE_LIMIT);
    assert.ok(result.profile.size > result.inline.size);
    assert.equal((await loadImage(result.profile.encoded)).width, result.profile.size);
    const tiny = result.inline.encoded.split(',')[1].replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const text = direct + tiny;
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const image = raster(); paintQR(image, qr, 2048);
    assert.equal(decode(image), text);
    const large = result.profile.encoded.split(',')[1].replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const payload = fragment.replace('v1.', 'v2.') + large;
    const scan = app('profile', '#' + payload);
    assert.equal(scan.node('#scan-profile').hidden, false);
    assert.equal(scan.photo[0].src, result.profile.encoded);
    const snapshot = profileFile(payload);
    assert.ok(snapshot.html.includes(payload));
    assert.equal(app('profile', '#' + fragment + large).node('#scan-error').hidden, false, 'v1 still rejects oversized photos');
    const generator = app('generator', '', 'https://example.github.io/qr/', { photoResult: result });
    await generator.node('#photo').listeners.change({ target: { files: [new Blob(['fixture'], { type: mime })], value: 'fixture' } });
    generator.node('#profile-form').reportValidity = () => true;
    generator.node('#profile-form').listeners.submit({ preventDefault() {} });
    assert.equal(generator.node('#photo-error').textContent, '');
    assert.equal(generator.photo[0].src, result.inline.encoded);
    assert.equal(generator.node('#download').disabled, false);
    generator.node('input[name="qr-mode"]:checked').value = 'compact';
    generator.node('#profile-form').listeners.submit({ preventDefault() {} });
    const compactURL = new URL(generator.node('#scan-link').href);
    assert.ok(compactURL.hash.startsWith('#v3.'));
    assert.equal(compactURL.hash.split('.')[2], '');
    assert.equal(app('profile', compactURL.hash).photo[0].hidden, true, 'uploaded photo is omitted from compact scans');
    assert.ok(compactURL.href.length < text.length);
    assert.equal(decode(generator.node('#qr-canvas')), compactURL.href);
    generator.node('input[name="qr-mode"]:checked').value = 'direct';
    generator.node('#profile-form').listeners.submit({ preventDefault() {} });
    const restored = app('profile', new URL(generator.node('#scan-link').href).hash);
    assert.equal(restored.photo[0].src, result.inline.encoded);
    assert.equal(restored.photo[0].hidden, false, 'switching back restores photo without another upload');
  }
});
test('scan page recovers exact Unicode fields, old links, invalid data, and expired dates', () => {
  const unicode = ['Éka <img src=x onerror=alert(1)>', ...values.slice(1)];
  const encoded = `#v1.${Buffer.from(JSON.stringify(unicode)).toString('base64url')}.`;
  const scan = app('profile', encoded);
  assert.equal(scan.bound[0].textContent, unicode[0]);
  assert.equal(scan.node('#scan-profile').hidden, false);
  assert.equal(app('profile', '#bad-data').node('#scan-error').hidden, false);
  const expired = [...values]; expired[5] = '2001-01-01';
  assert.match(app('profile', `#v1.${Buffer.from(JSON.stringify(expired)).toString('base64url')}.`).node('#expiry-status').textContent, /berakhir/);
});
test('missing profile and cleared form cannot leave a fabricated profile or old QR available', () => {
  const empty = app('profile');
  assert.equal(empty.node('#scan-profile').hidden, true);
  assert.equal(empty.node('#scan-error-title').textContent, 'Profil belum tersedia');
  const generator = app('generator');
  generator.node('#reset').listeners.click();
  assert.equal(generator.node('#name').value, '');
  assert.equal(generator.node('#employeeId').value, '');
  assert.equal(generator.node('#download').disabled, true);
  assert.equal(generator.node('#scan-link').href, undefined);
});
test('removing the optional expiry caption from a custom template does not hide a valid employee', () => {
  for (const version of ['v1', 'v2', 'v3']) {
    const hash = `#${version}.${Buffer.from(JSON.stringify(values)).toString('base64url')}.`;
    const scan = app('profile', hash, undefined, { withoutExpiryStatus: true });
    assert.equal(scan.node('#scan-profile').hidden, false);
    assert.equal(scan.node('#scan-error').hidden, true);
    assert.deepEqual(scan.bound.slice(0, 5).map(node => node.textContent), values.slice(0, 5));
  }
});
