// The user's own Dreamcast BIOS files, kept in IndexedDB so they only upload them once.

import { db } from './db';
import { md5 } from '../content/md5';

export type BiosKind = 'boot' | 'flash';

export interface BiosInfo {
  kind: BiosKind;
  fileName: string;
  size: number;
  md5: string;
  /** Matches a known-good dump. Unrecognised dumps are still allowed. */
  recognized: boolean;
  addedAt: number;
}

interface StoredBios extends BiosInfo {
  data: Uint8Array;
}

export const BIOS_SPECS: Record<BiosKind, { file: string; label: string; size: number; md5: string[]; required: boolean; description: string }> = {
  boot: {
    file: 'dc_boot.bin',
    label: 'Boot ROM',
    size: 2 * 1024 * 1024,
    md5: ['e10c53c2f8b90bab96ead2d368858623'],
    required: true,
    description: 'The Dreamcast system ROM (2 MB). Needed to boot commercial discs.',
  },
  flash: {
    file: 'dc_flash.bin',
    label: 'Flash ROM',
    size: 128 * 1024,
    md5: ['0a93f7940c455905bea6e392dfde92a4'],
    required: false,
    description: 'System settings and region (128 KB). Optional: a default is created if missing.',
  },
};

export class BiosError extends Error {}

/** Works out which BIOS file this is from its size. */
export function detectBiosKind(file: { name: string; size: number }): BiosKind | null {
  if (file.size === BIOS_SPECS.boot.size) return 'boot';
  if (file.size === BIOS_SPECS.flash.size) return 'flash';
  return null;
}

export async function saveBios(file: File): Promise<BiosInfo> {
  const kind = detectBiosKind(file);
  if (!kind) {
    throw new BiosError(
      `${file.name} is ${file.size.toLocaleString()} bytes. A Dreamcast boot ROM is exactly 2,097,152 bytes and a flash ROM 131,072 bytes.`,
    );
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const hash = md5(data);
  const info: BiosInfo = {
    kind,
    fileName: file.name,
    size: data.length,
    md5: hash,
    recognized: BIOS_SPECS[kind].md5.includes(hash),
    addedAt: Date.now(),
  };
  await db.set('bios', kind, { ...info, data } satisfies StoredBios);
  return info;
}

export async function listBios(): Promise<Partial<Record<BiosKind, BiosInfo>>> {
  const out: Partial<Record<BiosKind, BiosInfo>> = {};
  for (const kind of ['boot', 'flash'] as BiosKind[]) {
    const s = await db.get<StoredBios>('bios', kind).catch(() => undefined);
    if (s) {
      const { data: _data, ...info } = s;
      void _data;
      out[kind] = info;
    }
  }
  return out;
}

export async function loadBiosData(kind: BiosKind): Promise<Uint8Array | null> {
  const s = await db.get<StoredBios>('bios', kind).catch(() => undefined);
  return s?.data ?? null;
}

export async function removeBios(kind: BiosKind) {
  await db.del('bios', kind);
}
