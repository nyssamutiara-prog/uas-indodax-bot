// hitung_ulang.mjs — menghasilkan ulang SEMUA angka dashboard dari log mentah.
// Memakai fungsi yang sama persis dengan dashboard (public/metrics.js).
//
// Pemakaian:
//   node scripts/hitung_ulang.mjs data.json [public/backtest.json]
//   node scripts/hitung_ulang.mjs https://uas-indodax-bot-amber.vercel.app/api/data
//
// Output: ringkasan di terminal + hasil_hitung_ulang.json (bandingkan dengan
// tombol "metrik_dashboard.json" di dashboard: angkanya harus sama).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, "..", "public", "metrics.js"));
const { compute } = globalThis.UASMetrics;

const src = process.argv[2] || "data.json";
const btPath = process.argv[3] || path.join(here, "..", "public", "backtest.json");

const data = /^https?:/.test(src) ? await (await fetch(src)).json() : JSON.parse(fs.readFileSync(src, "utf8"));
const backtest = fs.existsSync(btPath) ? JSON.parse(fs.readFileSync(btPath, "utf8")) : null;
const M = compute(data, backtest);

const p = (x, d = 2) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(d) + "%");
const n = (x, d = 2) => (x == null || !isFinite(x) ? "—" : Number(x).toFixed(d));
const o = M.ops, f = M.fwd, b = M.bt, g = M.gap;

const rows = [
  ["Data sampai", o.asOf],
  ["— OPERASIONAL —", ""],
  ["Candle forward test (total)", o.totalCandles],
  ["Candle sudah lewat", o.elapsedCandles],
  ["Candle diproses tepat waktu", o.onTimeCandles],
  ["Uptime sejauh ini", p(o.uptimeSoFar, 1)],
  ["Panggilan terjadwal / run terlaksana", `${o.scheduledCalls} / ${o.runs} (sukses ${o.okRuns}, gagal ${o.failedRuns})`],
  ["Error API total", o.errorsTotal],
  ["Kill switch dipakai", o.killUses],
  ["Idempotency skip", o.idemSkips],
  ["Candle belum tertutup dipakai", o.unclosedUsed],
  ["Persilangan EMA tak terbaca", o.unseenCross.length],
  ["— FORWARD TEST —", ""],
  ["Return total", p(f.equity && f.equity.totalReturn)],
  ["Max drawdown", p(f.equity && f.equity.mdd)],
  ["Jumlah trade", f.stats.n],
  ["Win rate", p(f.stats.winRate, 1)],
  ["Profit factor", n(f.stats.profitFactor)],
  ["Rata-rata untung / rugi", `${p(f.stats.avgWinPct)} / ${p(f.stats.avgLossPct)}`],
  ["Porsi biaya", p(f.stats.costShare, 1)],
  ["Buy & hold BTC/IDR (ask→bid)", p(f.benchmark && f.benchmark.ret)],
  ["— BACKTEST —", b ? "" : "(public/backtest.json tidak ada)"],
];
if (b) rows.push(
  ["Return total", p(b.equity && b.equity.totalReturn)], ["CAGR", p(b.equity && b.equity.cagr)], ["Max drawdown", p(b.equity && b.equity.mdd)],
  ["Jumlah trade", b.stats.n], ["Win rate", p(b.stats.winRate, 1)], ["Profit factor", n(b.stats.profitFactor)],
  ["Rata-rata untung / rugi", `${p(b.stats.avgWinPct)} / ${p(b.stats.avgLossPct)}`], ["Porsi biaya", p(b.stats.costShare, 1)],
  ["Buy & hold BTC/IDR", p(b.benchmark && b.benchmark.totalReturn)],
);
if (g) rows.push(["— GAP —", ""], ["Kecocokan sinyal", `${p(g.matchRate, 1)} (${g.matches}/${g.candlesCompared})`], ["Gap return FT−BT", p(g.returnGap)]);
rows.push(["— SPREAD (median snapshot) —", ""], ...M.spread.map((s) => [s.pair, `${p(s.median, 4)} (n=${s.n}, sebelum freeze=${s.nPreFreeze})`]));

const w = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(k.padEnd(w + 2) + v);

fs.writeFileSync("hasil_hitung_ulang.json", JSON.stringify(M, null, 1));
console.log("\nDisimpan: hasil_hitung_ulang.json");
