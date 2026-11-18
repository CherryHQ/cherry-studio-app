import type { File } from 'expo-file-system';

import { normalizeDeepseekAudio } from '../deepseekAudio';

function fixture(sampleRate: number, samples: number[]) {
  const bytes = new Uint8Array(54 + samples.length * 2);
  const wave = new DataView(bytes.buffer);
  bytes.set(Buffer.from('RIFF'), 0);
  wave.setUint32(4, bytes.length - 8, true);
  bytes.set(Buffer.from('WAVEJUNK'), 8);
  wave.setUint32(16, 1, true); // Odd metadata length requires a padding byte before fmt.
  bytes.set(Buffer.from('fmt '), 22);
  wave.setUint32(26, 16, true);
  wave.setUint16(30, 1, true);
  wave.setUint16(32, 1, true);
  wave.setUint32(34, sampleRate, true);
  wave.setUint32(38, sampleRate * 2, true);
  wave.setUint16(42, 2, true);
  wave.setUint16(44, 16, true);
  bytes.set(Buffer.from('data'), 46);
  wave.setUint32(50, samples.length * 2, true);
  samples.forEach((sample, index) => wave.setInt16(54 + index * 2, sample, true));

  const handle = {
    size: bytes.length,
    offset: 0,
    readBytesSync(length: number) {
      const result = bytes.slice(this.offset, this.offset + length);
      this.offset += result.length;
      return result;
    },
    readBytes: jest.fn(async (length: number): Promise<Uint8Array> => handle.readBytesSync(length)),
    close: jest.fn(),
  };
  return { file: { open: () => handle } as unknown as File, handle };
}

test('converts unsupported 96 kHz PCM into a valid 16 kHz mono WAV', async () => {
  const { file, handle } = fixture(
    96_000,
    [60, 120, 180, 240, 300, 360, -60, -120, -180, -240, -300, -360],
  );
  const result = await normalizeDeepseekAudio(file, new AbortController().signal);
  expect(result).toBeDefined();
  const wav = new DataView(result!.buffer);
  expect(wav.getUint16(22, true)).toBe(1);
  expect(wav.getUint32(24, true)).toBe(16_000);
  expect(wav.getUint16(34, true)).toBe(16);
  expect(wav.getUint32(40, true)).toBe(4);
  expect(wav.getInt16(44, true)).toBe(210);
  expect(wav.getInt16(46, true)).toBe(-210);
  expect(handle.close).toHaveBeenCalledTimes(1);
});

test('keeps a supported file without reading or copying its PCM data', async () => {
  const { file, handle } = fixture(48_000, [100, 200]);
  await expect(normalizeDeepseekAudio(file, new AbortController().signal)).resolves.toBeUndefined();
  expect(handle.readBytes).not.toHaveBeenCalled();
  expect(handle.close).toHaveBeenCalledTimes(1);
});
