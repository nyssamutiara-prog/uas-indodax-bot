// buat_backtest_json.mjs — menggabungkan output scripts/backtest.js menjadi public/backtest.json
// untuk dashboard. TIDAK mengubah strategi/parameter: hanya membaca file hasil backtest
// dan menyusun ulang formatnya. Semua angka tetap berasal dari backtest.js.
//
// Urutan di laptop (setelah forward test selesai, Sabtu 14 Nov ≥ 12.00 WIB):
//   npm run fetch-history        # pastikan data/*.csv sudah mencakup sampai 14 Nov 05.00 UTC
//   node scripts/backtest.js                                                         # -> backtest_results.json
//   node scripts/backtest.js --from=2026-11-04T05:00:00Z --to=2026-11-14T05:00:00Z   # -> backtest_window.json
//   node scripts/buat_backtest_json.mjs                                              # -> public/backtest.json
import fs from "node:fs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const fullFile = arg("full", "backtest_results.json");
const winFile = arg("window", "backtest_window.json");
const dataDir = arg("data", "data");
const outFile = arg("out", "public/backtest.json");

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const full = read(fullFile), win = read(winFile);
if (!full) { console.error(`Tidak ada ${fullFile}. Jalankan dulu: node scripts/backtest.js`); process.exit(1); }
if (!win) console.warn(`Peringatan: ${winFile} tidak ada — pencocokan sinyal per candle tidak akan tampil.`);

const P = full.result.params;
const TF_SEC = Number(P.TF_SEC) || (Number(P.TF) ? Number(P.TF) * 60 : 3600);
const FEE = Number(P.FEE_TAKER), HALF = Number(P.BT_SPREAD) / 2, SLIP = Number(P.BT_SLIPPAGE);
const iso = (sec) => new Date(sec * 1000).toISOString();

// Rincian biaya per trade, diturunkan dari rumus di backtest.js:
//   beli  : px = open × (1 + HALF + SLIP), fee = q × px × FEE
//   jual  : px = open × (1 − HALF − SLIP), fee = q × px × FEE
function convTrades(trades) {
  return (trades || []).map((t) => {
    const oIn = t.entry / (1 + HALF + SLIP), oOut = t.exit / (1 - HALF - SLIP);
    return {
      pair: t.pair, entryT: iso(t.entryT), exitT: iso(t.exitT),
      entryCandleT: t.entryT - TF_SEC,   // candle sinyal = bar sebelum bar eksekusi (sama dengan candleT di log bot)
      exitCandleT: t.exitT - TF_SEC,
      entryPrice: t.entry, exitPrice: t.exit, qty: t.qty, pnl: t.pnl,
      fee: t.qty * t.entry * FEE + t.qty * t.exit * FEE,
      spreadCost: t.qty * (oIn + oOut) * HALF,
      slippageCost: t.qty * (oIn + oOut) * SLIP,
    };
  });
}
const convEquity = (eq) => (eq || []).map(([t, e]) => ({ t: iso(t), equity: e }));

// Benchmark buy & hold BTC/IDR: close harian (tiap 24 bar) dari data historis yang sama
let benchmark = [];
const btcFile = `${dataDir}/BTCIDR_${P.TF}.csv`;
if (fs.existsSync(btcFile) && full.equity.length) {
  const t0 = full.equity[0][0], t1 = full.equity.at(-1)[0];
  const rows = fs.readFileSync(btcFile, "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number))
    .filter(([t]) => t >= t0 && t <= t1).sort((a, b) => a[0] - b[0]);
  const step = Math.max(1, Math.round(86400 / TF_SEC));
  benchmark = rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map(([t, , , , c]) => ({ t: iso(t), close: c }));
} else console.warn(`Peringatan: ${btcFile} tidak ditemukan — benchmark backtest tidak tampil.`);

const pairs = P.PAIRS || [...new Set(full.trades.map((t) => t.pair))];
const out = {
  meta: {
    source: `scripts/backtest.js (${fullFile}${win ? " + " + winFile : ""}), dibuat ${new Date().toISOString()}`,
    spreadAssumption: Object.fromEntries(pairs.map((p) => [p, Number(P.BT_SPREAD)])),
    slippageAssumption: Object.fromEntries(pairs.map((p) => [p, SLIP])),
    feeTaker: FEE,
    config: { TF_SEC },
    backtestJsResult: { full: full.result, window: win ? win.result : null },   // angka asli dari backtest.js, untuk dicocokkan
  },
  full: { equity: convEquity(full.equity), trades: convTrades(full.trades), benchmark },
  window: win ? {
    equity: convEquity(win.equity), trades: convTrades(win.trades),
    signals: win.signals.map((s) => ({ pair: s.pair, candleT: s.candleT, signal: s.signal })),
  } : undefined,
};

fs.writeFileSync(outFile, JSON.stringify(out));
const r = full.result;
console.log(`${outFile} dibuat: ${out.full.equity.length} titik ekuitas, ${out.full.trades.length} trade, ${benchmark.length} titik benchmark` +
  (win ? `, ${out.window.signals.length} sinyal jendela forward` : ""));
console.log(`Cek silang dengan backtest.js → return ${r.return_total_pct?.toFixed(2)}%, CAGR ${r.cagr_pct?.toFixed(2)}%, MDD ${r.max_drawdown_pct?.toFixed(2)}%, ${r.trades} trade`);
console.log("Angka ini harus sama dengan bagian Backtest di dashboard (lihat juga: node scripts/hitung_ulang.mjs data.json).");
