# Catatan perubahan operasional (forward test)

Perubahan di bawah ini hanya menyangkut penjadwalan dan akses data.
Aturan strategi, parameter, dan universe TIDAK berubah sejak freeze date
(4 Nov 2026, 12.00 WIB).

## 13 Nov 2026

### Penjadwal GitHub Actions (`.github/workflows/tick.yml`)
- Masalah: log bot dan Vercel Request Logs menunjukkan panggilan `/api/tick`
  jauh lebih jarang dari jadwal tiap jam (GitHub Actions menunda atau
  melewatkan run terjadwal).
- Perubahan: menambah jadwal kedua `37 * * * *` selain `7 * * * *`, serta
  `concurrency` agar run tidak tumpang tindih dan `timeout-minutes: 5`.
- Dampak pada aturan: tidak ada. Idempotency di bot memastikan satu candle
  hanya diproses sekali.

### Error HTTP 403 dari Indodax (`/api/server_time`)
- Temuan: sejak sekitar 7 Nov 2026 (17.59 UTC), panggilan bot dari Vercel
  mencatat `HTTP 403 /api/server_time`; log mentah tetap disimpan apa adanya
  di `/api/data`.
- Status: [isi setelah perbaikan: tanggal, jam, dan apa yang diubah]
- Dampak pada aturan: tidak ada.

## 14 Nov 2026
- fetch bawaan Node mendapat HTTP 403 dari Indodax saat menarik data historis. Data ditarik lewat curl dengan skrip bantuan scripts/tarik_data_curl.mjs.
- scripts/hitung_ulang.mjs error ERR_UNSUPPORTED_ESM_URL_SCHEME di Windows; diperbaiki dengan pathToFileURL.
- Tidak ada perubahan aturan, parameter, atau universe.
