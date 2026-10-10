import { createHash } from 'node:crypto';

import { sha256Hex, sha256HexOfText } from '../sha256';

describe('sha256Hex', () => {
  it('matches the reference vectors', () => {
    expect(sha256HexOfText('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256HexOfText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with Node across block boundaries and multi-byte text', () => {
    for (const length of [55, 56, 63, 64, 65, 119, 120, 1000, 70_000]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + 7) % 256;
      expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    const text = '技能包 — skill package ✓';
    expect(sha256HexOfText(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});
