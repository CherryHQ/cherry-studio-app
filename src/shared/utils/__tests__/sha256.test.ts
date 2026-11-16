import { createHash } from 'node:crypto';

import { sha256Hex, sha256HexChunks, sha256HexOfText } from '../sha256';

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

  it('hashes chunk boundaries identically while letting timers run before completion', async () => {
    jest.useFakeTimers();
    try {
      const bytes = new Uint8Array(150_013);
      for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
      const consumed: number[] = [];
      function* chunks() {
        consumed.push(1);
        yield bytes.subarray(0, 70_003);
        consumed.push(2);
        yield new Uint8Array();
        yield bytes.subarray(70_003);
      }
      let finished = false;
      const hashing = sha256HexChunks(chunks()).then((digest) => {
        finished = true;
        return digest;
      });
      expect(consumed).toEqual([1]);
      expect(finished).toBe(false);
      await jest.runAllTimersAsync();
      expect(consumed).toEqual([1, 2]);
      expect(await hashing).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(await sha256HexChunks([])).toBe(sha256Hex(new Uint8Array()));
    } finally {
      jest.useRealTimers();
    }
  });
});
