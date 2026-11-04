// EMA standar: alpha = 2/(n+1), dimulai dari nilai pertama.
export function ema(values, n) {
  const a = 2 / (n + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = a * values[i] + (1 - a) * out[i - 1];
  return out;
}
