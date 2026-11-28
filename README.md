# Employee Identity — First Media & Reportase Times

Setelah login, pilih **First Media** atau **Reportase Times** di bagian atas generator. Reportase Times memiliki form pers, desain hitam/perak/merah, QR berwarna dengan kontras tinggi, dan halaman hasil scan `reportase-profile.html` yang terpisah. QR First Media dan pembaca lamanya tetap tersedia. Panduan penerbitan kedua tipe ada pada [admin-server/README.md](admin-server/README.md).

Aplikasi statis berbahasa Indonesia menggunakan HTML, CSS, dan JavaScript murni. Tidak memerlukan backend, database, build, akun, atau koneksi internet untuk menjalankan file lokal.

Generator **online** kini memiliki backend login GitHub terpisah di Cloudflare Workers Free; tidak memakai database pegawai. Beranda publik berada di `https://employeeinformation.github.io/`, sedangkan formulir generator dikirim server hanya sesudah akun administrator lolos pemeriksaan. Halaman hasil scan dan format QR lama tetap dipertahankan. Lihat [panduan login dan publikasi](admin-server/README.md).

GitHub Pages diterbitkan dari branch **`public-site`**, bukan `main`. Untuk mengedit halaman hasil scan langsung melalui GitHub, pilih branch `public-site` lalu ubah `template.html` atau `style.css`. Branch `main` tetap menyimpan sumber generator lokal dan backend; jangan mengubah sumber Pages ke `main` karena itu akan menampilkan formulir lokal secara publik.

Generator identitas karyawan dengan tampilan enterprise, tema navy, aksen biru elektrik, logo yang disediakan pengguna, dan ilustrasi skyline. Formulir dimulai kosong; seluruh profil berasal dari data yang dimasukkan pembuatnya. Logo merupakan aset visual yang disediakan pengguna.

Istilah enterprise merujuk pada tampilan dan alur antarmuka. Login online membatasi akses ke formulir generator, sedangkan pembaca QR tetap aplikasi statis. Aplikasi ini tidak menyediakan validasi kepegawaian, tanda tangan digital, pencabutan profil terpusat, atau penyimpanan data pegawai di server. Tautan profil dapat dibaca dan dibuat ulang oleh siapa pun yang memilikinya. Gunakan sesuai kewenangan pengelolaan data organisasi Anda.

## Menjalankan

Buka `index.html` langsung di browser modern. Isi nama karyawan, Nomor Induk Karyawan (NIK internal, bukan NIK KTP), jabatan, departemen/divisi, wilayah penugasan, masa berlaku kartu, serta foto opsional. Pratinjau dan QR berubah otomatis setelah data valid. Klik **Lihat identitas karyawan** untuk memeriksa data dan foto pada `template.html`. Untuk mengunduh QR yang dapat dibuka HP lain, jalankan dari alamat publik atau isi **URL publik aplikasi** pada pengaturan tautan QR. Klik **Unduh QR Code** untuk menyimpan PNG hitam-putih 2048 × 2048 piksel. Tombol **Kosongkan formulir** menghapus isian dari workspace saat ini.

## Memilih mode QR

- **Langsung** (default): seluruh data dan foto mini dibawa dalam tautan QR. Foto otomatis diperkecil menjadi 8–80 px dengan batas 900 byte. Tidak perlu mengunggah file profil terpisah. Semakin banyak data, semakin rapat pola QR. Gunakan tombol **Perbesar untuk dipindai** atau PNG asli saat memindai QR berfoto.
- **Ringkas**: semua data teks dibawa langsung dalam QR menuju `template.html#v3.<data>.`. Hasil scan menampilkan nama karyawan, NIK internal, jabatan, departemen/divisi, wilayah penugasan, serta masa berlaku kartu **tanpa foto dan tanpa avatar pengganti**. Cukup isi formulir, pilih Ringkas, lalu unduh QR. Tidak perlu mengunggah HTML, membuat file per karyawan, atau memakai database.

Unggahan JPG, PNG, dan WebP maksimal 5 MB diproses secara adaptif untuk mode Langsung. Foto yang sudah diunggah diabaikan pada mode Ringkas dan dapat dipakai kembali saat beralih ke mode Langsung. Pratinjau mengikuti hasil scan. Unggah foto dinonaktifkan selama mode Ringkas dipilih.

**Lihat identitas karyawan** membuka alamat yang persis sama dengan isi QR. Mode Ringkas baru tidak bergantung pada folder `profiles/`, sehingga tidak menghasilkan 404 karena file karyawan belum diunggah. QR Ringkas versi lama yang mengarah ke `/profiles/p-....html` perlu dibuat ulang jika file tersebut tidak pernah dipublikasikan. Data dari nama file lama tidak dapat dipulihkan. Tautan v1/v2 dan file profil lama yang sudah tersedia tetap didukung.

Jika ingin memakai server lokal dan Node.js sudah tersedia:

```sh
node serve.cjs
```

Buka `http://127.0.0.1:4173`. Server ini hanya alat pengembangan untuk menyajikan file statis; aplikasi tidak bergantung pada server ini dan tidak memproses atau menyimpan profil di server.

## GitHub Pages

Langkah berikut untuk pemasangan statis awal/lokal. Pada situs yang login-nya sudah diaktifkan, gunakan branch `public-site` dan beranda masuk dari `admin-server/pages-login.html`; pertahankan pengaturan tersebut agar formulir generator tidak dibuka kembali ke publik.

1. Unggah isi folder proyek ke repository GitHub, termasuk `assets`, `index.html`, `template.html`, `script.js`, `qr-tools.js`, `photo-tools.js`, `style.css`, dan `.nojekyll`. Pertahankan folder `profiles/` jika ada file profil lama yang sudah dibagikan. Folder `node_modules`, `tests`, serta `output` tidak diperlukan untuk hosting.
2. Buka **Settings → Pages**, pilih **Deploy from a branch**, pilih branch utama dan folder **/(root)**, lalu simpan.
3. Setelah penerbitan selesai, buka alamat Pages yang ditampilkan GitHub (contoh `https://username.github.io/qr-generator/`).
4. Buat dan unduh QR dari alamat publik tersebut. Halaman hasil scan otomatis menggunakan alamat publik yang sama dan mendukung repository dalam subfolder.

Jika membuat QR dari file lokal sebelum publikasi, buka **Pengaturan tautan QR** dan isi URL publik aplikasi, contohnya `https://username.github.io/qr-generator/`. Pastikan proyek sudah tersedia pada alamat itu sebelum QR dibagikan.

**QR yang mengandung alamat `file:`, `localhost`, atau `127.0.0.1` tidak membuka proyek di HP lain.** Aplikasi sekarang menonaktifkan unduhan PNG untuk tujuan lokal tersebut dan membuka pengaturan URL secara otomatis. Pratinjau lokal tetap tersedia. Untuk pemindaian antarperangkat gunakan alamat publik GitHub Pages, dan perangkat pemindai harus terhubung ke internet untuk membuka halaman. Alamat HTTP LAN juga dapat diisi jika server dapat diakses dari HP pada jaringan yang sama. Aplikasi memeriksa format URL, bukan ketersediaan hosting. Tidak diperlukan layanan QR pihak ketiga.

## Cara data dibawa

Label pada formulir, pratinjau, dan hasil scan mengikuti susunan identitas karyawan: nama, Nomor Induk Karyawan (NIK), jabatan, departemen/divisi, wilayah penugasan, dan masa berlaku kartu. Nama atribut internal tetap `name`, `employeeId`, `role`, `department`, `area`, dan `expiry` agar QR yang sudah dibagikan tetap dapat dibaca. Branding dan susunan tampilan dapat diperbarui tanpa membuat ulang QR; perubahan isi data pegawai memerlukan QR baru.

Saat mengedit `template.html`, pertahankan `data-page="profile"`, `data-bind`, `data-profile-photo`, serta elemen `scan-profile` dan `scan-error`. Keterangan `expiry-status` bersifat opsional; jika dihapus, data identitas tetap ditampilkan. Tanggal yang sudah lewat menampilkan keterangan berakhir dan tetap memperlihatkan data, bukan dianggap sebagai tautan rusak. Hindari label terverifikasi/resmi karena aplikasi ini tidak memeriksa data pada sistem perusahaan.

- Data teks UTF-8 dikodekan sebagai Base64URL dalam fragment `template.html#v1.<data>.<foto>` untuk mode Langsung, atau `#v3.<data>.` untuk mode Ringkas tanpa foto. Format v2 lama tetap dapat dibuka.
- Foto untuk mode Langsung di-crop persegi dan dikompres WebP maksimal 900 byte. Tautan v1 lama dengan foto hingga 1.050 byte dan v2 lama dengan foto hingga 24 KB tetap didukung. Mode Ringkas v3 tidak membawa foto serta menyembunyikan seluruh area foto pada hasil scan. Avatar netral hanya dipakai pada mode Langsung bila foto tidak diunggah.
- URL dibatasi 2.300 byte. Isian atau URL yang terlalu panjang akan menonaktifkan unduhan dengan pesan agar data dipersingkat. QR memakai koreksi kesalahan M dan quiet zone minimal empat modul.
- QR berisi snapshot. Mengubah formulir tidak mengubah QR lama; unduh QR baru setelah mengedit.
- Tidak ada penyimpanan di localStorage, cookie, analytics, atau request ke layanan eksternal. Data formulir hilang saat halaman dimuat ulang. Data kedua mode ikut dalam tautan QR. Browser/hosting dapat menyimpan riwayat URL atau log akses halaman; fragment tidak dikirim dalam request HTTP.
- Tautan bukan enkripsi atau tanda tangan digital. Pemilik QR dapat membaca dan memodifikasi seluruh data. Tanggal berlaku berasal dari isian pembuat profil, bukan hasil pemeriksaan perusahaan.
- Halaman scan memvalidasi format dan ukuran payload, menggunakan `textContent` untuk data teks, dan hanya menerima foto WebP inline. Tautan rusak menampilkan pesan kesalahan; halaman tanpa payload menampilkan status profil belum tersedia.

## Struktur

```text
index.html            Generator, formulir, live preview, unduh PNG
template.html         Halaman hasil scan responsif
style.css             Tema corporate navy dan electric blue
script.js             Validasi, codec URL, optimasi foto, rendering QR
qr-tools.js           Renderer piksel tajam dan ekspor file profil statis
photo-tools.js        Optimasi foto adaptif untuk mode Langsung
profiles/             File profil lama (opsional, kompatibilitas)
assets/logo-web.png   Versi logo yang diperkecil untuk halaman
assets/first med.png  Aset logo asli (dipertahankan)
assets/avatar.svg     Placeholder foto profil netral
assets/skyline.svg    Ilustrasi skyline perkotaan
assets/icons.svg      Ikon SVG lokal
assets/vendor/        Generator QR lokal dan lisensi MIT
serve.cjs             Server statis opsional untuk pengembangan
.nojekyll             Dukungan hosting statis GitHub Pages
```

Pustaka QR: [qrcode-generator oleh Kazuhiko Arase](https://github.com/kazuhikoarase/qrcode-generator), lisensi MIT disertakan di `assets/vendor/LICENSE-qrcode.txt`. Seluruh dependensi runtime disajikan secara lokal; tidak memakai CDN atau font eksternal.

## Pengujian pengembang

```sh
npm ci --ignore-scripts
npm test
```

`jsqr` dan `@napi-rs/canvas` hanya dependensi pengujian. Uji membaca raster hasil renderer menggunakan decoder independen pada ukuran preview dan ekspor, termasuk payload foto, mode ringkas, margin putih, tujuan lokal, data Unicode, dan tautan scan yang rusak. Gambar JPEG dan PNG kompleks sungguhan diuji melalui encoder WebP, versi foto mini dibaca kembali dari QR, dan versi profil diperiksa pada halaman scan. Pengujian ini tidak menggantikan percobaan kamera HP pada kondisi cahaya dan jarak nyata. Panduan margin putih: [DENSO WAVE — Securing Margin](https://www.qrcode.com/en/howto/code.html/index.html).
