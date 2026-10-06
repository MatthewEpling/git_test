import { describe, expect, it } from 'vitest';
import { identifyDisc, parseGdi, parseIpBin, regionLabel } from '../../src/content/disc';
import { md5 } from '../../src/content/md5';

/** Builds a tiny GD-ROM: track 3 (raw 2352-byte mode-1 sectors) holds IP.BIN and an ISO9660 root with 1ST_READ.BIN. */
function buildImage() {
  const SECTORS = 40;
  const user = new Uint8Array(SECTORS * 2048);
  const ip = user.subarray(0, 256);
  const put = (buf: Uint8Array, at: number, s: string) => buf.set(new TextEncoder().encode(s), at);
  put(ip, 0, 'SEGA SEGAKATANA ');
  put(ip, 0x10, 'SEGA ENTERPRISES');
  put(ip, 0x30, 'JUE     ');
  put(ip, 0x40, 'MK-51000  ');
  put(ip, 0x4a, 'V1.005');
  put(ip, 0x60, '1ST_READ.BIN    ');
  ip.fill(0x20, 0x80, 0x100);
  put(ip, 0x80, 'TEST GAME');
  const base = 45000;
  // PVD at sector 16, root directory at sector 20, boot file at sectors 22..24 (5000 bytes)
  const pvd = user.subarray(16 * 2048, 17 * 2048);
  pvd[0] = 1;
  put(pvd, 1, 'CD001');
  const dv = new DataView(pvd.buffer, pvd.byteOffset);
  dv.setUint32(156 + 2, base + 20, true);
  dv.setUint32(156 + 10, 2048, true);
  const dir = user.subarray(20 * 2048, 21 * 2048);
  const name = '1ST_READ.BIN;1';
  const len = 33 + name.length + (name.length % 2 === 0 ? 1 : 0);
  dir[0] = len;
  const ddv = new DataView(dir.buffer, dir.byteOffset);
  ddv.setUint32(2, base + 22, true);
  ddv.setUint32(10, 5000, true);
  dir[32] = name.length;
  put(dir, 33, name);
  const boot = user.subarray(22 * 2048, 22 * 2048 + 5000);
  boot.forEach((_, i) => (boot[i] = (i * 31) & 0xff));
  // Wrap in raw mode-1 sectors.
  const raw = new Uint8Array(SECTORS * 2352);
  for (let s = 0; s < SECTORS; s++) {
    raw.set([0, ...Array(10).fill(0xff), 0], s * 2352);
    raw[s * 2352 + 15] = 1;
    raw.set(user.subarray(s * 2048, (s + 1) * 2048), s * 2352 + 16);
  }
  const expected = md5(new Uint8Array([...ip, ...boot]));
  return { raw, expected };
}

describe('disc reader', () => {
  it('reads IP.BIN and computes the RetroAchievements hash from a GDI', async () => {
    const { raw, expected } = buildImage();
    const sheet = new File(['3\r\n1 0 4 2352 track01.bin 0\r\n2 600 0 2352 track02.raw 0\r\n3 45000 4 2352 track03.bin 0\r\n'], 'game.gdi');
    const files = [new File([new Uint8Array(2352 * 300)], 'track01.bin'), new File([new Uint8Array(2352 * 10)], 'track02.raw'), new File([raw], 'track03.bin')];
    const disc = await parseGdi(sheet, files);
    expect(disc.gameTrack()?.startLba).toBe(45000);
    const id = await identifyDisc(disc);
    expect(id?.header).toMatchObject({ title: 'TEST GAME', productNumber: 'MK-51000', bootFile: '1ST_READ.BIN', areas: 'JUE' });
    expect(id?.raHash).toBe(expected);
  });

  it('rejects non-Dreamcast headers and labels regions', () => {
    expect(parseIpBin(new Uint8Array(256))).toBeNull();
    expect(regionLabel('JUE')).toBe('World');
    expect(regionLabel('U')).toBe('USA');
  });
});
