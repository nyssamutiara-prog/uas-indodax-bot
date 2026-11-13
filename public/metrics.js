/*
 * metrics.js — SATU-SATUNYA tempat semua angka dashboard dihitung.
 * Dipakai oleh: public/index.html (browser), scripts/hitung_ulang.mjs (Node),
 * dan dashboard offline (di-inline oleh scripts/build_offline.mjs).
 * Tidak ada angka yang diketik manual: semua berasal dari log mentah (/api/data)
 * dan hasil backtest (backtest.json).
 */
(function (root) {
  "use strict";

  const DEFAULTS = {
    TF_SEC: 3600,                              // timeframe bot: 1 jam
    FORWARD_START: "2026-11-04T05:00:00Z",     // freeze: Rabu 4 Nov 2026 12.00 WIB
    FORWARD_END: "2026-11-14T05:00:00Z",       // Sabtu 14 Nov 2026 12.00 WIB
    INITIAL_CAPITAL: 100000000,
    BENCHMARK_PAIR: "btcidr",
    RUN_GROUP_SEC: 90,                         // panggilan berjarak <90 dtk = 1 run (retry)
  };

  const ms = (x) => (typeof x === "number" ? (x < 1e12 ? x * 1000 : x) : Date.parse(x));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const quantile = (a, q) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };

  function maxDrawdown(series) {
    let peak = -Infinity, mdd = 0, peakT = null, troughT = null, curPeakT = null;
    for (const p of series) {
      if (p.equity > peak) { peak = p.equity; curPeakT = p.t; }
      const dd = p.equity / peak - 1;
      if (dd < mdd) { mdd = dd; peakT = curPeakT; troughT = p.t; }
    }
    return { mdd, peakT, troughT };
  }

  function tradeStats(trades) {
    const n = trades.length;
    const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
    const gw = sum(wins.map((t) => t.pnl)), gl = Math.abs(sum(losses.map((t) => t.pnl)));
    const cost = sum(trades.map((t) => t.fee + t.spreadCost + t.slippageCost));
    const gross = sum(trades.map((t) => t.grossPnl));
    return {
      n,
      winRate: n ? wins.length / n : null,
      profitFactor: n ? (gl > 0 ? gw / gl : (gw > 0 ? Infinity : null)) : null,
      avgWinPct: wins.length ? sum(wins.map((t) => t.pnlPct)) / wins.length : null,
      avgLossPct: losses.length ? sum(losses.map((t) => t.pnlPct)) / losses.length : null,
      avgWinIdr: wins.length ? gw / wins.length : null,
      avgLossIdr: losses.length ? -gl / losses.length : null,
      netPnl: sum(trades.map((t) => t.pnl)),
      totalFee: sum(trades.map((t) => t.fee)),
      totalSpread: sum(trades.map((t) => t.spreadCost)),
      totalSlippage: sum(trades.map((t) => t.slippageCost)),
      totalCost: cost,
      grossPnl: gross,
      costShare: gross > 0 ? cost / gross : null,   // (fee+spread+slippage) / laba kotor
    };
  }

  /* Pasangkan order BUY/SELL (FIFO per pasangan) menjadi trade tertutup. */
  function tradesFromOrders(orders) {
    const open = {}, trades = [];
    const sorted = [...orders].sort((a, b) => ms(a.t) - ms(b.t));
    for (const o of sorted) {
      const mid = (o.bestBid + o.bestAsk) / 2, half = (o.bestAsk - o.bestBid) / 2;
      const leg = {
        t: o.t, qty: o.qty, fill: o.fill, fee: o.fee || 0, mid, candleT: o.candleT,
        spreadCost: half * o.qty,
        slippageCost: o.side === "BUY" ? (o.fill - o.bestAsk) * o.qty : (o.bestBid - o.fill) * o.qty,
      };
      if (o.side === "BUY") { (open[o.pair] = open[o.pair] || []).push(leg); continue; }
      let qty = o.qty;
      while (qty > 1e-12 && open[o.pair] && open[o.pair].length) {
        const b = open[o.pair][0], q = Math.min(qty, b.qty), fb = q / b.qty, fs = q / o.qty;
        const cost = b.fill * q + b.fee * fb, proceeds = leg.fill * q - leg.fee * fs;
        const pnl = proceeds - cost;
        const fee = b.fee * fb + leg.fee * fs;
        const spreadCost = b.spreadCost * fb + leg.spreadCost * fs;
        const slippageCost = b.slippageCost * fb + leg.slippageCost * fs;
        trades.push({
          pair: o.pair, entryT: b.t, exitT: o.t, qty: q, entryPrice: b.fill, exitPrice: leg.fill,
          entryCandleT: b.candleT, exitCandleT: leg.candleT,
          pnl, pnlPct: pnl / cost, fee, spreadCost, slippageCost, grossPnl: pnl + fee + spreadCost + slippageCost,
          holdHours: (ms(o.t) - ms(b.t)) / 3.6e6,
        });
        b.qty -= q; b.fee -= b.fee * fb; b.spreadCost -= b.spreadCost * fb; b.slippageCost -= b.slippageCost * fb;
        if (b.qty <= 1e-12) open[o.pair].shift();
        qty -= q;
      }
    }
    return trades;
  }

  function normBtTrades(trades) {
    return (trades || []).map((t) => {
      const fee = t.fee || 0, spreadCost = t.spreadCost || 0, slippageCost = t.slippageCost || 0;
      const pnl = t.pnl != null ? t.pnl : (t.exitPrice - t.entryPrice) * t.qty - fee - spreadCost - slippageCost;
      const base = t.entryPrice * t.qty;
      return { ...t, fee, spreadCost, slippageCost, pnl, pnlPct: t.pnlPct != null ? t.pnlPct : pnl / base, grossPnl: pnl + fee + spreadCost + slippageCost };
    });
  }

  function equityBlock(series, withCagr) {
    if (!series || series.length < 2) return null;
    const s = [...series].map((p) => ({ t: p.t, equity: p.equity })).sort((a, b) => ms(a.t) - ms(b.t));
    const first = s[0].equity, last = s[s.length - 1].equity;
    const years = (ms(s[s.length - 1].t) - ms(s[0].t)) / (365.25 * 86400e3);
    const out = { start: s[0].t, end: s[s.length - 1].t, totalReturn: last / first - 1, ...maxDrawdown(s), series: s };
    if (withCagr) out.cagr = years > 0 ? Math.pow(last / first, 1 / years) - 1 : null, out.years = years;
    return out;
  }

  function compute(data, backtest, opts) {
    const C = Object.assign({}, DEFAULTS, (backtest && backtest.meta && backtest.meta.config) || {}, opts || {});
    const tf = C.TF_SEC * 1000;
    const fStart = ms(C.FORWARD_START), fEnd = ms(C.FORWARD_END);
    const calls = [...(data.calls || [])].sort((a, b) => ms(a.t) - ms(b.t));
    const signals = data.signals || [], orders = data.orders || [], errors = data.errors || [];
    const snapshots = data.snapshots || [];
    const lastLogT = Math.max(...calls.map((c) => ms(c.t)), 0);
    const asOf = Math.min(C.AS_OF ? ms(C.AS_OF) : lastLogT, fEnd);
    const pairs = [...new Set([...signals.map((s) => s.pair), ...Object.keys((data.state && data.state.lastCandle) || {})])].sort();

    // ---------- Operasional ----------
    const runs = [];
    for (const c of calls) {
      const last = runs[runs.length - 1];
      if (last && ms(c.t) - ms(last.calls[last.calls.length - 1].t) <= C.RUN_GROUP_SEC * 1000) last.calls.push(c);
      else runs.push({ t: c.t, calls: [c] });
    }
    for (const r of runs) {
      r.ok = r.calls.some((c) => !(c.errors || []).some((e) => e.where === "tick"));
      r.processed = sum(r.calls.map((c) => (c.processed || []).length));
    }
    const inFwd = (t) => ms(t) >= fStart && ms(t) < fEnd;
    const fwdRuns = runs.filter((r) => inFwd(r.t));

    // candle forward test = candle yang ditutup dalam [FORWARD_START, FORWARD_END)
    const totalCandles = Math.round((fEnd - fStart) / tf);
    const elapsedCandles = Math.max(0, Math.min(totalCandles, Math.floor((asOf - fStart) / tf)));
    const byCandle = {};
    for (const s of signals) {
      const open = ms(s.candleT), close = open + tf;
      if (close < fStart || close >= fEnd) continue;
      const k = open, e = (byCandle[k] = byCandle[k] || { open, pairs: {}, onTimePairs: {} });
      e.pairs[s.pair] = s;
      if (ms(s.processedAt) < open + 2 * tf) e.onTimePairs[s.pair] = true;
    }
    const candleRows = Object.values(byCandle).sort((a, b) => a.open - b.open);
    const onTime = candleRows.filter((c) => pairs.every((p) => c.onTimePairs[p])).length;
    const processedAny = candleRows.length;

    const errTypes = {};
    for (const e of errors) { const k = e.type + (e.msg ? " — " + e.msg : ""); errTypes[k] = (errTypes[k] || 0) + 1; }
    const tickFails = errors.filter((e) => e.type === "tick_gagal");
    const killUses = errors.filter((e) => e.type === "kill_switch").length + sum(calls.map((c) => (c.notes || []).filter((n) => n === "KILL_SWITCH_AKTIF").length));
    const dailyLimitHits = sum(calls.map((c) => (c.notes || []).filter((n) => n === "daily_loss_limit_aktif").length));
    const idemSkips = sum(calls.map((c) => (c.skipped || []).filter((s) => s.reason === "candle_sudah_diproses").length));
    const dupKeys = {}; for (const s of signals) { const k = s.pair + "|" + s.candleT; dupKeys[k] = (dupKeys[k] || 0) + 1; }
    const duplicates = Object.values(dupKeys).filter((v) => v > 1).length;
    const unclosedUsed = signals.filter((s) => ms(s.processedAt) < ms(s.candleT) + tf).length;
    const invalidData = errors.filter((e) => e.type === "data_tidak_valid").length;

    let lastOkT = null, gaps = [];
    for (const r of runs) if (r.ok && r.processed > 0) { if (lastOkT) gaps.push({ from: lastOkT, to: r.t, hours: (ms(r.t) - ms(lastOkT)) / 3.6e6 }); lastOkT = r.t; }
    const tailGapH = lastOkT ? (asOf - ms(lastOkT)) / 3.6e6 : null;
    const delays = candleRows.map((c) => median(Object.values(c.pairs).map((s) => (ms(s.processedAt) - (c.open + tf)) / 60000)));

    // Persilangan EMA yang terjadi di antara dua candle yang diproses (candle di antaranya tidak dibaca bot)
    const unseenCross = [];
    for (const p of pairs) {
      const ss = signals.filter((s) => s.pair === p).sort((a, b) => a.candleT - b.candleT);
      for (let i = 1; i < ss.length; i++) {
        const a = Math.sign(ss[i - 1].fast - ss[i - 1].slow), b = Math.sign(ss[i].fast - ss[i].slow);
        const skipped = Math.round((ms(ss[i].candleT) - ms(ss[i - 1].candleT)) / tf) - 1;
        if (a !== b && a !== 0 && b !== 0) unseenCross.push({ pair: p, from: ss[i - 1].candleOpen, to: ss[i].candleOpen, dir: b > 0 ? "naik (fast > slow)" : "turun (fast < slow)", skippedCandles: skipped, signalAtTo: ss[i].signal });
      }
    }

    const ops = {
      unseenCross,
      asOf: new Date(asOf).toISOString(), pairs,
      totalCandles, elapsedCandles, processedCandles: processedAny, onTimeCandles: onTime,
      uptimeSoFar: elapsedCandles ? onTime / elapsedCandles : null,
      uptimeFinalIfStops: totalCandles ? onTime / totalCandles : null,
      scheduledCalls: elapsedCandles, runs: fwdRuns.length, okRuns: fwdRuns.filter((r) => r.ok).length,
      failedRuns: fwdRuns.filter((r) => !r.ok).length, rawCalls: calls.length, maxCallsPerRun: Math.max(0, ...runs.map((r) => r.calls.length)),
      errorsTotal: errors.length, errTypes, tickFails: tickFails.length,
      firstTickFail: tickFails.length ? tickFails[0].t : null, lastTickFail: tickFails.length ? tickFails[tickFails.length - 1].t : null,
      killUses, dailyLimitHits, idemSkips, duplicates, unclosedUsed, invalidData,
      lastOkRun: lastOkT, maxGapH: Math.max(0, ...gaps.map((g) => g.hours), tailGapH || 0), tailGapH,
      medianDelayMin: median(delays.filter((x) => x != null)),
      medianDurationMs: median(calls.map((c) => c.durationMs).filter((x) => x != null)),
      maxDurationMs: Math.max(0, ...calls.map((c) => c.durationMs || 0)),
      runsTable: fwdRuns.map((r) => ({ t: r.t, calls: r.calls.length, ok: r.ok, processed: r.processed,
        err: [...new Set(r.calls.flatMap((c) => (c.errors || []).map((e) => e.msg)))].join("; "),
        notes: [...new Set(r.calls.flatMap((c) => c.notes || []))].join("; ") })),
    };

    // ---------- Forward test ----------
    const eqSeries = [{ t: C.FORWARD_START, equity: (data.state && data.state.startEquity) || C.INITIAL_CAPITAL }]
      .concat(calls.filter((c) => c.equity != null && inFwd(c.t)).map((c) => ({ t: c.t, equity: c.equity })));
    const fTrades = tradesFromOrders(orders.filter((o) => inFwd(o.t)));
    const openPos = Object.entries((data.state && data.state.positions) || {}).map(([pair, p]) => ({
      pair, qty: p.qty, avg: p.avg, entryTime: p.entryTime, lastBid: p.lastBid, unrealized: p.lastBid ? (p.lastBid - p.avg) * p.qty : null,
    }));
    const fwd = {
      equity: equityBlock(eqSeries, false), trades: fTrades, stats: tradeStats(fTrades), openPositions: openPos,
      orders: orders.map((o) => {
        const mid = (o.bestBid + o.bestAsk) / 2, close = o.signalPrice;
        return { ...o, total: o.fill / close - 1, delay: mid / close - 1, halfSpread: (o.bestAsk - o.bestBid) / 2 / mid,
          slip: o.side === "BUY" ? o.fill / o.bestAsk - 1 : 1 - o.fill / o.bestBid };
      }),
      dailyEquity: data.equity || [], cash: data.state ? data.state.cash : null,
    };

    // benchmark buy & hold BTC/IDR pada periode forward yang punya data (beli di ask, nilai di bid)
    const bSnap = snapshots.filter((s) => s.pair === C.BENCHMARK_PAIR && inFwd(s.t) && s.bid && s.ask).sort((a, b) => ms(a.t) - ms(b.t));
    const bSig = signals.filter((s) => s.pair === C.BENCHMARK_PAIR && inFwd(s.processedAt)).sort((a, b) => a.candleT - b.candleT);
    fwd.benchmark = bSnap.length >= 2 ? {
      from: bSnap[0].t, to: bSnap[bSnap.length - 1].t, buyAsk: bSnap[0].ask, sellBid: bSnap[bSnap.length - 1].bid,
      ret: bSnap[bSnap.length - 1].bid / bSnap[0].ask - 1,
      closeRet: bSig.length >= 2 ? bSig[bSig.length - 1].close / bSig[0].close - 1 : null,
      series: bSnap.map((s) => ({ t: s.t, equity: C.INITIAL_CAPITAL * s.bid / bSnap[0].ask })),
    } : null;

    // ---------- Spread dari snapshot ----------
    const spread = pairs.map((p) => {
      const all = snapshots.filter((s) => s.pair === p && s.spread != null).map((s) => s.spread);
      const pre = snapshots.filter((s) => s.pair === p && s.spread != null && ms(s.t) < fStart).map((s) => s.spread);
      const fw = snapshots.filter((s) => s.pair === p && s.spread != null && inFwd(s.t)).map((s) => s.spread);
      const assumed = backtest && backtest.meta && backtest.meta.spreadAssumption ? backtest.meta.spreadAssumption[p] : null;
      const slipAssumed = backtest && backtest.meta && backtest.meta.slippageAssumption ? backtest.meta.slippageAssumption[p] : null;
      return { pair: p, n: all.length, nPreFreeze: pre.length, nForward: fw.length, median: median(all), mean: all.length ? sum(all) / all.length : null,
        p90: quantile(all, 0.9), max: all.length ? Math.max(...all) : null, medianForward: median(fw), assumed, slipAssumed,
        over2pct: all.filter((x) => x > 0.02).length };
    });

    // ---------- Backtest & gap ----------
    let bt = null, gap = null;
    if (backtest && backtest.full) {
      const ft = normBtTrades(backtest.full.trades);
      let bench = null;
      const bb = backtest.full.benchmark || [];
      if (bb.length >= 2) {
        const s = [...bb].sort((a, b) => ms(a.t) - ms(b.t));
        bench = equityBlock(s.map((x) => ({ t: x.t, equity: C.INITIAL_CAPITAL * x.close / s[0].close })), true);
      }
      bt = { equity: equityBlock(backtest.full.equity, true), trades: ft, stats: tradeStats(ft), benchmark: bench, meta: backtest.meta || {} };
    }
    if (backtest && backtest.window) {
      const w = backtest.window, wt = normBtTrades(w.trades);
      const btSig = {}; for (const s of w.signals || []) btSig[s.pair + "|" + Number(s.candleT)] = s.signal;
      const fwSig = {}; for (const s of signals) { const close = ms(s.candleT) + tf; if (close >= fStart && close < fEnd) fwSig[s.pair + "|" + Number(s.candleT)] = s.signal; }
      const keys = [...new Set([...Object.keys(btSig), ...Object.keys(fwSig)])].sort();
      const rows = keys.map((k) => { const [pair, t] = k.split("|"); return { pair, candleT: Number(t), bt: btSig[k] ?? null, fw: fwSig[k] ?? null }; });
      const both = rows.filter((r) => r.bt != null && r.fw != null);
      const match = both.filter((r) => r.bt === r.fw).length;
      const fillDiff = fTrades.map((t) => {
        const b = wt.find((x) => x.pair === t.pair && x.entryCandleT != null && Number(x.entryCandleT) === Number(t.entryCandleT));
        return b ? { pair: t.pair, entryCandleT: t.entryCandleT, btEntry: b.entryPrice, fwEntry: t.entryPrice, entryDiff: t.entryPrice / b.entryPrice - 1,
          btExit: b.exitPrice, fwExit: t.exitPrice, exitDiff: t.exitPrice / b.exitPrice - 1, btPnlPct: b.pnlPct, fwPnlPct: t.pnlPct } : null;
      }).filter(Boolean);
      gap = {
        btWindow: equityBlock(w.equity, false), btWindowStats: tradeStats(wt), btWindowTrades: wt,
        candlesCompared: both.length, matches: match, matchRate: both.length ? match / both.length : null,
        onlyBacktest: rows.filter((r) => r.bt != null && r.fw == null).length, onlyForward: rows.filter((r) => r.fw != null && r.bt == null).length,
        mismatches: both.filter((r) => r.bt !== r.fw), rows, fillDiff,
      };
      if (gap.btWindow && fwd.equity) gap.returnGap = fwd.equity.totalReturn - gap.btWindow.totalReturn;
    }

    return { config: C, generatedFrom: { calls: calls.length, signals: signals.length, orders: orders.length, errors: errors.length, snapshots: snapshots.length, equityDays: (data.equity || []).length },
      ops, fwd, bt, gap, spread, signals };
  }

  const api = { compute, DEFAULTS, maxDrawdown, tradesFromOrders, tradeStats, median };
  root.UASMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
