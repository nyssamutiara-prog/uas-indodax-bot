// Cek fee taker, minimum order, presisi dari /api/pairs. Bandingkan dengan help.indodax.com lalu isi CONFIG.FEE_TAKER (pakai yang LEBIH MAHAL).
import { pairs } from "../lib/indodax.js";
import { CONFIG } from "../lib/config.js";

const ps = await pairs();
console.log("Tanggal akses:", new Date().toISOString(), " URL: https://indodax.com/api/pairs");
console.log("Contoh 1 pasangan mentah (untuk cek nama field):\n", JSON.stringify(ps[0], null, 1));
for (const pair of CONFIG.PAIRS) {
  const p = ps.find((x) => String(x.ticker_id || x.id || "").replace("_", "").toLowerCase() === pair);
  if (!p) { console.log(pair, "-> TIDAK DITEMUKAN di /api/pairs"); continue; }
  console.log(pair, {
    taker_percent: p.trade_fee_percent_taker, maker_percent: p.trade_fee_percent_maker,
    min_base_idr: p.trade_min_base_currency, min_traded: p.trade_min_traded_currency,
    quantity_increment: p.quantity_increment, price_precision: p.price_precision,
  });
}
console.log("\nNOTE: taker_percent biasanya dalam persen (mis. 0.51 = 0,51%). Di config tulis sebagai pecahan: 0.0051.");
