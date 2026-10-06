// Reads Dreamcast disc images (GDI and CUE/BIN) at the sector level: enough to pull the
// IP.BIN header (title, product code, region) and the boot executable for the
// RetroAchievements hash. CHD and CDI are not parsed here (the core still plays them).

import { Md5 } from './md5';
import { baseName, extOf } from './files';

export interface Track {
  number: number;
  /** Absolute LBA of the track's first sector. */
  startLba: number;
  sectors: number;
  isData: boolean;
  sectorSize: number;
  file: Blob;
  /** Byte offset of the track's first sector inside the file. */
  fileOffset: number;
}

/** First LBA of the GD-ROM high-density area, where Dreamcast games live. */
export const HIGH_DENSITY_LBA = 45000;

export class Disc {
  constructor(readonly tracks: Track[]) {}

  trackAt(lba: number): Track | undefined {
    return this.tracks.find((t) => lba >= t.startLba && lba < t.startLba + t.sectors);
  }

  /** Reads one 2048-byte user-data sector at an absolute LBA. */
  async readSector(lba: number): Promise<Uint8Array> {
    const t = this.trackAt(lba);
    if (!t) throw new Error(`No track contains sector ${lba}`);
    const at = t.fileOffset + (lba - t.startLba) * t.sectorSize;
    const raw = new Uint8Array(await t.file.slice(at, at + t.sectorSize).arrayBuffer());
    return userData(raw, t.sectorSize);
  }

  async read(lba: number, bytes: number, sink: (chunk: Uint8Array) => void) {
    let left = bytes;
    for (let s = lba; left > 0; s++) {
      const data = await this.readSector(s);
      sink(left >= 2048 ? data : data.subarray(0, left));
      left -= 2048;
    }
  }

  /** The data track holding the game: first data track in the high-density area. */
  gameTrack(): Track | undefined {
    return this.tracks.find((t) => t.isData && t.startLba >= HIGH_DENSITY_LBA) ?? this.tracks.find((t) => t.isData);
  }
}

function userData(raw: Uint8Array, size: number): Uint8Array {
  if (size === 2048) return raw;
  if (size === 2336) return raw.subarray(8, 8 + 2048);
  // 2352-byte raw sectors: mode 1 data starts at 16, mode 2 form 1 at 24.
  const mode = raw[15];
  return raw.subarray(mode === 2 ? 24 : 16, (mode === 2 ? 24 : 16) + 2048);
}

const lookup = (files: File[], name: string) => {
  const n = baseName(name).toLowerCase();
  return files.find((f) => f.name.toLowerCase() === n);
};

export async function parseGdi(sheet: File, files: File[]): Promise<Disc> {
  const lines = (await sheet.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tracks: Track[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(?:"([^"]+)"|(\S+))\s+(\d+)/);
    if (!m) continue;
    const file = lookup(files, m[5] ?? m[6]);
    if (!file) throw new Error(`Missing track file ${m[5] ?? m[6]}`);
    const sectorSize = Number(m[4]);
    tracks.push({
      number: Number(m[1]),
      startLba: Number(m[2]),
      isData: m[3] === '4',
      sectorSize,
      file,
      fileOffset: Number(m[7]) * sectorSize,
      sectors: Math.floor(file.size / sectorSize),
    });
  }
  return new Disc(tracks);
}

const msf = (s: string) => {
  const [m, sec, f] = s.split(':').map(Number);
  return (m * 60 + sec) * 75 + f;
};

/** CUE sheets, including Redump-style Dreamcast cues with a HIGH-DENSITY AREA marker. */
export async function parseCue(sheet: File, files: File[]): Promise<Disc> {
  const tracks: Track[] = [];
  let file: File | undefined;
  let fileBaseLba = 0;
  let nextAreaBase: number | null = null;
  let cur: { number: number; isData: boolean; sectorSize: number } | null = null;
  const pending: { number: number; isData: boolean; sectorSize: number; file: File; index1: number; fileBaseLba: number }[] = [];

  for (const raw of (await sheet.text()).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^REM\s+HIGH-DENSITY AREA/i.test(line)) nextAreaBase = HIGH_DENSITY_LBA;
    let m = line.match(/^FILE\s+(?:"([^"]+)"|(\S+))/i);
    if (m) {
      if (file) fileBaseLba += Math.floor(file.size / (pending.at(-1)?.sectorSize ?? 2352));
      if (nextAreaBase !== null) {
        fileBaseLba = nextAreaBase;
        nextAreaBase = null;
      }
      file = lookup(files, m[1] ?? m[2]);
      if (!file) throw new Error(`Missing data file ${m[1] ?? m[2]}`);
      continue;
    }
    m = line.match(/^TRACK\s+(\d+)\s+(\S+)/i);
    if (m) {
      const mode = m[2].toUpperCase();
      cur = { number: Number(m[1]), isData: mode !== 'AUDIO', sectorSize: mode.endsWith('2048') ? 2048 : mode.endsWith('2336') ? 2336 : 2352 };
      continue;
    }
    m = line.match(/^INDEX\s+01\s+(\d+:\d+:\d+)/i);
    if (m && cur && file) pending.push({ ...cur, file, index1: msf(m[1]), fileBaseLba });
  }
  for (const p of pending) {
    const sameFile = pending.filter((q) => q.file === p.file);
    const next = sameFile[sameFile.indexOf(p) + 1];
    const totalSectors = Math.floor(p.file.size / p.sectorSize);
    tracks.push({
      number: p.number,
      startLba: p.fileBaseLba + p.index1,
      isData: p.isData,
      sectorSize: p.sectorSize,
      file: p.file,
      fileOffset: p.index1 * p.sectorSize,
      sectors: (next ? next.index1 : totalSectors) - p.index1,
    });
  }
  return new Disc(tracks);
}

export async function openDisc(main: File, files: File[]): Promise<Disc | null> {
  const ext = extOf(main.name);
  if (ext === 'gdi') return parseGdi(main, files);
  if (ext === 'cue') return parseCue(main, files);
  return null;
}

// ───────────────────────── IP.BIN ─────────────────────────

export interface DiscHeader {
  hardware: string;
  maker: string;
  areas: string;
  productNumber: string;
  version: string;
  releaseDate: string;
  bootFile: string;
  company: string;
  title: string;
}

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, start + len))
    .replace(/\0/g, ' ')
    .trim();

/** Parses the 256-byte meta block at the start of IP.BIN. */
export function parseIpBin(meta: Uint8Array): DiscHeader | null {
  if (ascii(meta, 0, 16) !== 'SEGA SEGAKATANA') return null;
  return {
    hardware: ascii(meta, 0x00, 16),
    maker: ascii(meta, 0x10, 16),
    areas: ascii(meta, 0x30, 8),
    productNumber: ascii(meta, 0x40, 10),
    version: ascii(meta, 0x4a, 6),
    releaseDate: ascii(meta, 0x50, 16),
    bootFile: ascii(meta, 0x60, 16),
    company: ascii(meta, 0x70, 16),
    title: ascii(meta, 0x80, 128),
  };
}

export function regionLabel(areas: string): string {
  const r = [areas.includes('J') && 'Japan', areas.includes('U') && 'USA', areas.includes('E') && 'Europe'].filter(Boolean);
  return r.length === 3 ? 'World' : r.join(' / ');
}

/** ISO9660 lookup of a file in the root directory of the game track. */
async function findFile(disc: Disc, track: Track, name: string): Promise<{ lba: number; size: number } | null> {
  const pvd = await disc.readSector(track.startLba + 16);
  if (String.fromCharCode(...pvd.subarray(1, 6)) !== 'CD001') return null;
  const dv = new DataView(pvd.buffer, pvd.byteOffset, pvd.byteLength);
  const rootLba = dv.getUint32(156 + 2, true);
  const rootSize = dv.getUint32(156 + 10, true);
  // GD-ROM file systems use absolute LBAs; tolerate images that use track-relative ones.
  const base = disc.trackAt(rootLba) ? 0 : track.startLba;
  const want = name.toUpperCase();
  for (let s = 0; s < Math.ceil(rootSize / 2048); s++) {
    const sec = await disc.readSector(base + rootLba + s);
    for (let o = 0; o < 2048; ) {
      const len = sec[o];
      if (!len) break;
      const nameLen = sec[o + 32];
      const entry = String.fromCharCode(...sec.subarray(o + 33, o + 33 + nameLen)).split(';')[0].toUpperCase();
      if (entry === want) {
        const ev = new DataView(sec.buffer, sec.byteOffset + o, len);
        return { lba: base + ev.getUint32(2, true), size: ev.getUint32(10, true) };
      }
      o += len;
    }
  }
  return null;
}

export interface DiscIdentity {
  header: DiscHeader;
  /** RetroAchievements hash: MD5 of the IP.BIN meta block followed by the boot executable. */
  raHash: string | null;
}

export async function identifyDisc(disc: Disc): Promise<DiscIdentity | null> {
  const track = disc.gameTrack();
  if (!track) return null;
  const first = await disc.readSector(track.startLba);
  const meta = first.subarray(0, 256);
  const header = parseIpBin(meta);
  if (!header) return null;
  let raHash: string | null = null;
  const boot = header.bootFile.split(/\s/)[0];
  if (boot) {
    const file = await findFile(disc, track, boot).catch(() => null);
    if (file) {
      const md5 = new Md5().update(meta);
      await disc.read(file.lba, file.size, (chunk) => md5.update(chunk));
      raHash = md5.hex();
    }
  }
  return { header, raHash };
}
