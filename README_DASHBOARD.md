# Dashboard UAS — cara pasang & format data

Semua angka di dashboard dihitung otomatis oleh `public/metrics.js` dari:
1. **`/api/data`**: log mentah bot (calls, orders, signals, equity, errors, snapshots, state)
2. **`public/backtest.json`**: hasil backtest yang diekspor dari skrip backtest di laptop (opsional, tapi wajib untuk metrik backtest dan pencocokan sinyal)

Tidak ada angka yang diketik manual. Yang diisi sendiri hanya **teks** di blok `window.UAS_INFO` di awal `public/index.html` (nama, NIM, aturan strategi, sumber fee, hash commit freeze, refleksi). Bagian yang masih perlu diisi ditandai `ISI`.

## File

| File | Fungsi |
|---|---|
| `public/index.html` | Dashboard di Vercel (alamat utama `/`) |
| `public/metrics.js` | Semua perhitungan metrik (dipakai dashboard + hitung_ulang + offline) |
| `public/backtest.json` | Hasil backtest (dibuat dari skrip backtest, lihat format di bawah) |
| `scripts/hitung_ulang.mjs` | Menghitung ulang semua angka dashboard dari log mentah |
| `scripts/build_offline.mjs` | Membuat `dashboard_offline.html` mandiri (log tertanam) |

## Langkah

```bash
# 1. hitung ulang dari log live (atau dari data.json yang sudah diunduh)
node scripts/hitung_ulang.mjs https://uas-indodax-bot-amber.vercel.app/api/data

# 2. setelah forward test selesai (Sabtu 14 Nov 12.00 WIB): buat dashboard offline + data.json
node scripts/build_offline.mjs https://uas-indodax-bot-amber.vercel.app/api/data
```

Bukti angka sama: tombol **metrik_dashboard.json** di dashboard dan file `hasil_hitung_ulang.json` berisi objek hasil yang sama, karena keduanya dihasilkan oleh fungsi `compute()` di `metrics.js`.

Konfigurasi bawaan ada di `DEFAULTS` dalam `metrics.js`: timeframe 1 jam, jendela forward 4 Nov 05.00 UTC sampai 14 Nov 05.00 UTC, modal Rp100 juta, benchmark `btcidr`. Konfigurasi ini bisa ditimpa lewat `backtest.json → meta.config`.

## Membuat `public/backtest.json` dari `scripts/backtest.js`

`scripts/buat_backtest_json.mjs` hanya membaca output `backtest.js` dan menyusun ulang formatnya. Strategi dan parameternya tidak diubah.

```bash
npm run fetch-history     # data/*.csv harus mencakup sampai 14 Nov 2026 05.00 UTC
node scripts/backtest.js                                                         # -> backtest_results.json
node scripts/backtest.js --from=2026-11-04T05:00:00Z --to=2026-11-14T05:00:00Z   # -> backtest_window.json
node scripts/buat_backtest_json.mjs                                              # -> public/backtest.json
```

Rincian fee, spread, dan slippage per trade diturunkan dari rumus di `backtest.js`. Harga beli = open × (1 + BT_SPREAD/2 + BT_SLIPPAGE), harga jual = open × (1 − BT_SPREAD/2 − BT_SLIPPAGE), fee = qty × harga × FEE_TAKER. Angka asli `result` dari `backtest.js` ikut disimpan di `meta.backtestJsResult` untuk dicocokkan.

## Format `public/backtest.json`

Formatnya seperti di bawah. Semua angka berasal dari backtest dengan data asli Indodax.

```json
{
  "meta": {
    "source": "backtest.mjs commit <hash>, data history_v2 tf=60",
    "spreadAssumption":   { "btcidr": 0.0003, "ethidr": 0.0006, "bnbidr": 0.0046 },
    "slippageAssumption": { "btcidr": 0.0001, "ethidr": 0.0002, "bnbidr": 0.0010 },
    "config": { "TF_SEC": 3600 }
  },
  "full": {
    "equity":    [ { "t": "2023-11-01T00:00:00Z", "equity": 100000000 }, ... ],
    "trades":    [ { "pair": "btcidr", "entryT": "...", "exitT": "...", "entryCandleT": 1700000000,
                     "entryPrice": 0, "exitPrice": 0, "qty": 0, "fee": 0, "spreadCost": 0, "slippageCost": 0,
                     "pnl": 0 } ],
    "benchmark": [ { "t": "2023-11-01T00:00:00Z", "close": 0 } ]
  },
  "window": {
    "equity":  [ { "t": "2026-11-04T05:00:00Z", "equity": 100000000 }, ... ],
    "trades":  [ ...format sama dengan full.trades... ],
    "signals": [ { "pair": "btcidr", "candleT": 1793764800, "signal": "HOLD" }, ... ]
  }
}
```

Keterangan field:
- `full`: backtest periode penuh (minimal 3 tahun). Dipakai untuk return total, CAGR, max drawdown, statistik trade, dan buy & hold BTC/IDR (`benchmark` = close BTC/IDR harian).
- `window`: backtest yang **dijalankan ulang pada jendela forward test (4–14 Nov) dengan candle yang sama**. `signals` harus berisi sinyal untuk **setiap** candle 1 jam per pasangan, dengan `candleT` = waktu buka candle (detik unix, sama dengan `candleT` di log bot). Gunakan nilai `signal` yang sama persis dengan keluaran `signalFromCloses` (mis. `BUY` / `SELL` / `HOLD`).
- `pnl` boleh dikosongkan. Kalau kosong, nilainya dihitung sebagai `(exitPrice − entryPrice) × qty − fee − spreadCost − slippageCost`.
- `entryCandleT` dipakai untuk memasangkan trade backtest dengan trade forward (selisih harga fill per trade).
