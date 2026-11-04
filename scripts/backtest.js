// Backtest memakai fungsi sinyal & eksekusi yang SAMA dengan bot.
// Sinyal dihitung dari close bar t, order dieksekusi di open bar t+1 dengan spread+slippage.
// Pakai: node scripts/backtest.js                      (seluruh periode)
//        node scripts/backtest.js --from=2026-11-04T05:00:00Z --to=2026-11-14T05:00:00Z   (jendela forward test)
import fs from "node:fs";
import { CONFIG, requireFee } from "../lib/config.js";
import { signalFromCloses, decide } from "../lib/signal.js";
import { floorQty } from "../lib/execution.js";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const fromSec = arg("from") ? Date.parse(arg("from")) / 1000 : -Infinity;
const toSec = arg("to") ? Date.parse(arg("to")) / 1000 : Infinity;
const windowed = Number.isFinite(fromSec) || Number.isFinite(toSec);
const dataDir = arg("data") || "data";
const out = arg("out") || (windowed ? "backtest_window.json" : "backtest_results.json");

const fee = requireFee(), HALF = CONFIG.BT_SPREAD / 2, SLIP = CONFIG.BT_SLIPPAGE;
const bars = {};
for (const pair of CONFIG.PAIRS) {
  const f = `${dataDir}/${pair.toUpperCase()}_${CONFIG.TF}.csv`;
  const rows = fs.readFileSync(f, "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number));
  bars[pair] = new Map(rows.map(([t, o, h, l, c, v]) => [t, { t, o, h, l, c, v }]));
}
const timeline = [...new Set(CONFIG.PAIRS.flatMap((p) => [...bars[p].keys()]))].sort((a, b) => a - b);

let cash = CONFIG.INITIAL_CAPITAL;
const pos = {}, closes = {}, lastClose = {}, pending = {};
CONFIG.PAIRS.forEach((p) => { closes[p] = []; });
const equityCurve = [], trades = [], signals = [];
let feeTotal = 0, spreadSlipTotal = 0;

const equityMTM = () => cash + Object.entries(pos).reduce((s, [p, x]) => s + x.qty * lastClose[p] * (1 - HALF), 0);

for (const T of timeline) {
  const live = T >= fromSec && T <= toSec;
  // 1) eksekusi order tertunda di OPEN bar ini
  for (const side of ["SELL", "BUY"]) {
    for (const [pair, act] of Object.entries(pending)) {
      if (act !== side) continue;
      const b = bars[pair].get(T);
      if (!b) continue;               // pasangan tak punya bar: tunda
      delete pending[pair];
      if (side === "SELL") {
        const px = b.o * (1 - HALF - SLIP), q = pos[pair].qty, gross = q * px, f = gross * fee;
        cash += gross - f; feeTotal += f; spreadSlipTotal += q * (b.o - px);
        const cost = pos[pair].cost;
        trades.push({ pair, entryT: pos[pair].t, exitT: T, qty: q, entry: pos[pair].px, exit: px, pnl: gross - f - cost });
        delete pos[pair];
      } else {
        const eq = equityMTM(), budget = Math.min(CONFIG.POS_FRAC * eq, cash), px = b.o * (1 + HALF + SLIP);
        const q = floorQty(budget / (px * (1 + fee)), 1e-8), notional = q * px;
        if (q <= 0 || notional < CONFIG.MIN_ORDER_IDR || Object.keys(pos).length >= CONFIG.MAX_POSITIONS) continue;
        const f = notional * fee;
        cash -= notional + f; feeTotal += f; spreadSlipTotal += q * (px - b.o);
        pos[pair] = { qty: q, px, t: T, cost: notional + f };
      }
    }
  }
  // 2) update harga, catat ekuitas, hitung sinyal dari close bar T
  for (const pair of CONFIG.PAIRS) {
    const b = bars[pair].get(T);
    if (!b) continue;
    closes[pair].push(b.c); lastClose[pair] = b.c;
    if (!live) continue;
    const s = signalFromCloses(closes[pair]);
    const a = s.signal === "NA" ? "NONE" : decide(s.signal, !!pos[pair]);
    signals.push({ pair, candleT: T, close: b.c, signal: s.signal, action: a });
    if (a === "OPEN") pending[pair] = "BUY";
    if (a === "CLOSE") pending[pair] = "SELL";
  }
  if (live) equityCurve.push([T, equityMTM()]);
}

// ---- metrik ----
const eq = equityCurve.map((x) => x[1]);
let peak = CONFIG.INITIAL_CAPITAL, mdd = 0;
for (const v of eq) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
const end = eq.at(-1) ?? CONFIG.INITIAL_CAPITAL, ret = end / CONFIG.INITIAL_CAPITAL - 1;
const days = eq.length ? (equityCurve.at(-1)[0] - equityCurve[0][0]) / 86400 : 0;
const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
const sum = (a) => a.reduce((s, x) => s + x.pnl, 0);
const netPnl = sum(trades), costs = feeTotal + spreadSlipTotal, grossProfit = netPnl + costs;
const btc = bars["btcidr"], btcTimes = [...btc.keys()].filter((t) => t >= fromSec && t <= toSec).sort((a, b) => a - b);
const bh = btcTimes.length ? btc.get(btcTimes.at(-1)).c / btc.get(btcTimes[0]).c - 1 : null;
const result = {
  window: { from: equityCurve[0]?.[0], to: equityCurve.at(-1)?.[0], days },
  params: { ...CONFIG, FEE_TAKER: fee },
  return_total_pct: ret * 100,
  cagr_pct: !windowed && days > 0 ? (Math.pow(end / CONFIG.INITIAL_CAPITAL, 365.25 / days) - 1) * 100 : null,
  max_drawdown_pct: mdd * 100,
  trades: trades.length,
  win_rate_pct: trades.length ? (wins.length / trades.length) * 100 : null,
  profit_factor: losses.length && sum(losses) !== 0 ? sum(wins) / -sum(losses) : null,
  avg_win: wins.length ? sum(wins) / wins.length : null,
  avg_loss: losses.length ? sum(losses) / losses.length : null,
  cost_share_of_gross_profit: grossProfit > 0 ? costs / grossProfit : null,
  fee_total: feeTotal, spread_slippage_total: spreadSlipTotal,
  buy_hold_btc_pct: bh === null ? null : bh * 100,
};
fs.writeFileSync(out, JSON.stringify({ result, trades, signals, equity: equityCurve }, null, 1));
console.log(JSON.stringify(result, null, 2), `\n-> ${out}`);
