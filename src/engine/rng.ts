// Seeded random numbers. The generator state lives inside the game state, so the same
// seed plus the same player choices always produce the same game (replay, undo, bug reports).
//
// sfc32 (Chris Doty-Humphrey's Small Fast Counter), public domain.

export type RngState = [number, number, number, number];

/** Hash a seed string into four 32-bit words (cyrb128, public domain). */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** Advances `s` in place and returns a float in [0, 1). */
export function nextFloat(s: RngState): number {
  let [a, b, c, d] = s;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  const r = (t + d) | 0;
  c = (c + r) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return (r >>> 0) / 4294967296;
}

/** Integer in [1, sides]. */
export function roll(s: RngState, sides: number): number {
  return 1 + Math.floor(nextFloat(s) * sides);
}

/** Fisher–Yates shuffle, in place. */
export function shuffle<T>(s: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(s) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function randomSeed(): string {
  const words = ['ember', 'lantern', 'stone', 'ash', 'hollow', 'grim', 'pale', 'dust', 'bone', 'gloam', 'cinder', 'mire'];
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${words[a[0] % words.length]}-${words[a[1] % words.length]}-${(a[0] ^ a[1]) % 10000}`;
}
