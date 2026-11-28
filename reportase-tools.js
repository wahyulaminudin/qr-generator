/* Reportase Times has its own payload. First Media v1/v2/v3 stays unchanged. */
((root) => {
  'use strict';
  const KEYS = ['name', 'pressId', 'position', 'desk', 'region', 'expiry', 'email', 'bio'];
  const LIMITS = [60, 32, 60, 60, 60, 10, 100, 200];
  const encoder = new TextEncoder();
  const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function bytes(value) {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Format tautan tidak valid.');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }
  function validDate(value) {
    if (!/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validate(values) {
    if (!Array.isArray(values) || values.length !== KEYS.length) throw new Error('Data profil tidak lengkap.');
    values.forEach((value, i) => {
      if (typeof value !== 'string' || value.length > LIMITS[i] || (i < 6 && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Periksa seluruh kolom wajib dan panjang isian.');
    });
    if (!validDate(values[5])) throw new Error('Masa berlaku tidak valid.');
    if (values[6] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[6])) throw new Error('Alamat email redaksi tidak valid.');
    return Object.fromEntries(KEYS.map((key, i) => [key, values[i]]));
  }
  function encode(profile) {
    const values = KEYS.map(key => profile[key] || '');
    validate(values);
    const photo = profile.photo ? profile.photo.split(',')[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
    const fragment = `rt1.${b64(encoder.encode(JSON.stringify(values)))}.${photo}`;
    decode(fragment);
    return fragment;
  }
  function decode(fragment) {
    if (fragment.length > 5000) throw new Error('Tautan terlalu panjang.');
    const parts = fragment.split('.');
    if (parts.length !== 3 || parts[0] !== 'rt1') throw new Error('Tautan bukan profil Reportase Times.');
    const profile = validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(parts[1]))));
    profile.photo = '';
    if (parts[2]) {
      const photo = bytes(parts[2]);
      if (photo.length < 12 || photo.length > 1050 || String.fromCharCode(...photo.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...photo.slice(8, 12)) !== 'WEBP') throw new Error('Foto tidak valid.');
      profile.photo = `data:image/webp;base64,${btoa(String.fromCharCode(...photo))}`;
    }
    return profile;
  }
  function targetURL(base, current) {
    const url = new URL(base || './', current);
    if (!['https:', 'http:', 'file:'].includes(url.protocol) || url.username || url.password) throw new Error('Gunakan URL publik HTTP atau HTTPS yang valid.');
    url.search = ''; url.hash = '';
    if (/\.html?$/.test(url.pathname)) url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return new URL('reportase-profile.html', url);
  }
  function paintQR(canvas, qr, pixels = 2048) {
    const modules = qr.getModuleCount();
    const unit = Math.floor(pixels / (modules + 8));
    if (unit < 1) throw new Error('Ukuran QR terlalu kecil.');
    canvas.width = canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    const offset = Math.floor((pixels - modules * unit) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pixels, pixels);
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      const finder = (row < 7 && (col < 7 || col >= modules - 7)) || (row >= modules - 7 && col < 7);
      ctx.fillStyle = finder ? '#951522' : '#16181c';
      ctx.fillRect(offset + col * unit, offset + row * unit, unit, unit);
    }
    return { modules, unit, margin: offset };
  }
  const api = { KEYS, encode, decode, validDate, targetURL, paintQR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReportaseTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
