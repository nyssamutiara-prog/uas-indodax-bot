// Endpoint bot dry run. Dipanggil penjadwal tiap jam (menit ke-7). Dilindungi CRON_SECRET.
import { CONFIG, requireFee } from "../lib/config.js";
import { serverTimeSec, depth, candles, onlyClosed, pairs as fetchPairs } from "../lib/indodax.js";
import { normalizeBook, fillBuy, fillSell } from "../lib/execution.js";
import { signalFromCloses, decide } from "../lib/signal.js";
import { validateCandles, validateBook } from "../lib/validate.js";
import { getJSON, setJSON, push, getRaw, acquireLock, releaseLock } from "../lib/store.js";

const iso = (sec) => new Date(sec * 1000).toISOString();

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const t0 = Date.now();
  const call = { t: new Date().toISOString(), processed: [], skipped: [], errors: [], notes: [] };
  let locked = false;
  try {
    locked = await acquireLock("lock:tick", 120);
    if (!locked) { call.notes.push("lock_aktif_panggilan_diabaikan"); await push("log:calls", call); return res.status(200).json(call); }

    const fee = requireFee();
    const nowSec = await serverTimeSec();
    const fwdStart = Date.parse(CONFIG.FORWARD_START) / 1000, fwdEnd = Date.parse(CONFIG.FORWARD_END) / 1000;
    const inWindow = nowSec >= fwdStart && nowSec < fwdEnd;

    // ---- state ----
    let state = (await getJSON("state")) || { cash: CONFIG.INITIAL_CAPITAL, positions: {}, lastCandle: {}, day: null, createdAt: call.t };

    // ---- info pasangan (presisi volume) ----
    const meta = {};
    try {
      const ps = await fetchPairs();
      for (const p of ps) {
        const id = String(p.ticker_id || p.id || "").replace("_", "").toLowerCase();
        meta[id] = { step: Number(p.quantity_increment) || 1e-8, minQty: Number(p.trade_min_traded_currency) || 0 };
      }
    } catch (e) { call.errors.push({ where: "pairs", msg: String(e.message) }); }

    // ---- order book + snapshot (selalu disimpan, juga sebelum freeze) ----
    const books = {};
    for (const pair of CONFIG.PAIRS) {
      try {
        const b = normalizeBook(await depth(pair));
        books[pair] = b;
        const bid = b.bids[0]?.[0] ?? null, ask = b.asks[0]?.[0] ?? null;
        await push("log:snapshots", { t: iso(nowSec), pair, bid, ask, spread: bid && ask ? (ask - bid) / ask : null });
      } catch (e) { call.errors.push({ where: `depth:${pair}`, msg: String(e.message) }); }
    }

    // ---- ekuitas (posisi dinilai di best bid) ----
    const equityNow = () => {
      let e = state.cash;
      for (const [pair, pos] of Object.entries(state.positions)) {
        const bid = books[pair]?.bids[0]?.[0];
        e += pos.qty * (bid ?? pos.lastBid ?? pos.avg);
        if (bid) pos.lastBid = bid;
      }
      return e;
    };
    const equity = equityNow();

    // ---- batas hari WIB (00.00 WIB = 17.00 UTC) ----
    const dayKey = new Date((nowSec + 7 * 3600) * 1000).toISOString().slice(0, 10);
    if (!state.day || state.day.key !== dayKey) {
      state.day = { key: dayKey, startEquity: equity };
      await push("log:equity", { t: iso(nowSec), day: dayKey, equity });
    }
    const dailyBlocked = equity / state.day.startEquity - 1 < -CONFIG.DAILY_LOSS_LIMIT;
    if (dailyBlocked) call.notes.push("daily_loss_limit_aktif");

    // ---- kill switch ----
    const kill = process.env.KILL_SWITCH === "1" || (await getRaw("killswitch")) === "1";
    if (kill) { call.notes.push("KILL_SWITCH_AKTIF"); await push("log:errors", { t: call.t, type: "kill_switch", msg: "kill switch aktif: tidak ada order baru" }); }

    if (!inWindow) call.notes.push(`di_luar_jendela_forward_test (${CONFIG.FORWARD_START}..${CONFIG.FORWARD_END})`);

    // ---- sinyal tiap pasangan ----
    const todo = [];
    for (const pair of CONFIG.PAIRS) {
      try {
        const book = books[pair];
        if (!book) throw new Error("orderbook_tidak_tersedia");
        const cs = onlyClosed(await candles(pair, CONFIG.TF, nowSec - 700 * CONFIG.TF_SEC, nowSec), CONFIG.TF_SEC, nowSec);
        const vc = validateCandles(cs, nowSec), vb = validateBook(book);
        const last = cs[cs.length - 1];
        if (!vc.ok || !vb.ok) {
          const reason = !vc.ok ? vc.reason : vb.reason;
          call.skipped.push({ pair, reason });
          await push("log:errors", { t: call.t, type: "data_tidak_valid", pair, msg: reason });
          continue;
        }
        if (state.lastCandle[pair] === last.t) { call.skipped.push({ pair, reason: "candle_sudah_diproses" }); continue; } // idempotency
        const sig = signalFromCloses(cs.map((c) => c.c));
        todo.push({ pair, last, sig, book });
      } catch (e) {
        call.errors.push({ where: `signal:${pair}`, msg: String(e.message) });
        await push("log:errors", { t: call.t, type: "error_api", pair, msg: String(e.message) });
      }
    }

    // ---- eksekusi: SELL dulu, baru BUY ----
    const log_order = async (o) => push("log:orders", o);
    const actions = {};
    for (const x of todo) actions[x.pair] = decide(x.sig.signal, !!state.positions[x.pair]);

    for (const x of todo.filter((y) => actions[y.pair] === "CLOSE")) {
      if (!inWindow) { actions[x.pair] = "NONE(luar_jendela)"; continue; }
      const pos = state.positions[x.pair];
      const f = fillSell(x.book.bids, pos.qty, fee, { step: meta[x.pair]?.step ?? 1e-8 });
      if (!f) { actions[x.pair] = "SELL_GAGAL"; continue; }
      state.cash += f.cashIn; pos.qty -= f.qty;
      await log_order({ t: iso(nowSec), pair: x.pair, side: "SELL", qty: f.qty, bestBid: x.book.bids[0][0], bestAsk: x.book.asks[0][0], fill: f.avg, fee: f.fee, signalPrice: x.last.c, slipVsSignal: f.avg / x.last.c - 1, candleT: x.last.t });
      if (pos.qty <= 1e-12) delete state.positions[x.pair];
    }
    for (const x of todo.filter((y) => actions[y.pair] === "OPEN")) {
      if (!inWindow) { actions[x.pair] = "NONE(luar_jendela)"; continue; }
      if (kill) { actions[x.pair] = "DIBLOKIR(kill_switch)"; continue; }
      if (dailyBlocked) { actions[x.pair] = "DIBLOKIR(daily_loss_limit)"; continue; }
      if (Object.keys(state.positions).length >= CONFIG.MAX_POSITIONS) { actions[x.pair] = "DIBLOKIR(maks_posisi)"; continue; }
      const eq = equityNow();
      const budget = Math.min(CONFIG.POS_FRAC * eq, state.cash);
      const f = fillBuy(x.book.asks, budget, fee, { step: meta[x.pair]?.step ?? 1e-8, minQty: meta[x.pair]?.minQty ?? 0, minOrder: CONFIG.MIN_ORDER_IDR });
      if (!f) { actions[x.pair] = "BUY_GAGAL(min_order/kedalaman)"; continue; }
      state.cash -= f.cashOut;
      state.positions[x.pair] = { qty: f.qty, avg: f.avg, entryTime: iso(nowSec), lastBid: x.book.bids[0][0] };
      await log_order({ t: iso(nowSec), pair: x.pair, side: "BUY", qty: f.qty, bestBid: x.book.bids[0][0], bestAsk: x.book.asks[0][0], fill: f.avg, fee: f.fee, signalPrice: x.last.c, slipVsSignal: f.avg / x.last.c - 1, candleT: x.last.t });
    }

    // ---- catat sinyal & tandai candle sudah diproses ----
    for (const x of todo) {
      await push("log:signals", { processedAt: iso(nowSec), pair: x.pair, candleOpen: iso(x.last.t), candleT: x.last.t, close: x.last.c, fast: x.sig.fast, slow: x.sig.slow, signal: x.sig.signal, action: actions[x.pair] });
      state.lastCandle[x.pair] = x.last.t;
      call.processed.push({ pair: x.pair, candle: iso(x.last.t), signal: x.sig.signal, action: actions[x.pair] });
    }

    call.equity = equityNow();
    await setJSON("state", state);
  } catch (e) {
    call.errors.push({ where: "tick", msg: String(e.message || e) });
    try { await push("log:errors", { t: call.t, type: "tick_gagal", msg: String(e.message || e) }); } catch {}
  } finally {
    call.durationMs = Date.now() - t0;
    try { await push("log:calls", call); } catch {}
    if (locked) { try { await releaseLock("lock:tick"); } catch {} }
  }
  res.status(call.errors.some((x) => x.where === "tick") ? 500 : 200).json(call);
}
