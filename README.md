# Cimol

Notch hijau gelap di tepi atas layar Windows. Arahkan kursor ke notch untuk membukanya.

- **Musik**: lagu yang sedang diputar (Spotify, YouTube di browser, Media Player, dll.), cover album, play/pause/next, dan geser progress untuk loncat.
- **Lirik tersinkron**: diambil dari [lrclib.net](https://lrclib.net). Baris aktif ikut tampil di notch kecil. Klik baris untuk loncat ke bagian itu.
- **Timer & Pomodoro**: hitung mundur bebas atau Pomodoro 25/5, dengan notifikasi saat selesai.
- **Rak file**: seret file ke notch untuk disimpan sementara, lalu seret keluar lagi ke aplikasi mana pun. Klik dua kali untuk membuka file, klik kanan untuk membuka foldernya.
- **Waktu sholat**: jadwal real-time sesuai lokasi (Windows Location → perkiraan IP → kota manual), memakai metode **Kemenag RI** dari [Aladhan](https://aladhan.com). Ada pengingat beberapa menit sebelumnya dan notifikasi + bunyi saat masuk waktu. Suara adzan bisa diganti dengan file audio sendiri.
- **Auto-update**: Cimol mengecek GitHub Releases saat dibuka dan setiap 4 jam. Update diunduh di belakang layar, lalu Anda ditanya sebelum dipasang.

Notch otomatis disembunyikan saat ada aplikasi fullscreen (video, game, presentasi).

## Instalasi

Unduh `CimolSetup-x.y.z.exe` dari [Releases](https://github.com/alfitranurr/cimol/releases/latest), lalu jalankan. Cimol terpasang per pengguna (tanpa hak admin) di `%LOCALAPPDATA%\Programs\cimol`.

> Installer belum ditandatangani secara digital, jadi Windows SmartScreen akan memperingatkan.
> Klik **More info → Run anyway**. Cocokkan dulu SHA-512 installer dengan `latest.yml` di halaman rilis kalau ingin memastikan file-nya asli.

## Update

### Otomatis dari aplikasi

Tidak perlu melakukan apa pun. Kalau ada versi baru, muncul notifikasi Windows dan dialog **Install sekarang / Nanti**. Bisa juga dicek manual lewat ikon tray → **Cek update**, atau tab ⚙ di notch.

### Lewat PowerShell

Skrip `cimol-update.ps1` ikut terpasang di folder `resources` Cimol:

```powershell
$u = "$env:LOCALAPPDATA\Programs\cimol\resources\cimol-update.ps1"

# Cek versi terbaru (ditanya sebelum memasang)
powershell -ExecutionPolicy Bypass -File $u

# Langsung pasang kalau ada versi baru
powershell -ExecutionPolicy Bypass -File $u -Install

# Cek otomatis setiap hari jam 09:00 dan tampilkan notifikasi kalau ada update
powershell -ExecutionPolicy Bypass -File $u -RegisterTask
powershell -ExecutionPolicy Bypass -File $u -RegisterTask -At 07:30   # jam lain

# Hapus jadwal
powershell -ExecutionPolicy Bypass -File $u -UnregisterTask
```

Saat memasang, skrip mencocokkan SHA-512 installer dengan `latest.yml` dari rilis. Kalau tidak cocok, update dibatalkan.

## Pengembangan

```powershell
npm install
npm start          # jalankan dari source
npm run icon       # buat ulang ikon dari build/icon.svg
npm run dist       # buat installer di dist/ (tanpa publish)
```

> Kalau menjalankan dari terminal VS Code, hapus dulu variabel `ELECTRON_RUN_AS_NODE`
> (`Remove-Item Env:ELECTRON_RUN_AS_NODE`). Kalau tidak, Electron berjalan sebagai Node biasa.

### Merilis patch

```powershell
npm version patch          # 0.1.0 -> 0.1.1, sekaligus commit + tag v0.1.1
git push --follow-tags
```

GitHub Actions ([release.yml](.github/workflows/release.yml)) membangun installer dan menerbitkannya ke Releases bersama `latest.yml`. Semua Cimol yang terpasang akan menerima update itu.

## Struktur

```
src/main/          proses utama Electron (window notch, tray, updater, media, sholat, lirik)
src/helpers/       skrip PowerShell: media-bridge.ps1 (sesi media Windows), location.ps1
src/renderer/      tampilan notch (HTML/CSS/JS tanpa framework)
scripts/           cimol-update.ps1, make-icon.mjs
```
