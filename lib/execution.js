// Eksekusi simulasi di order book: beli di ask, jual di bid, habiskan level berikutnya bila perlu.
// Fill di mid/close DILARANG.
export function normalizeBook(depth) {
  const parse = (a) => (a || []).map(([p, v]) => [Number(p), Number(v)]).filter(([p, v]) => p > 0 && v > 0);
  return {
    bids: parse(depth.buy).sort((a, b) => b[0] - a[0]),
    asks: parse(depth.sell).sort((a, b) => a[0] - b[0]),
  };
}

// Bulatkan ke bawah ke kelipatan quantity_increment (step), mis. 1e-8.
export function floorQty(q, step = 1e-8) {
  const d = Math.max(0, Math.round(-Math.log10(step)));
  const n = Math.floor(q / step + 1e-9);
  return Number((n * step).toFixed(d));
}

// Jalan di level sampai qty terpenuhi. Kembalikan qty terisi, notional, harga rata-rata.
export function walk(levels, qty) {
  let remain = qty, notional = 0, filled = 0;
  for (const [p, v] of levels) {
    if (remain <= 0) break;
    const take = Math.min(v, remain);
    notional += take * p; filled += take; remain -= take;
  }
  return { filled, notional, avg: filled > 0 ? notional / filled : 0 };
}

// Beli dengan anggaran IDR (sudah termasuk fee). Mengembalikan null bila tidak memenuhi minimum.
export function fillBuy(asks, budgetIdr, fee, { step = 1e-8, minQty = 0, minOrder = 25000 } = {}) {
  let remain = budgetIdr, qty = 0;
  for (const [p, v] of asks) {
    const affordable = remain / (p * (1 + fee));
    const take = Math.min(v, affordable);
    if (take <= 0) break;
    qty += take; remain -= take * p * (1 + fee);
    if (take < v) break;
  }
  qty = floorQty(qty, step);
  if (qty <= 0 || qty < minQty) return null;
  const w = walk(asks, qty);
  if (w.filled < qty - 1e-12) return null;
  if (w.notional < minOrder) return null;
  const feeIdr = w.notional * fee;
  return { qty: w.filled, avg: w.avg, notional: w.notional, fee: feeIdr, cashOut: w.notional + feeIdr };
}

// Jual qty di bid. Bila kedalaman kurang, terisi sebagian (sisa tetap di posisi).
export function fillSell(bids, qty, fee, { step = 1e-8 } = {}) {
  const q = floorQty(qty, step);
  if (q <= 0) return null;
  const w = walk(bids, q);
  if (w.filled <= 0) return null;
  const feeIdr = w.notional * fee;
  return { qty: w.filled, avg: w.avg, notional: w.notional, fee: feeIdr, cashIn: w.notional - feeIdr };
}
