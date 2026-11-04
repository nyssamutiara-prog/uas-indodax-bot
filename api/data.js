// Data log untuk dashboard & skrip hitung_ulang (publik, hanya-baca).
import { readList, getJSON } from "../lib/store.js";

export default async function handler(req, res) {
  try {
    const [calls, orders, signals, equity, errors, snapshots, state] = await Promise.all([
      readList("log:calls"), readList("log:orders"), readList("log:signals"),
      readList("log:equity"), readList("log:errors"), readList("log:snapshots"), getJSON("state"),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ calls, orders, signals, equity, errors, snapshots, state });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
