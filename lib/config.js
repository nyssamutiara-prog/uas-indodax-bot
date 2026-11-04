// ===== ATURAN YANG DIBEKUKAN (freeze) =====
// Setelah commit freeze, file ini TIDAK BOLEH diubah sampai pengumpulan.
export const CONFIG = {
  STRATEGY_VERSION: "ema-cross-1h-v1",
  PAIRS: ["btcidr", "ethidr", "bnbidr"],   // universe (BNB/IDR; di soal tertulis BNP)
  TF: 60,                                  // timeframe 1 jam (menit, sesuai history_v2)
  TF_SEC: 3600,
  EMA_FAST: 9,
  EMA_SLOW: 21,
  WARMUP_BARS: 500,                        // jumlah bar tertutup yang dipakai fungsi sinyal (sama di bot & backtest)

  INITIAL_CAPITAL: 100_000_000,
  POS_FRAC: 0.10,                          // maks 10% ekuitas per transaksi
  MAX_POSITIONS: 3,
  DAILY_LOSS_LIMIT: 0.03,                  // stop buka posisi baru bila ekuitas turun >3% dari awal hari WIB
  MIN_ORDER_IDR: 25_000,                   // pakai yang lebih ketat (Pro mode); cek ulang sebelum freeze
  MAX_SPREAD: 0.02,                        // data tidak valid bila spread bid-ask > 2%

  // Fee taker all-in (pecahan, mis. 0.0051 = 0,51%). WAJIB diisi: jalankan `npm run check-fees`,
  // bandingkan /api/pairs dengan halaman help.indodax.com, pakai yang LEBIH MAHAL.
  FEE_TAKER: 0.0051,

  // Asumsi untuk BACKTEST (ganti dengan median hasil snapshot bila sudah terkumpul)
  BT_SPREAD: 0.002,                        // spread penuh (pecahan)
  BT_SLIPPAGE: 0.0005,                     // slippage per order (pecahan)

  // Jendela forward test: 4 Nov 2026 12.00 WIB = 05.00 UTC; 10 hari penuh
  FORWARD_START: "2026-11-04T05:00:00Z",
  FORWARD_END: "2026-11-14T05:00:00Z",
};

export function requireFee() {
  if (typeof CONFIG.FEE_TAKER !== "number" || !(CONFIG.FEE_TAKER > 0)) {
    throw new Error("CONFIG.FEE_TAKER belum diisi. Jalankan: npm run check-fees");
  }
  return CONFIG.FEE_TAKER;
}
