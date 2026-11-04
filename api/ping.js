// Uji koneksi Indodax dari Vercel (publik, tanpa rahasia).
import { serverTimeSec, depth } from "../lib/indodax.js";
import { normalizeBook } from "../lib/execution.js";

export default async function handler(req, res) {
  try {
    const st = await serverTimeSec();
    const book = normalizeBook(await depth("btcidr"));
    res.status(200).json({ ok: true, server_time: st, btc_best_bid: book.bids[0]?.[0], btc_best_ask: book.asks[0]?.[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
