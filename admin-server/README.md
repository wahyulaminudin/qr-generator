# Login GitHub untuk generator

Backend login berjalan di `https://employeeinformation-admin.qr-studio-enterprise.workers.dev`. Beranda GitHub Pages menggunakan halaman masuk; halaman hasil scan tetap publik. Kode generator lokal tetap berada pada `index.html`, tetapi tidak disajikan pada branch publik `public-site`.

Pilihan hosting: Cloudflare Workers **Free**, tanpa database. Jangan mengaktifkan paket Paid atau layanan berbayar. Paket Free adalah paket dengan kuota harian, bukan masa uji coba beberapa hari. Periksa ketentuan terbaru pada https://developers.cloudflare.com/workers/platform/pricing/.

## Batas akses

- `/` menampilkan login; `/generator` hanya dikirim setelah sesi diperiksa server.
- Login dilakukan di GitHub. Aplikasi tidak meminta password GitHub dan tidak meminta akses repository atau email privat.
- Akses dibatasi ke ID GitHub administrator `168415197` (akun yang sebelumnya terhubung), bukan nama/email yang bisa diganti.
- OAuth memakai state acak dan PKCE S256. Sesi ditandatangani HMAC dengan masa berlaku empat jam, dikirim melalui cookie Secure, HttpOnly, SameSite=Lax. Token GitHub hanya dipakai di memori server saat masuk.
- Logout menggunakan POST dan token CSRF yang terikat sesi, termasuk ketika kebijakan no-referrer menghasilkan Origin:null. Redirect dari penyedia OAuth tidak diikuti; kredensial tidak diteruskan ke host lain.
- Formulir dan data pegawai tetap diproses di browser. Tidak ada penyimpanan data pegawai di backend ini.
- QR yang sudah dibagikan tetap menuju `https://employeeinformation.github.io/template.html#...` atau alamat lama yang sudah tersedia. Pembaca v1/v2/v3, `template.html`, dan file profil lama tidak dipindahkan atau dihapus.
- Penguncian ini membatasi halaman generator yang dihosting; kode aplikasi dan isi URL QR bukan bukti keaslian identitas.

## Aktivasi satu kali

1. Masuk/buat akun Cloudflare dan gunakan Workers Free. Akun dan persetujuan layanan dikelola pemiliknya; tidak ada langganan berbayar yang diperlukan oleh implementasi ini.
2. Dari root proyek, jalankan `node admin-server/build.cjs`. Hasilnya berada di `output/admin-deployment`. File HTML generator berada di dalam Worker, **bukan** direktori aset publik.
3. Publikasikan Worker dengan Wrangler: `npx wrangler deploy --config admin-server/wrangler.jsonc`. Hosting awal akan menampilkan status belum dikonfigurasi, tanpa memberikan formulir kepada pengunjung.
4. Catat origin HTTPS Worker yang diberikan Cloudflare. Daftarkan GitHub OAuth App melalui https://github.com/settings/developers. Homepage memakai origin tersebut, dan callback tepat `<origin>/auth/callback`. Device Flow tidak diperlukan. Expiring tokens boleh tetap diaktifkan; aplikasi tidak menyimpan atau memperbarui token GitHub.
5. `APP_ORIGIN` dan `GITHUB_CLIENT_ID` merupakan konfigurasi publik dalam `wrangler.jsonc`. Simpan `GITHUB_CLIENT_SECRET` dan `SESSION_SECRET` sebagai Worker secrets melalui dashboard Cloudflare atau `wrangler secret put --config admin-server/wrangler.jsonc NAMA_VARIABEL`. `APP_ORIGIN` harus tanpa slash terakhir. `SESSION_SECRET` harus acak, minimum 32 karakter. Jangan kirim nilai secret melalui chat, commit GitHub, atau kode frontend. Nama variabel contoh ada di `.env.example`.
6. Uji: pengunjung anonim ditolak dari `/generator`; akun administrator bisa masuk dan keluar; akun lain ditolak; QR baru tetap membawa alamat GitHub Pages yang lama; QR lama terbuka tanpa login.
7. **Setelah login server berhasil diuji**, ganti beranda generator publik di kedua situs GitHub Pages dengan halaman masuk yang menuju origin Worker. Publikasikan hanya beranda masuk, `template.html`, aset, JS pembaca profil, dan file profil lama. Jangan terbitkan HTML generator sebagai aset publik, termasuk melalui jalur alternatif. Sumber generator tetap tersedia lokal untuk pengembangan.

Jangan memasang tombol login palsu atau menggunakan localStorage sebagai bukti login. Pemisahan branch memastikan HTML generator dan sumber server tidak ikut diterbitkan sebagai file statis GitHub Pages. Repository sumber tetap mengikuti visibilitas repository yang telah ada.

## Mengedit setelah aktivasi

### Dua jenis generator

- Setelah login, gunakan pilihan **First Media** dan **Reportase Times** di bagian atas halaman. `/generator` tetap membuka First Media; `/generator-reportase` membuka form pers. Keduanya memerlukan sesi GitHub administrator yang sama.
- Sumber First Media tetap `index.html`, dengan pembaca publik `template.html` dan payload `v1/v2/v3` yang tidak berubah.
- Sumber Reportase Times adalah `reportase.html`. Profil publiknya memakai `reportase-profile.html`, `reportase.css`, `reportase.js`, dan `reportase-tools.js`, dengan payload tersendiri `rt1`. Data mencakup nama, nomor pers, posisi, desk, wilayah, masa berlaku, email redaksi opsional, profil singkat opsional, dan foto mini opsional. Mode awal tanpa foto.
- QR Reportase Times memakai modul hitam, penanda merah tua, latar putih, koreksi M, dan margin putih minimal empat modul. Jangan mengganti modul menjadi perak terang atau menaruh logo di atas kode karena dapat mengurangi keterbacaan.
- File generator `reportase.html` hanya disisipkan ke Worker setelah sesi diperiksa. Jangan mengunggahnya ke `public-site`. Terbitkan hanya pembaca profil Reportase Times beserta aset dan skripnya ke GitHub Pages.
- QR baru menuju alamat permanen `reportase-profile.html#rt1…`. Data dibawa oleh tautan; tidak ada database. QR sebelumnya menyimpan salinan data sebelumnya. Mengganti tipe generator tidak mengubah QR atau profil yang sudah dibagikan.

### Sumber dan publikasi

- Branch `main`: sumber proyek, generator lokal, pengujian, dan backend login. Perubahan generator perlu dibangun serta diterbitkan ulang ke Cloudflare.
- Branch `public-site`: beranda login dan halaman hasil scan yang diterbitkan GitHub Pages. Untuk mengedit teks/tampilan hasil scan langsung di GitHub, pilih branch ini lalu edit `template.html` atau `style.css`.
- Ketika memperbarui branch publik dari sumber, salin seluruh file profil lama beserta jalurnya. Pertahankan alamat `template.html`, versi pembaca payload, dan file `profiles/` yang sudah dibagikan. Jangan menyalin kembali `index.html` generator ke branch publik.
- Aset, JavaScript pembaca, dan source GitHub tetap bisa dibaca sesuai visibilitas repository. Login membatasi akses halaman generator online, bukan keaslian payload QR.

## Pemeriksaan

`npm.cmd test` menjalankan uji QR dan autentikasi: akun yang tidak diizinkan, state/PKCE, sesi palsu/kedaluwarsa, validasi origin, logout, kegagalan GitHub, dan ketiadaan konfigurasi. `node admin-server/build.cjs` membuat artefak deployment. Uji ini memakai respons OAuth tiruan; login GitHub nyata memerlukan OAuth App dan server yang sudah aktif.

Logout menghapus sesi pada browser tersebut. Untuk membatalkan seluruh sesi sebelum empat jam, ganti `SESSION_SECRET`. Ini tidak mengubah data atau tautan QR lama.
