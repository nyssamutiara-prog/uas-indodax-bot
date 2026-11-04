// Tarik data historis ASLI Indodax mundur (di laptop, bukan di Vercel). Maks 3 request/detik, tidak paralel.
// Pakai: node scripts/fetch_history.js [tahun=3.2]
import fs from "node:fs";
import { CONFIG } from "../lib/config.js";
import { candles, serverTimeSec } from "../lib/indodax.js";

const years = Number(process.argv[2] || 3.2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync("data", { recursive: true });

const nowSec = await serverTimeSec();
const startSec = nowSec - Math.floor(years * 365.25 * 86400);
const liquidity = {};

for (const pair of CONFIG.PAIRS) {
  const map = new Map();
  let to = nowSec, guard = 0;
  while (guard++ < 400) {
    const rows = await candles(pair, CONFIG.TF, startSec, to);
    await sleep(400);
    if (!rows.length) break;
    const before = map.size;
    for (const r of rows) map.set(r.t, r);
    const earliest = rows[0].t;
    process.stdout.write(`\r${pair} ${map.size} bar, sampai ${new Date(earliest * 1000).toISOString().slice(0, 10)}   `);
    if (earliest <= startSec || map.size === before) break;   // sudah sampai awal / tidak ada data baru
    to = earliest - 1;
  }
  // buang candle yang belum tertutup
  const all = [...map.values()].filter((c) => c.t + CONFIG.TF_SEC <= nowSec).sort((a, b) => a.t - b.t);
  fs.writeFileSync(`data/${pair.toUpperCase()}_${CONFIG.TF}.csv`, "t,o,h,l,c,v\n" + all.map((c) => [c.t, c.o, c.h, c.l, c.c, c.v].join(",")).join("\n"));
  // likuiditas di AWAL periode: median volume IDR harian 90 hari pertama
  const first = all.slice(0, 24 * 90), byDay = new Map();
  for (const c of first) byDay.set(Math.floor(c.t / 86400), (byDay.get(Math.floor(c.t / 86400)) || 0) + c.v * c.c);
  const vols = [...byDay.values()].sort((a, b) => a - b);
  liquidity[pair] = { first_bar: new Date(all[0].t * 1000).toISOString(), bars: all.length, median_daily_volume_idr_first90d: vols[Math.floor(vols.length / 2)] ?? null };
  console.log(`\n${pair}: ${all.length} bar, ${liquidity[pair].first_bar} -> ${new Date(all.at(-1).t * 1000).toISOString()}`);
}
fs.writeFileSync("data/universe_liquidity.json", JSON.stringify(liquidity, null, 2));
console.log("\nSelesai. Cek data/universe_liquidity.json untuk kriteria likuiditas di awal periode (anti survivorship bias).");
