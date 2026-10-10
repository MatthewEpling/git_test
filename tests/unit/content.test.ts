import { describe, expect, test } from 'vitest';
import pack from '../../src/content/standin/pack.json';
import { loadPack } from '../../src/content/validate';

describe('content packs', () => {
  test('the stand-in pack passes the schema and cross-reference checks', () => {
    const r = loadPack(pack);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.pack.meta.source).toBe('original-standin');
  });

  test('broken references are reported, not thrown', () => {
    const broken = structuredClone(pack) as typeof pack;
    broken.huntEventTable.entries[0].event = 'no-such-event';
    (broken.gear[1] as unknown as { cost: Record<string, number> }).cost = { 'keyword:nothing': 1 };
    const r = loadPack(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join('\n')).toMatch(/unknown event "no-such-event"/);
      expect(r.errors.join('\n')).toMatch(/no resource has keyword "nothing"/);
    }
  });

  test('roll tables must cover every face exactly once', () => {
    const broken = structuredClone(pack) as typeof pack;
    broken.huntEventTable.entries.pop();
    const r = loadPack(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/no row for a roll of 10/);
  });
});
