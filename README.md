# UAS Algoritma Trading - Bot Dry Run EMA Crossover (Indodax, Vercel)

Nama: NYSSA MUTIARA SYAKIEB | NIM: 25110200024

## Aturan yang dibekukan (freeze)
- **Strategi:** EMA 9 / EMA 21 crossover, timeframe 1 jam, long only (tanpa short, margin, leverage)
  - BUY: EMA 9 memotong EMA 21 dari bawah ke atas (pada candle TERTUTUP)
  - SELL: EMA 9 memotong EMA 21 dari atas ke bawah
  - HOLD: selain itu
- **Universe:** BTC/IDR, ETH/IDR, BNB/IDR. Kriteria likuiditas diukur di awal periode backtest (lihat `data/universe_liquidity.json`).
- **Modal virtual:** Rp100.000.000 | maks 10% ekuitas per transaksi | maks 3 posisi terbuka
- **Risk:** daily loss limit 3% (hari WIB), kill switch, retry terbatas, idempotency per candle
- **Eksekusi:** beli di ask, jual di bid dari order book live (habiskan level berikutnya); fee taker all-in = ____ (sumber & tanggal akses: ____ ); min order Rp25.000
- **Waktu mulai forward test:** 4 Nov 2026 12.00 WIB | **Berakhir:** 14 Nov 2026 12.00 WIB
- **Commit freeze (hash & waktu):** ____ (isi SETELAH commit freeze di langkah berikutnya, lalu commit lagi hanya README)

## Catatan perubahan dari strategi UTS
UTS memakai pullback RSI untuk saham harian. UAS memakai EMA crossover karena ditetapkan oleh soal UAS. ____ (tambahkan alasan)

## Struktur
- `lib/signal.js` fungsi sinyal tunggal (dipakai bot & backtest)
- `lib/execution.js` fill order book, fee, min order
- `api/tick.js` endpoint bot (dilindungi CRON_SECRET) | `api/ping.js` uji koneksi | `api/data.js` data log
- `scripts/fetch_history.js` tarik data historis asli Indodax | `scripts/backtest.js` | `scripts/check_fees.js`
- `.github/workflows/tick.yml` penjadwal tiap jam menit ke-7

## Menjalankan
1. `npm run check-fees` lalu isi `FEE_TAKER` di `lib/config.js`
2. `npm run fetch-history` (laptop) lalu `npm run backtest`
3. Deploy ke Vercel, set env var sesuai `.env.example`, tambahkan secret GitHub `CRON_SECRET` dan `TICK_URL`
4. `npm test` menjalankan uji logika

Secret hanya di environment variable. `.env` tidak pernah di-commit.
