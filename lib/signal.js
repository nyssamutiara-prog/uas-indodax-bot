// FUNGSI SINYAL TUNGGAL - dipakai persis sama oleh backtest dan bot.
import { CONFIG } from "./config.js";
import { ema } from "./indicators.js";

// closes: array harga close dari bar TERTUTUP saja, urut lama -> baru.
export function signalFromCloses(closes) {
  const W = CONFIG.WARMUP_BARS;
  if (closes.length < W) return { signal: "NA", reason: "warmup_kurang" };
  const w = closes.slice(-W);
  const f = ema(w, CONFIG.EMA_FAST);
  const s = ema(w, CONFIG.EMA_SLOW);
  const i = w.length - 1;
  let signal = "HOLD";
  if (f[i - 1] <= s[i - 1] && f[i] > s[i]) signal = "BUY";
  else if (f[i - 1] >= s[i - 1] && f[i] < s[i]) signal = "SELL";
  return { signal, fast: f[i], slow: s[i] };
}

// BUY hanya bila belum punya posisi; SELL hanya bila punya posisi (long only, tanpa short).
export function decide(signal, hasPosition) {
  if (signal === "BUY" && !hasPosition) return "OPEN";
  if (signal === "SELL" && hasPosition) return "CLOSE";
  return "NONE";
}
