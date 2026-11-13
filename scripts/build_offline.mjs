// build_offline.mjs — membuat dashboard HTML offline mandiri (bisa dibuka tanpa internet).
// Isinya: index.html + metrics.js di-inline + log mentah tertanam apa adanya.
// Angka TIDAK ditulis ke HTML; tetap dihitung oleh metrics.js saat file dibuka.
//
// Pemakaian (jalankan setelah forward test selesai, 14 Nov 12.00 WIB):
//   node scripts/build_offline.mjs https://uas-indodax-bot-amber.vercel.app/api/data
//   node scripts/build_offline.mjs data.json
// Hasil: dashboard_offline.html dan data.json (log mentah untuk dikumpulkan).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const src = process.argv[2] || "data.json";

const data = /^https?:/.test(src) ? await (await fetch(src)).json() : JSON.parse(fs.readFileSync(src, "utf8"));
if (/^https?:/.test(src)) fs.writeFileSync("data.json", JSON.stringify(data));
const btFile = path.join(pub, "backtest.json");
const bt = fs.existsSync(btFile) ? fs.readFileSync(btFile, "utf8") : null;

const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
let html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const metrics = fs.readFileSync(path.join(pub, "metrics.js"), "utf8");
const embed =
  `<script id="raw-log" type="application/json">${safe(JSON.stringify(data))}</script>\n` +
  (bt ? `<script id="raw-backtest" type="application/json">${safe(bt)}</script>\n` : "") +
  `<script>\n${metrics}\n</script>`;
html = html.replace('<script src="metrics.js"></script>', () => embed);

fs.writeFileSync("dashboard_offline.html", html);
console.log(`dashboard_offline.html dibuat (${(html.length / 1024).toFixed(0)} KB, ${data.calls.length} panggilan, backtest: ${bt ? "ya" : "tidak"})`);
