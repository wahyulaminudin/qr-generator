/* Employee Identity: all profile data travels in the URL fragment, never to a database. */
(() => {
  'use strict';
  const EMPTY_PROFILE = Object.freeze({ name: '', employeeId: '', role: '', department: '', area: '', expiry: '', photo: '' });
  const KEYS = ['name', 'employeeId', 'role', 'department', 'area', 'expiry'];
  const LIMITS = [60, 32, 60, 60, 60, 10];
  const DEFAULT_PHOTO = 'assets/avatar.svg';
  const MAX_URL_BYTES = 2300;
  const MAX_PHOTO_BYTES = 1050;
  const MAX_PROFILE_PHOTO_BYTES = 24 * 1024;
  const $ = (s) => document.querySelector(s);
  const encoder = new TextEncoder();
  const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const unbase64 = (value) => {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid encoding');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  };
  function validDate(value) {
    if (!/^20\d{2}-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dateLabel(value) {
    if (!validDate(value)) return '—';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  }
  function showProfile(profile) {
    document.querySelectorAll('[data-bind]').forEach((node) => {
      const key = node.dataset.bind;
      node.textContent = key === 'expiry' ? dateLabel(profile.expiry) : profile[key] || ({ name: 'Nama karyawan', role: 'Jabatan' }[key] || '—');
    });
    document.querySelectorAll('[data-profile-photo]').forEach((node) => {
      node.hidden = Boolean(profile.hidePhoto);
      node.src = profile.photo || DEFAULT_PHOTO;
      node.closest?.('.card-person, .scan-person')?.classList.toggle('without-photo', Boolean(profile.hidePhoto));
    });
  }
  function encodeProfile(profile, version = 'v1') {
    const data = base64url(encoder.encode(JSON.stringify(KEYS.map((key) => profile[key]))));
    const photo = profile.photo ? profile.photo.split(',')[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : '';
    return `${version}.${data}.${photo}`;
  }
  function decodeProfile(fragment) {
    if (fragment.length > 38000) throw new Error('Payload too large');
    const parts = fragment.split('.');
    if (parts.length !== 3 || !['v1', 'v2', 'v3'].includes(parts[0])) throw new Error('Unsupported profile');
    if (parts[0] === 'v3' && parts[2]) throw new Error('Text-only profile cannot include a photo');
    const values = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unbase64(parts[1])));
    if (!Array.isArray(values) || values.length !== KEYS.length) throw new Error('Incomplete profile');
    values.forEach((value, i) => { if (typeof value !== 'string' || !value.trim() || value.length > LIMITS[i] || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid field'); });
    if (!validDate(values[5])) throw new Error('Invalid date');
    const profile = Object.fromEntries(KEYS.map((key, i) => [key, values[i]]));
    profile.photo = '';
    profile.hidePhoto = parts[0] === 'v3';
    if (parts[2]) {
      const bytes = unbase64(parts[2]);
      const photoLimit = parts[0] === 'v2' ? MAX_PROFILE_PHOTO_BYTES : MAX_PHOTO_BYTES;
      if (bytes.length > photoLimit || bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') throw new Error('Invalid image');
      profile.photo = `data:image/webp;base64,${btoa(String.fromCharCode(...bytes))}`;
    }
    return profile;
  }
  if (document.body.dataset.page === 'profile') {
    function loadProfile() {
      try {
        const fragment = window.location.hash.slice(1);
        if (!fragment) {
          $('#scan-profile').hidden = true;
          $('#scan-error').hidden = false;
          $('#scan-error-title').textContent = 'Profil belum tersedia';
          $('#scan-error-message').textContent = 'Pindai QR Code profil atau buka tautan yang dibagikan kepada Anda.';
          return;
        }
        const profile = decodeProfile(fragment);
        showProfile(profile);
        $('#scan-profile').hidden = false;
        $('#scan-error').hidden = true;
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const dateParts = Object.fromEntries(today.map((part) => [part.type, part.value]));
        const expired = profile.expiry < `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
        const expiryStatus = $('#expiry-status');
        if (expiryStatus) {
          expiryStatus.textContent = expired ? 'Masa berlaku yang dicantumkan telah berakhir.' : 'Masa berlaku sesuai data yang diisikan.';
          expiryStatus.classList.toggle('expired', expired);
        }
      } catch {
        $('#scan-profile').hidden = true;
        $('#scan-error').hidden = false;
        $('#scan-error-title').textContent = 'Tautan profil tidak valid';
        $('#scan-error-message').textContent = 'Data QR tidak lengkap, rusak, atau formatnya tidak didukung. Minta tautan profil yang baru kepada pengirim.';
      }
    }
    window.addEventListener('hashchange', loadProfile);
    loadProfile();
    return;
  }
  const form = $('#profile-form');
  let photo = '';
  let inlinePhoto = '';
  let photoSizes = null;
  let qrUrl = '';
  let currentQR = null;
  let photoBusy = false;
  let photoRevision = 0;
  let renderTimer;
  let toastTimer;
  const profileData = () => ({ ...Object.fromEntries(KEYS.map((key) => [key, $(`#${key}`).value.trim()])), photo });
  function updatePhotoNote() {
    const compact = $('input[name="qr-mode"]:checked').value === 'compact';
    $('#photo').disabled = compact;
    $('.photo-upload').classList.toggle('photo-disabled', compact);
    showProfile({ ...profileData(), photo: compact ? '' : inlinePhoto, hidePhoto: compact });
    if (compact) {
      $('#photo-note').textContent = 'Mode Ringkas menampilkan data teks tanpa foto. Tidak perlu mengunggah file profil.';
      return;
    }
    if (!photoSizes) {
      $('#photo-note').textContent = 'Foto dioptimalkan otomatis untuk mode Langsung.';
      return;
    }
    const selected = photoSizes.inline;
    if (!selected) {
      $('#photo-note').textContent = 'Foto belum dapat diperkecil untuk QR Langsung. Unggah foto lain atau gunakan Ringkas tanpa foto.';
      return;
    }
    $('#photo-note').textContent = `Foto mini ${selected.size} × ${selected.size} px ikut dalam QR Langsung.`;
    $('#upload-preview').src = inlinePhoto || DEFAULT_PHOTO;
  }
  function targetURL() {
    const entered = $('#base-url').value.trim();
    let url;
    if (entered) {
      url = new URL(entered);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Gunakan URL publik http:// atau https:// yang valid.');
      url.hash = '';
      url.search = '';
      if (/\/(?:index|template)\.html$/.test(url.pathname)) url.pathname = url.pathname.replace(/(?:index|template)\.html$/, 'template.html');
      else if (url.pathname.endsWith('/')) url.pathname += 'template.html';
      else url.pathname += '/template.html';
    } else url = new URL('template.html', window.location.href);
    url.hash = '';
    url.search = '';
    return url;
  }
  function setQRUnavailable(message) {
    qrUrl = '';
    currentQR = null;
    $('#download').disabled = true;
    $('#expand-qr').disabled = true;
    $('#qr-metrics').textContent = '';
    $('#qr-destination').textContent = '—';
    $('#scan-link').removeAttribute('href');
    $('#scan-link').setAttribute('aria-disabled', 'true');
    $('#scan-link').tabIndex = -1;
    $('#qr-canvas').hidden = true;
    $('#qr-placeholder').hidden = false;
    $('#qr-status').textContent = message;
  }
  function renderQR() {
    if (photoBusy) return;
    updatePhotoNote();
    const profile = profileData();
    const invalid = KEYS.find((key) => !profile[key] || !$(`#${key}`).validity.valid);
    if (invalid || !validDate(profile.expiry)) {
      setQRUnavailable('Lengkapi seluruh kolom wajib dengan data yang valid.');
      return;
    }
    try {
      const url = targetURL();
      const compact = $('input[name="qr-mode"]:checked').value === 'compact';
      if (photo && !inlinePhoto && !compact) throw new Error('Unggah foto lain untuk mode Langsung, atau pilih Ringkas tanpa foto.');
      const fragment = encodeProfile({ ...profile, photo: compact ? '' : inlinePhoto }, compact ? 'v3' : 'v1');
      $('#compact-help').hidden = !compact;
      url.hash = fragment;
      const value = url.href;
      if (encoder.encode(value).length > MAX_URL_BYTES) throw new Error(compact ? 'Data teks terlalu panjang. Persingkat isian atau URL publik.' : 'Data terlalu panjang untuk QR Langsung. Pilih Ringkas untuk membawa data teks tanpa foto.');
      if (typeof qrcode !== 'function') throw new Error('Library QR tidak tersedia. Pastikan folder assets/vendor disertakan.');
      const qr = qrcode(0, 'M');
      qr.addData(value, 'Byte');
      qr.make();
      const canvas = $('#qr-canvas');
      const modules = qr.getModuleCount();
      const available = Math.min(360, $('.qr-display').clientWidth || 320);
      const unit = Math.max(1, Math.floor(available / (modules + 8)));
      const cssPixels = (modules + 8) * unit;
      const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
      QRTools.paintQR(canvas, qr, cssPixels * ratio);
      canvas.style.width = `${cssPixels}px`;
      canvas.style.height = `${cssPixels}px`;
      currentQR = qr;
      qrUrl = value;
      canvas.hidden = false;
      $('#qr-placeholder').hidden = true;
      const local = QRTools.isLocalURL(url);
      $('#download').disabled = local;
      $('#expand-qr').disabled = false;
      $('#scan-link').href = value;
      $('#scan-link').removeAttribute('aria-disabled');
      $('#scan-link').removeAttribute('tabindex');
      $('#qr-status').textContent = local ? 'Alamat masih lokal — isi URL publik untuk QR yang dapat dibuka HP.' : compact ? 'QR Ringkas siap · tanpa foto · langsung dapat dipindai' : 'QR langsung · data profil disertakan';
      $('#qr-metrics').textContent = `${modules} × ${modules} modul · Hitam-putih · Koreksi M`;
      $('#qr-destination').textContent = value;
      $('#local-hint').classList.toggle('local-warning', local);
      $('#local-hint').textContent = local ? 'QR ini mengarah ke komputer Anda. Buka Pengaturan tautan QR dan isi URL GitHub Pages. Unduhan PNG dinonaktifkan sampai alamat tujuan bukan file: atau localhost.' : compact ? 'Semua data teks dibawa langsung dalam QR. Tidak perlu unggah HTML atau menyalakan komputer.' : 'Pindai QR dari layar besar atau PNG asli. Alamat tujuan harus sudah dipublikasikan dan bisa diakses HP.';
    } catch (error) {
      setQRUnavailable(error.message || 'QR belum dapat dibuat. Periksa data Anda.');
    }
  }
  function update() {
    updatePhotoNote();
    clearTimeout(renderTimer);
    setQRUnavailable(photoBusy ? 'Mengoptimalkan foto…' : 'Memperbarui QR Code…');
    renderTimer = setTimeout(renderQR, 320);
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); if (form.reportValidity()) renderQR(); });
  form.addEventListener('input', (event) => { if (event.target.id !== 'photo') update(); });
  function notify(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
  }
  $('#download').addEventListener('click', () => {
    if (!qrUrl || !currentQR || photoBusy || QRTools.isLocalURL(new URL(qrUrl))) return;
    const exportCanvas = document.createElement('canvas');
    QRTools.paintQR(exportCanvas, currentQR, 2048);
    exportCanvas.toBlob((blob) => {
      if (!blob) { notify('Gagal menyiapkan PNG. Silakan coba kembali.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeId = profileData().employeeId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 32) || 'profile';
      link.download = `QR-Karyawan-${safeId}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      notify('QR Code PNG siap disimpan.');
    }, 'image/png');
  });
  async function optimizePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih file JPG, PNG, atau WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran foto maksimal 5 MB.');
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('File foto tidak dapat dibaca.')); image.src = objectUrl; });
      return PhotoTools.preparePhoto(image, () => document.createElement('canvas'));
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  $('#photo').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const revision = ++photoRevision;
    photoBusy = true;
    $('#photo-error').textContent = '';
    update();
    try {
      const result = await optimizePhoto(file);
      if (revision !== photoRevision) return;
      photoSizes = result;
      photo = result.profile.encoded;
      inlinePhoto = result.inline?.encoded || '';
      if (!result.inline) {
        $('input[name="qr-mode"][value="compact"]').checked = true;
        notify('Mode Ringkas dipilih tanpa foto. Data teks tetap dapat dibagikan.');
      }
      $('#upload-preview').src = photo;
      $('#remove-photo').hidden = false;
      updatePhotoNote();
    } catch (error) {
      if (revision === photoRevision) $('#photo-error').textContent = error.message;
    } finally {
      if (revision === photoRevision) { photoBusy = false; event.target.value = ''; update(); }
    }
  });
  function resetPhoto() {
    photoRevision++;
    photoBusy = false;
    photo = '';
    inlinePhoto = '';
    photoSizes = null;
    $('#photo').value = '';
    $('#upload-preview').src = DEFAULT_PHOTO;
    $('#remove-photo').hidden = true;
    $('#photo-error').textContent = '';
    $('#photo-note').textContent = 'Foto dioptimalkan otomatis untuk mode Langsung.';
  }
  $('#remove-photo').addEventListener('click', () => { resetPhoto(); update(); });
  $('#reset').addEventListener('click', () => {
    KEYS.forEach((key) => { $(`#${key}`).value = EMPTY_PROFILE[key]; });
    resetPhoto();
    update();
    notify('Formulir profil telah dikosongkan.');
  });
  document.querySelectorAll('input[name="qr-mode"]').forEach((radio) => radio.addEventListener('change', update));
  const qrDialog = $('#qr-dialog');
  $('#expand-qr').addEventListener('click', () => {
    if (!currentQR) return;
    QRTools.paintQR($('#qr-large'), currentQR, 1024);
    $('#qr-large-note').textContent = $('#qr-status').textContent;
    qrDialog.showModal();
  });
  $('#close-qr').addEventListener('click', () => qrDialog.close());
  if (QRTools.isLocalURL(new URL(window.location.href))) $('.url-settings').open = true;
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderQR, 150); });
  const guide = $('#guide');
  document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => guide.showModal()));
  $('#close-guide').addEventListener('click', () => guide.close());
  guide.addEventListener('click', (event) => { if (event.target === guide) { const rect = guide.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) guide.close(); } });
  updatePhotoNote();
  renderQR();
})();
