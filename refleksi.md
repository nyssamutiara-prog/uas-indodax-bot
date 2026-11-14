# Refleksi UAS: Backtest vs Forward Test

Semua angka forward dan backtest di bawah dihasilkan oleh `node scripts/hitung_ulang.mjs data.json public/backtest.json` (fungsi `compute()` di `public/metrics.js`, sama dengan dashboard). Backtest dijalankan dengan `scripts/backtest.js` pada data historis asli Indodax (tf=60), ditarik 14 Nov 2026.

## 1. Hasil forward test (4 Nov 12.00 WIB sampai 14 Nov 12.00 WIB, 240 candle 1 jam)
- Candle terproses tepat waktu: 13 dari 240, uptime **5,4%**. Panggilan sukses terakhir 7 Nov 2026 12.52 UTC.
- Sejak sekitar 7 Nov 17.59 UTC, panggilan bot gagal dengan `HTTP 403 /api/server_time`. Tercatat 96 error API; dashboard menghitung 43 run, 14 sukses dan 29 gagal. Tidak ada perbaikan yang berhasil sampai akhir forward test.
- 0 order, return 0,00%, max drawdown 0,00%, equity tetap Rp100.000.000. Win rate, profit factor, dan porsi biaya tidak terdefinisi karena tidak ada trade.
- Benchmark buy and hold BTC/IDR dari log forward (ask ke bid, hanya 4 sampai 7 Nov): -2,25%.
- Equity harian hanya tercatat 4 hari (4 sampai 7 Nov).

## 2. Hasil backtest
| | Periode penuh (sekitar 3,2 tahun) | Jendela forward (4-14 Nov 2026) |
|---|---|---|
| Return total | -89,91% | -2,41% |
| CAGR | -51,16% | tidak ditampilkan |
| Max drawdown | -90,10% | -3,39% |
| Jumlah trade | 2.009 | 16 |
| Win rate | 15,8% | 12,5% |
| Profit factor | 0,38 | 0,02 |
| Fee total | Rp89,3 juta | Rp1,61 juta |
| Spread + slippage | Rp26,3 juta | Rp0,47 juta |
| Buy and hold BTC/IDR | +205,40% | -12,70% |

Porsi biaya periode penuh: 449,6% dari laba kotor. Laba kotor sebelum biaya sekitar Rp25,7 juta, sedangkan fee + spread + slippage Rp115,6 juta. Jadi strategi ini punya sedikit keunggulan sebelum biaya, tetapi biaya per transaksi (fee taker 0,51% dikali 2.009 trade) menghabiskannya. Penyebab utama kerugian adalah biaya dan jumlah trade yang terlalu banyak, bukan hanya persilangan palsu. Pada jendela 10 hari, biaya sekitar Rp2,08 juta, kurang lebih 86% dari total kerugian Rp2,41 juta.

## 3. Kecocokan backtest dan forward
- Backtest dijalankan ulang pada jendela forward dengan candle yang sama: 723 sinyal (241 candle x 3 pasangan).
- Kecocokan sinyal pada candle yang diproses bot: **100,0% (36/36)**. Kodenya sama (`signalFromCloses`), jadi sinyal identik.
- Hanya 36 dari 723 sinyal yang bisa dibandingkan karena bot hanya memproses 13 dari 240 candle. Sisanya tidak punya sinyal di log, jadi tidak diketahui apakah akan cocok.
- Ada 6 persilangan EMA yang tidak terbaca bot karena jatuh di candle yang terlewat. Backtest pada jendela itu menghasilkan 16 trade, forward 0 trade.
- Gap return forward dikurangi backtest: +2,41%. Angka ini **bukan** bukti forward lebih baik. Selisihnya muncul karena bot tidak sempat bertransaksi (0 trade), sedangkan backtest bertransaksi 16 kali dan kena biaya.
- Selisih harga fill per trade tidak bisa dihitung karena tidak ada order forward.

## 4. Spread dan slippage
| Pasangan | Asumsi backtest | Median snapshot | n |
|---|---|---|---|
| BTC/IDR | 0,20% | 0,0026% | 14 |
| ETH/IDR | 0,20% | 0,0570% | 14 |
| BNB/IDR | 0,20% | 0,4646% | 14 |

Slippage backtest 0,05% per order. Snapshot hanya 14 per pasangan (4 sampai 7 Nov) dan tidak ada sebelum freeze, jadi asumsi spread backtest tidak berasal dari pengukuran. Satu angka untuk semua pasangan terlalu besar untuk BTC dan ETH dan terlalu kecil untuk BNB. Karena aturan dibekukan, asumsi ini tidak diubah.

## 5. Uptime dan penjadwal
Jarak antar panggilan sukses 4,7 sampai 8,6 jam walaupun jadwal GitHub Actions tiap jam menit ke-7, karena GitHub Actions menunda atau melewatkan run. Jadwal kedua `37 * * * *` ditambah 13 Nov (lihat `CHANGELOG_OPERASIONAL.md`) tidak memperbaiki hasil karena error 403 sudah terjadi sejak 7 Nov.

## 6. Dugaan penyebab HTTP 403 (belum terbukti)
Pada 14 Nov, dari laptop yang sama, `curl` dan browser mendapat HTTP 200 dari `/api/server_time`, sedangkan `fetch` bawaan Node di kode mendapat 403. Dugaan saya, Indodax menolak cara Node/kode memanggil API (misalnya header atau User-Agent), dan hal serupa mungkin terjadi di Vercel. Ini dugaan, belum diuji dengan benar. `api/tick.js` juga memanggil `/api/server_time` tanpa cadangan, sehingga satu respons 403 menghentikan seluruh panggilan.

## 7. Keterbatasan
- Backtest tidak memodelkan daily loss limit dan penolakan data tidak valid (spread lebih dari 2%), dan mengeksekusi di open candle berikutnya dengan spread tetap, sedangkan bot mengeksekusi di order book saat panggilan terjadi (median terlambat sekitar 25 menit setelah candle ditutup).
- Daily loss limit dan kill switch tidak terpicu, jadi tidak terbukti di log. Idempotency terbukti (3 kali `candle_sudah_diproses`, tidak ada duplikat).
- Data historis ditarik dengan skrip bantuan `scripts/tarik_data_curl.mjs` karena `fetch` Node mendapat 403 (lihat changelog). Perbaikan Windows pada `scripts/hitung_ulang.mjs` juga dicatat di changelog. Keduanya tidak mengubah aturan, parameter, atau universe.

## 8. Pelajaran
Jika diulang: uji koneksi dari Vercel ke Indodax sebelum freeze, tambahkan cadangan untuk `/api/server_time`, kumpulkan snapshot sejak hari persiapan, pakai penjadwal yang lebih andal, dan kurangi frekuensi trade atau naikkan ambang sinyal agar biaya tidak menghabiskan keunggulan strategi.
