/** atempo only supports 0.5-2.0 -> speeds outside that range are decomposed into a chain */
export function atempoChain(speed: number): string[] {
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s *= 2;
  }
  parts.push(Number(s.toFixed(6)));
  return parts.map((p) => `atempo=${p}`);
}
