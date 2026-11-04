// Uji logika (bukan hasil trading): fill order book, sinyal EMA, validasi.
import assert from "node:assert";
import { fillBuy, fillSell, normalizeBook } from "../lib/execution.js";
import { signalFromCloses, decide } from "../lib/signal.js";
import { validateCandles } from "../lib/validate.js";
import { CONFIG } from "../lib/config.js";

const book = normalizeBook({ buy: [["99", "1"], ["98", "5"]], sell: [["101", "1"], ["102", "5"]] });
const b = fillBuy(book.asks, 301, 0.001, { minOrder: 1 });
assert(b.avg > 101 && b.avg < 102, "beli harus habiskan level berikutnya di harga rata-rata ask");
assert(b.cashOut <= 301 + 1e-9, "tidak boleh melebihi anggaran");
const small = fillBuy(normalizeBook({ buy: [["99","1"]], sell: [["1500000000","1"]] }).asks, 5_000_000, 0.002, { step: 1e-8, minOrder: 1 });
assert(small && small.qty > 0.003 && small.qty < 0.0034, "BTC harus bisa dibeli pecahan (step 1e-8), bukan dibulatkan ke 0");
const s = fillSell(book.bids, 2, 0.001);
assert(Math.abs(s.avg - 98.5) < 1e-9, "jual di bid, rata-rata level");
assert(fillBuy(book.asks, 100, 0.001, { minOrder: 1000 }) === null, "di bawah min order ditolak");

const L = CONFIG.WARMUP_BARS + 200;
const up = Array.from({ length: L }, (_, i) => (i < L - 100 ? 100 - i * 0.05 : 100 - (L - 100) * 0.05 + (i - (L - 100)) * 2));
const sigs = []; for (let n = CONFIG.WARMUP_BARS; n <= up.length; n++) sigs.push(signalFromCloses(up.slice(0, n)).signal);
assert(sigs.includes("BUY"), "harus ada sinyal BUY pada pembalikan naik");
assert(decide("BUY", true) === "NONE" && decide("SELL", false) === "NONE", "tanpa short & tanpa beli dobel");

const now = 1_800_000_000, tf = CONFIG.TF_SEC;
const cs = Array.from({ length: CONFIG.WARMUP_BARS }, (_, i) => ({ t: now - (CONFIG.WARMUP_BARS - i) * tf, o: 1, h: 1, l: 1, c: 1, v: 1 }));
assert(validateCandles(cs, now).ok, "data valid lolos");
const gap = cs.slice(); gap.splice(100, 1);
assert(!validateCandles(gap.concat([{ t: now - tf, o: 1, h: 1, l: 1, c: 1, v: 1 }]), now).ok, "candle hilang ditolak");
assert(validateCandles(cs, now + 5 * tf).reason === "candle_terakhir_basi", "candle basi ditolak");
console.log("SEMUA UJI LOGIKA LOLOS");
