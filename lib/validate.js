import { CONFIG } from "./config.js";

// candles: bar TERTUTUP, urut lama -> baru, {t(detik), o,h,l,c,v}
export function validateCandles(candles, nowSec) {
  const tf = CONFIG.TF_SEC;
  if (!candles.length) return { ok: false, reason: "candle_kosong" };
  const last = candles[candles.length - 1];
  if (nowSec - last.t > 2 * tf) return { ok: false, reason: "candle_terakhir_basi" };
  if (candles.length < CONFIG.WARMUP_BARS) return { ok: false, reason: "bar_kurang_dari_warmup" };
  const win = candles.slice(-CONFIG.WARMUP_BARS);
  for (let i = 1; i < win.length; i++) {
    if (win[i].t - win[i - 1].t !== tf) return { ok: false, reason: "candle_hilang_di_jendela" };
  }
  if (!(last.c > 0) || !(last.o > 0) || !(last.v > 0)) return { ok: false, reason: "harga_atau_volume_nol" };
  return { ok: true };
}

export function validateBook(book) {
  if (!book.bids.length || !book.asks.length) return { ok: false, reason: "orderbook_kosong" };
  const bid = book.bids[0][0], ask = book.asks[0][0];
  if (!(bid > 0) || !(ask > 0)) return { ok: false, reason: "orderbook_harga_nol" };
  if ((ask - bid) / ask > CONFIG.MAX_SPREAD) return { ok: false, reason: "spread_lebih_dari_2pct" };
  return { ok: true };
}
