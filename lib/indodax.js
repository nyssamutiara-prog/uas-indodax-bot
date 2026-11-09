// Klien API publik Indodax (tanpa API key). Timeout + retry terbatas.
const BASE = "https://indodax.com";

async function getJSON(path, { retries = 2, timeoutMs = 10000 } = {}) {
  let lastErr;
  for (let a = 0; a <= retries; a++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(BASE + path, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; uas-bot/1.0)", "Accept": "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
      const j = await r.json();
      if (j === null || j === undefined || (Array.isArray(j) && j.length === 0)) throw new Error(`respons kosong ${path}`);
      return j;
    } catch (e) {
      lastErr = e;
      if (a < retries) await new Promise((res) => setTimeout(res, 500 * (a + 1)));
    } finally { clearTimeout(to); }
  }
  throw lastErr;
}

export async function serverTimeSec() {
  const j = await getJSON("/api/server_time");
  let t = Number(j.server_time ?? j.serverTime ?? j);
  if (t > 1e12) t = Math.floor(t / 1000);
  return t;
}

export const depth = (pair) => getJSON(`/api/depth/${pair}`);
export const pairs = () => getJSON("/api/pairs");

const toCandle = (r) => {
  const g = (k) => r[k] ?? r[k.toLowerCase()];
  return { t: Number(g("Time")), o: Number(g("Open")), h: Number(g("High")), l: Number(g("Low")), c: Number(g("Close")), v: Number(g("Volume")) };
};

// Kembalikan semua bar (mungkin termasuk yang masih berjalan), urut lama -> baru.
export async function candles(pair, tf, fromSec, toSec) {
  const sym = pair.toUpperCase();
  const tfq = tf === 1440 ? "1D" : String(tf);
  const j = await getJSON(`/tradingview/history_v2?symbol=${sym}&tf=${tfq}&from=${fromSec}&to=${toSec}`);
  return j.map(toCandle).filter((c) => c.t > 0).sort((a, b) => a.t - b.t);
}

// Buang candle yang masih berjalan: Time + durasi > server_time.
export function onlyClosed(cs, tfSec, nowSec) {
  return cs.filter((c) => c.t + tfSec <= nowSec);
}
