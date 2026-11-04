// Penyimpanan state & log di Upstash Redis (REST). Tanpa dependensi.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function cmd(args) {
  if (!URL_ || !TOKEN) throw new Error("Redis belum dikonfigurasi (env UPSTASH_REDIS_REST_URL/TOKEN)");
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function getJSON(key) {
  const v = await cmd(["GET", key]);
  return v ? JSON.parse(v) : null;
}
export const setJSON = (key, val) => cmd(["SET", key, JSON.stringify(val)]);
export const push = (list, obj) => cmd(["RPUSH", list, JSON.stringify(obj)]);
export async function readList(list) {
  const arr = await cmd(["LRANGE", list, 0, -1]);
  return (arr || []).map((x) => JSON.parse(x));
}
export async function getRaw(key) { return cmd(["GET", key]); }
export async function acquireLock(key, sec = 120) { return (await cmd(["SET", key, "1", "NX", "EX", sec])) === "OK"; }
export const releaseLock = (key) => cmd(["DEL", key]);
