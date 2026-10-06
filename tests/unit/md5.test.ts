import { describe, expect, it } from 'vitest';
import { Md5, md5 } from '../../src/content/md5';
import { createHash } from 'node:crypto';

describe('md5', () => {
  it('matches RFC 1321 vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });

  it('is correct when fed in uneven chunks', () => {
    const data = new Uint8Array(100_003).map((_, i) => (i * 7919) & 0xff);
    const h = new Md5();
    for (let i = 0; i < data.length; i += 777) h.update(data.subarray(i, i + 777));
    expect(h.hex()).toBe(createHash('md5').update(data).digest('hex'));
  });
});
