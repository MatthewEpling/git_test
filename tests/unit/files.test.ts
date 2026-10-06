import { describe, expect, it } from 'vitest';
import { parseCueFiles, parseGdiFiles, resolveGames } from '../../src/content/files';

const f = (name: string, text = 'x') => new File([text], name);

describe('content files', () => {
  it('reads track names from GDI sheets, including quoted names', () => {
    const gdi = '3\n1 0 4 2352 track01.bin 0\n2 600 0 2352 "track 02.raw" 0\n3 45000 4 2352 track03.bin 0\n';
    expect(parseGdiFiles(gdi)).toEqual(['track01.bin', 'track 02.raw', 'track03.bin']);
  });

  it('reads CUE FILE lines', () => {
    expect(parseCueFiles('FILE "Game (Track 1).bin" BINARY\n  TRACK 01 MODE1/2352\nFILE "Game (Track 2).bin" BINARY')).toEqual(['Game (Track 1).bin', 'Game (Track 2).bin']);
  });

  it('groups files into games and reports missing tracks', async () => {
    const games = await resolveGames([
      f('Sonic.gdi', '3\n1 0 4 2352 track01.bin 0\n2 600 0 2352 track02.raw 0\n3 45000 4 2352 track03.bin 0\n'),
      f('track01.bin'),
      f('track03.bin'),
      f('Other.chd'),
      f('readme.txt'),
    ]);
    expect(games.map((g) => [g.format, g.main.name, g.files.length, g.missing])).toEqual([
      ['gdi', 'Sonic.gdi', 3, ['track02.raw']],
      ['chd', 'Other.chd', 1, []],
    ]);
  });

  it('lets an M3U own its discs', async () => {
    const games = await resolveGames([f('Shen.m3u', 'Disc1.chd\nDisc2.chd\n'), f('Disc1.chd'), f('Disc2.chd')]);
    expect(games).toHaveLength(1);
    expect(games[0].files.map((x) => x.name)).toEqual(['Shen.m3u', 'Disc1.chd', 'Disc2.chd']);
  });
});
