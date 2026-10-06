import { describe, expect, it } from 'vitest';
import { decodeInput, decodeSignal, encodeInput, encodeSignal, parseIceServers, seqNewer } from '../../src/netplay/codec';

describe('netplay codec', () => {
  it('round-trips input packets', () => {
    const pkt = { seq: 65535, pad: { buttons: 0b1010_0000_1001, axes: [-32768, 32767, 5, -5] as [number, number, number, number], triggers: [0, 32767] as [number, number] }, keys: [97, 273] };
    expect(decodeInput(encodeInput(pkt))).toEqual(pkt);
  });

  it('handles sequence wraparound', () => {
    expect(seqNewer(1, 65535)).toBe(true);
    expect(seqNewer(65535, 1)).toBe(false);
    expect(seqNewer(5, 5)).toBe(false);
  });

  it('round-trips invite codes and rejects junk', async () => {
    const code = await encodeSignal({ kind: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n'.repeat(20), name: 'Ana', title: 'Game' });
    expect(code.startsWith('DP1.')).toBe(true);
    expect(await decodeSignal(`  ${code}\n`)).toMatchObject({ kind: 'offer', name: 'Ana', title: 'Game' });
    await expect(decodeSignal('hello')).rejects.toThrow(/Dreamport code/);
    await expect(decodeSignal(code.slice(0, 30))).rejects.toThrow(/incomplete/);
  });

  it('parses STUN and TURN servers', () => {
    expect(parseIceServers('stun:a:3478\nturn:b:3478 user pass')).toEqual([{ urls: 'stun:a:3478' }, { urls: 'turn:b:3478', username: 'user', credential: 'pass' }]);
  });
});
