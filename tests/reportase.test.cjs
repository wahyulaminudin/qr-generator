const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createCanvas } = require('@napi-rs/canvas');
const jsQR = require('jsqr');
const qrcode = require('../assets/vendor/qrcode.js');
const tools = require('../reportase-tools.js');
const fixture = { name: 'Nadia <img src=x onerror=alert(1)>', pressId: 'RT-2026-042', position: 'Reporter', desk: 'Metropolitan', region: 'Jakarta & Bekasi', expiry: '2028-12-31', email: 'redaksi@example.com', bio: 'Meliput ruang publik, komunitas, dan kehidupan perkotaan.', photo: '' };
function scan(hash) {
  const nodes = new Map();
  const node = s => { if (!nodes.has(s)) nodes.set(s, { hidden: false, textContent: '' }); return nodes.get(s); };
  const bound = tools.KEYS.map(key => ({ dataset: { rtBind: key }, textContent: '' }));
  const photo = { hidden: false, src: '' };
  const context = vm.createContext({ document: { body: { dataset: { reportasePage: 'profile' } }, querySelector: node, querySelectorAll: s => s === '[data-rt-bind]' ? bound : [photo] }, window: { location: { hash }, addEventListener() {} }, ReportaseTools: tools, Intl, Date });
  vm.runInContext(fs.readFileSync(require.resolve('../reportase.js'), 'utf8'), context);
  return { node, bound, photo };
}
test('Reportase payload and public profile preserve independent fields and safe Unicode text', () => {
  const profile = { ...fixture, name: 'Nádia <img src=x onerror=alert(1)>' };
  const fragment = tools.encode(profile);
  assert.ok(fragment.startsWith('rt1.'));
  assert.deepEqual(tools.decode(fragment), profile);
  const result = scan('#' + fragment);
  assert.equal(result.node('#rt-profile').hidden, false);
  assert.equal(result.node('#rt-error').hidden, true);
  assert.equal(result.bound[0].textContent, profile.name);
  assert.equal(result.bound[7].textContent, profile.bio);
  assert.equal(result.photo.hidden, true);
  assert.equal(result.node('#rt-email-row').hidden, false);
  assert.equal(result.node('#rt-bio-section').hidden, false);
  const optional = scan('#' + tools.encode({ ...fixture, email: '', bio: '', expiry: '2000-01-01' }));
  assert.equal(optional.node('#rt-email-row').hidden, true);
  assert.equal(optional.node('#rt-bio-section').hidden, true);
  assert.equal(optional.node('#rt-expired').hidden, false);
  assert.equal(scan('').node('#rt-profile').hidden, true);
});
test('wrong brand, corrupt photos, malformed dates and oversized fields fail closed', () => {
  for (const hash of ['#v3.W10.', '#rt1.invalid.', '#rt1.' + Buffer.from('[]').toString('base64url') + '.', '#' + tools.encode(fixture) + 'AAAA']) {
    assert.equal(scan(hash).node('#rt-profile').hidden, true);
    assert.equal(scan(hash).node('#rt-error').hidden, false);
  }
  assert.throws(() => tools.encode({ ...fixture, expiry: '2026-02-30' }));
  assert.throws(() => tools.encode({ ...fixture, bio: 'x'.repeat(201) }));
  assert.throws(() => tools.encode({ ...fixture, email: 'bad@' }));
  assert.throws(() => tools.encode({ ...fixture, pressId: '' }));
});
test('Reportase public destination works under root and project paths without changing First Media', () => {
  assert.equal(tools.targetURL('', 'https://example.github.io/project/reportase.html').href, 'https://example.github.io/project/reportase-profile.html');
  assert.equal(tools.targetURL('https://employeeinformation.github.io/', 'https://worker.example/generator-reportase').href, 'https://employeeinformation.github.io/reportase-profile.html');
  assert.equal(tools.targetURL('https://example.com/project/index.html?x=1#old', 'file:///E:/project/reportase.html').href, 'https://example.com/project/reportase-profile.html');
  for (const base of ['javascript:alert(1)', 'https://user:password@example.com/']) assert.throws(() => tools.targetURL(base, 'https://example.com/'));
});
test('red and charcoal QR independently decodes with four white modules at preview and PNG sizes', () => {
  const photo = createCanvas(32, 32).toDataURL('image/webp');
  for (const profile of [fixture, { ...fixture, photo }]) {
    const payload = tools.encode(profile);
    assert.deepEqual(tools.decode(payload), profile);
    const url = 'https://employeeinformation.github.io/reportase-profile.html#' + payload;
    const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
    for (const size of [(qr.getModuleCount() + 8) * 3, 2048]) {
      const canvas = createCanvas(1, 1);
      const metrics = tools.paintQR(canvas, qr, size);
      assert.ok(metrics.margin >= 4 * metrics.unit);
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      assert.equal(jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data, url);
      assert.deepEqual([...image.data.slice(0, 4)], [255, 255, 255, 255]);
    }
  }
});
