// tarik_data_curl.mjs - skrip BANTUAN (bukan bagian strategi/bot).
// Sama dengan scripts/fetch_history.js, tetapi memanggil API lewat curl karena
// fetch bawaan Node mendapat HTTP 403 dari Indodax, sedangkan curl dan browser 200.
// Hanya menulis data/*_60.csv (format sama). TIDAK menyentuh universe_liquidity.json.
// Pakai: node scripts/tarik_data_curl.mjs [tahun=3.2]
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "https://indodax.com";
const PAIRS = ["btcidr", "ethidr", "bnbidr"];
const TF = 60, TF_SEC = 3600;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const CURL = process.platform === "win32" ? "curl.exe" : "curl";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(path) {
  let err;
  for (let a = 0; a < 3; a++) {
    try {
      const out = execFileSync(CURL, ["-s", "-S", "--fail", "-m", "30", "-A", UA, BASE + path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const j = JSON.parse(out);
      if (j === null || (Array.isArray(j) && j.length === 0)) throw new Error("respons kosong " + path);
      return j;
    } catch (e) { err = e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500 * (a + 1)); }
  }
  throw new Error(`gagal ${path}: ${err.message.split("\n")[0]}`);
}

const years = Number(process.argv[2] || 3.2);
let nowSec = Number(get("/api/server_time").server_time);
if (nowSec > 1e12) nowSec = Math.floor(nowSec / 1000);
const startSec = nowSec - Math.floor(years * 365.25 * 86400);
fs.mkdirSync("data", { recursive: true });

const toCandle = (r) => {
  const g = (k) => r[k] ?? r[k.toLowerCase()];
  return { t: Number(g("Time")), o: Number(g("Open")), h: Number(g("High")), l: Number(g("Low")), c: Number(g("Close")), v: Number(g("Volume")) };
};

for (const pair of PAIRS) {
  const map = new Map();
  let to = nowSec, guard = 0;
  while (guard++ < 400) {
    const rows = get(`/tradingview/history_v2?symbol=${pair.toUpperCase()}&tf=${TF}&from=${startSec}&to=${to}`)
      .map(toCandle).filter((c) => c.t > 0).sort((a, b) => a.t - b.t);
    await sleep(400);
    if (!rows.length) break;
    const before = map.size;
    for (const r of rows) map.set(r.t, r);
    const earliest = rows[0].t;
    process.stdout.write(`\r${pair} ${map.size} bar, sampai ${new Date(earliest * 1000).toISOString().slice(0, 10)}   `);
    if (earliest <= startSec || map.size === before) break;
    to = earliest - 1;
  }
  const all = [...map.values()].filter((c) => c.t + TF_SEC <= nowSec).sort((a, b) => a.t - b.t);
  fs.writeFileSync(`data/${pair.toUpperCase()}_${TF}.csv`, "t,o,h,l,c,v\n" + all.map((c) => [c.t, c.o, c.h, c.l, c.c, c.v].join(",")).join("\n"));
  console.log(`\n${pair}: ${all.length} bar, ${new Date(all[0].t * 1000).toISOString()} -> ${new Date(all.at(-1).t * 1000).toISOString()}`);
}
console.log("\nSelesai. Bar terakhir harus 2026-11-14T04:00:00.000Z atau lebih baru.");
