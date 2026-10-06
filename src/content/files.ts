// Figures out which uploaded files belong to which game (a GDI and its tracks, a CUE and
// its BINs, an M3U of discs, …) and which file the emulator should open.

export type GameFormat = 'gdi' | 'cue' | 'chd' | 'cdi' | 'elf' | 'm3u';

export interface GameSet {
  /** File the core opens. */
  main: File;
  format: GameFormat;
  /** Every file the game needs, including main. */
  files: File[];
  /** Referenced files that were not provided. */
  missing: string[];
  /** Best guess at a title from the file name. */
  name: string;
}

const PRIORITY: GameFormat[] = ['m3u', 'gdi', 'cue', 'chd', 'cdi', 'elf'];

export const ACCEPTED_EXTENSIONS = ['.gdi', '.cue', '.chd', '.cdi', '.elf', '.m3u', '.bin', '.raw', '.iso', '.img'];

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function prettyName(fileName: string): string {
  return baseName(fileName)
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Track file names referenced by a GDI sheet. */
export function parseGdiFiles(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^\d+\s+\d+\s+\d+\s+\d+\s+(?:"([^"]+)"|(\S+))/);
    if (m) out.push(m[1] ?? m[2]);
  }
  return out;
}

/** Data file names referenced by a CUE sheet. */
export function parseCueFiles(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^FILE\s+(?:"([^"]+)"|(\S+))/i);
    if (m) out.push(baseName(m[1] ?? m[2]));
  }
  return out;
}

export function parseM3u(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(baseName);
}

/** Groups a pile of files into playable games. */
export async function resolveGames(input: File[]): Promise<GameSet[]> {
  const byName = new Map<string, File>();
  for (const f of input) byName.set(f.name.toLowerCase(), f);
  const claimed = new Set<File>();
  const games: GameSet[] = [];

  const resolveOne = async (main: File): Promise<GameSet> => {
    const format = extOf(main.name) as GameFormat;
    const files = [main];
    const missing: string[] = [];
    const add = (name: string) => {
      const f = byName.get(name.toLowerCase());
      if (f) {
        if (!files.includes(f)) files.push(f);
      } else if (!missing.includes(name)) missing.push(name);
      return f;
    };
    if (format === 'gdi') parseGdiFiles(await main.text()).forEach(add);
    else if (format === 'cue') parseCueFiles(await main.text()).forEach(add);
    else if (format === 'm3u') {
      for (const disc of parseM3u(await main.text())) {
        const f = add(disc);
        if (f && (extOf(f.name) === 'gdi' || extOf(f.name) === 'cue')) {
          const sub = await resolveOne(f);
          sub.files.forEach((x) => !files.includes(x) && files.push(x));
          sub.missing.forEach((x) => !missing.includes(x) && missing.push(x));
        }
      }
    }
    return { main, format, files, missing, name: prettyName(main.name) };
  };

  for (const format of PRIORITY) {
    for (const f of input) {
      if (extOf(f.name) !== format || claimed.has(f)) continue;
      const game = await resolveOne(f);
      // Skip sheets already pulled in by an M3U.
      if (game.files.some((x) => claimed.has(x)) && format !== 'm3u') continue;
      game.files.forEach((x) => claimed.add(x));
      games.push(game);
    }
  }
  return games;
}

/** Reads every file from a dropped folder (DataTransferItem directory entries). */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}
