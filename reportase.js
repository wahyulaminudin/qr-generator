/* A separate press-profile workflow; no storage and no employee-payload changes. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const tools = ReportaseTools;
  const formatDate = value => tools.validDate(value) ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
  function show(profile) {
    document.querySelectorAll('[data-rt-bind]').forEach(node => {
      const key = node.dataset.rtBind;
      node.textContent = key === 'expiry' ? formatDate(profile.expiry) : profile[key] || ({ name: 'Nama lengkap', position: 'Posisi redaksi', pressId: 'Nomor pers' }[key] || '—');
    });
    document.querySelectorAll('[data-rt-photo]').forEach(node => { node.hidden = !profile.photo; node.src = profile.photo || 'assets/avatar.svg'; });
  }
  if (document.body.dataset.reportasePage === 'profile') {
    function load() {
      try {
        const fragment = window.location.hash.slice(1);
        if (!fragment) {
          $('#rt-profile').hidden = true; $('#rt-error').hidden = false;
          $('#rt-error-title').textContent = 'Profil belum tersedia';
          $('#rt-error-message').textContent = 'Pindai QR Code atau buka tautan profil yang dibagikan kepada Anda.';
          return;
        }
        const profile = tools.decode(fragment);
        show(profile);
        $('#rt-email-row').hidden = !profile.email;
        $('#rt-bio-section').hidden = !profile.bio;
        const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
        $('#rt-expired').hidden = profile.expiry >= `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
        $('#rt-profile').hidden = false; $('#rt-error').hidden = true;
      } catch {
        $('#rt-profile').hidden = true; $('#rt-error').hidden = false;
        $('#rt-error-title').textContent = 'Tautan profil tidak valid';
        $('#rt-error-message').textContent = 'Data profil tidak lengkap, rusak, atau bukan format Reportase Times. Minta tautan baru kepada pengirim.';
      }
    }
    window.addEventListener('hashchange', load); load(); return;
  }
  const form = $('#rt-form');
  let photo = '', currentQR = null, currentURL = '', timer, busy = false, photoRevision = 0;
  const withPhoto = () => $('input[name="rt-mode"]:checked').value === 'photo';
  const data = () => ({ ...Object.fromEntries(tools.KEYS.map(key => [key, $(`#rt-${key}`).value.trim().replace(/\s+/g, ' ')])), photo: withPhoto() ? photo : '' });
  function unavailable(message) {
    currentQR = null; currentURL = '';
    $('#rt-qr').hidden = true; $('#rt-placeholder').hidden = false;
    $('#rt-download').disabled = true; $('#rt-expand').disabled = true;
    $('#rt-scan-link').removeAttribute('href'); $('#rt-scan-link').setAttribute('aria-disabled', 'true');
    $('#rt-scan-link').tabIndex = -1;
    $('#rt-status').textContent = message; $('#rt-destination').textContent = '—';
    if ($('#rt-qr-dialog').open) $('#rt-qr-dialog').close();
  }
  function render() {
    clearTimeout(timer);
    const profile = data(); show(profile);
    $('#rt-photo-section').hidden = !withPhoto();
    if (busy) { unavailable('Optimasi foto sedang berlangsung…'); return; }
    if (tools.KEYS.slice(0, 6).some(key => !profile[key] || !$(`#rt-${key}`).validity.valid)) { unavailable('Lengkapi seluruh kolom wajib.'); return; }
    try {
      const fragment = tools.encode(profile);
      const url = tools.targetURL($('#base-url').value.trim(), window.location.href);
      url.hash = fragment;
      if (new TextEncoder().encode(url.href).length > 2300) throw new Error('Data terlalu panjang untuk QR. Persingkat profil singkat atau pilih tanpa foto.');
      const qr = qrcode(0, 'M'); qr.addData(url.href, 'Byte'); qr.make();
      const width = Math.min(360, $('.rt-qr-display').clientWidth - 22 || 300);
      const modules = qr.getModuleCount() + 8;
      const size = modules * Math.max(1, Math.floor(width / modules));
      tools.paintQR($('#rt-qr'), qr, size * Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
      $('#rt-qr').style.width = `${size}px`;
      $('#rt-qr').hidden = false; $('#rt-placeholder').hidden = true;
      currentQR = qr; currentURL = url.href;
      $('#rt-scan-link').href = url.href; $('#rt-scan-link').removeAttribute('aria-disabled'); $('#rt-scan-link').removeAttribute('tabindex');
      const local = QRTools.isLocalURL(url);
      $('#rt-download').disabled = local; $('#rt-expand').disabled = false;
      $('#rt-status').textContent = local ? 'Alamat masih lokal. Isi URL publik agar QR dapat dibuka di HP lain.' : `QR siap dipindai · ${profile.photo ? 'dengan foto mini' : 'tanpa foto'} · seluruh data disertakan`;
      $('#rt-destination').textContent = url.href;
    } catch (error) { unavailable(error.message || 'QR belum dapat dibuat. Periksa data Anda.'); }
  }
  function update() {
    show(data()); $('#rt-photo-section').hidden = !withPhoto();
    unavailable('Memperbarui QR Code…'); clearTimeout(timer); timer = setTimeout(render, 250);
  }
  form.addEventListener('input', event => { if (event.target.id !== 'rt-photo') update(); });
  form.addEventListener('change', event => { if (event.target.id !== 'rt-photo') update(); });
  form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) render(); });
  $('#rt-photo').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const revision = ++photoRevision; busy = true; photo = ''; update();
    let objectURL;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Gunakan JPG, PNG, atau WebP maksimal 5 MB.');
      objectURL = URL.createObjectURL(file);
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Foto tidak dapat dibaca.')); image.src = objectURL; });
      const result = PhotoTools.preparePhoto(image, () => document.createElement('canvas'));
      if (revision !== photoRevision) return;
      if (!result.inline) throw new Error('Foto belum dapat diperkecil. Coba foto lain atau pilih tanpa foto.');
      photo = result.inline.encoded;
      $('#rt-photo-note').textContent = 'Foto mini siap disertakan. Gunakan PNG QR asli saat mencetak.';
      $('#rt-remove-photo').hidden = false;
    } catch (error) { if (revision === photoRevision) { $('#rt-photo-note').textContent = error.message; $('#rt-remove-photo').hidden = true; } }
    finally { if (objectURL) URL.revokeObjectURL(objectURL); if (revision === photoRevision) { busy = false; event.target.value = ''; update(); } }
  });
  function resetPhoto() { photoRevision++; busy = false; photo = ''; $('#rt-photo').value = ''; $('#rt-photo-note').textContent = 'Foto bersifat opsional.'; $('#rt-remove-photo').hidden = true; }
  $('#rt-remove-photo').addEventListener('click', () => { resetPhoto(); update(); });
  $('#rt-reset').addEventListener('click', () => { tools.KEYS.forEach(key => { $(`#rt-${key}`).value = ''; }); resetPhoto(); render(); });
  $('#rt-download').addEventListener('click', () => {
    if (!currentQR || !currentURL || busy || QRTools.isLocalURL(new URL(currentURL))) return;
    const canvas = document.createElement('canvas'); tools.paintQR(canvas, currentQR, 2048);
    const id = data().pressId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 32) || 'profil';
    canvas.toBlob(blob => {
      if (!blob) { $('#rt-status').textContent = 'PNG gagal disiapkan. Coba kembali.'; return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `QR-Reportase-Times-${id}.png`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }, 'image/png');
  });
  $('#rt-expand').addEventListener('click', () => { if (currentQR) { tools.paintQR($('#rt-qr-large'), currentQR, 1024); $('#rt-qr-dialog').showModal(); } });
  $('#rt-close').addEventListener('click', () => $('#rt-qr-dialog').close());
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
  if (QRTools.isLocalURL(new URL(window.location.href))) $('.rt-url-settings').open = true;
  render();
})();
