// Incremental MD5 (RFC 1321). Used for BIOS verification and RetroAchievements hashes,
// which need MD5 specifically (Web Crypto doesn't offer it).

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = new Int32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);

export class Md5 {
  private h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0;
  private w = new Int32Array(16);

  update(data: Uint8Array): this {
    let i = 0;
    this.total += data.length;
    if (this.bufLen) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      i = take;
      if (this.bufLen === 64) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0);
      this.bufLen = data.length - i;
    }
    return this;
  }

  private block(d: Uint8Array, o: number) {
    const w = this.w;
    for (let j = 0; j < 16; j++) w[j] = d[o + j * 4] | (d[o + j * 4 + 1] << 8) | (d[o + j * 4 + 2] << 16) | (d[o + j * 4 + 3] << 24);
    let [a, b, c, dd] = this.h;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) {
        f = (b & c) | (~b & dd);
        g = j;
      } else if (j < 32) {
        f = (dd & b) | (~dd & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ dd;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~dd);
        g = (7 * j) % 16;
      }
      const t = dd;
      dd = c;
      c = b;
      const x = (a + f + K[j] + w[g]) | 0;
      b = (b + ((x << S[j]) | (x >>> (32 - S[j])))) | 0;
      a = t;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + dd) | 0;
  }

  hex(): string {
    const bits = this.total * 8;
    const pad = new Uint8Array(((this.bufLen < 56 ? 56 : 120) - this.bufLen) + 8);
    pad[0] = 0x80;
    const view = new DataView(pad.buffer);
    view.setUint32(pad.length - 8, bits >>> 0, true);
    view.setUint32(pad.length - 4, Math.floor(bits / 2 ** 32), true);
    this.update(pad);
    let out = '';
    for (const v of this.h) for (let i = 0; i < 4; i++) out += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return out;
  }
}

export function md5(data: Uint8Array | string): string {
  return new Md5().update(typeof data === 'string' ? new TextEncoder().encode(data) : data).hex();
}
