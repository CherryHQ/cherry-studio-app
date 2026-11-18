import type { File, FileHandle } from 'expo-file-system';

import { VoiceError } from '@/shared/contracts/voice';

const ASR_SAMPLE_RATES = new Set([8_000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000]);
const TARGET_SAMPLE_RATE = 16_000;
const WAV_HEADER_BYTES = 44;
const RIFF = 0x52494646;
const WAVE = 0x57415645;
const FORMAT = 0x666d7420;
const DATA = 0x64617461;
const BYTES_PER_SAMPLE = 2;

type PcmWave = { sampleRate: number; dataOffset: number; dataBytes: number };

function invalidWave(): never {
  throw new VoiceError('invalid-audio', 'The decoded WAV window is invalid.');
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Scan RIFF headers and skip metadata without reading already compatible PCM samples. */
function readPcmWave(handle: FileHandle): PcmWave {
  const readHeader = (length: number) => {
    const bytes = handle.readBytesSync(length);
    if (bytes.byteLength !== length) invalidWave();
    return view(bytes);
  };
  const header = readHeader(12);
  const end = 8 + header.getUint32(4, true);
  if (header.getUint32(0) !== RIFF || header.getUint32(8) !== WAVE || end > (handle.size ?? 0))
    invalidWave();

  let sampleRate = 0;
  let dataOffset = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= end;) {
    handle.offset = offset;
    const chunk = readHeader(8);
    const type = chunk.getUint32(0);
    const size = chunk.getUint32(4, true);
    const start = offset + 8;
    offset = start + size + (size % 2);
    if (offset > end) invalidWave();
    if (type === FORMAT) {
      if (size < 16) invalidWave();
      const format = readHeader(Math.min(size, 40));
      const tag = format.getUint16(0, true);
      const isPcm =
        tag === 1 ||
        (tag === 0xfffe &&
          size >= 40 &&
          format.getUint16(16, true) >= 22 &&
          format.getUint16(18, true) === 16 &&
          format.getUint32(24, true) === 1 &&
          format.getUint32(28) === 0x00001000 &&
          format.getUint32(32) === 0x800000aa &&
          format.getUint32(36) === 0x00389b71);
      if (
        !isPcm ||
        format.getUint16(2, true) !== 1 ||
        format.getUint16(12, true) !== BYTES_PER_SAMPLE ||
        format.getUint16(14, true) !== 16
      )
        invalidWave();
      sampleRate = format.getUint32(4, true);
    } else if (type === DATA) {
      dataOffset = start;
      dataBytes = size;
    }
    if (sampleRate && dataOffset) break;
  }
  if (
    sampleRate < 1 ||
    sampleRate > 192_000 ||
    dataBytes === 0 ||
    dataBytes % BYTES_PER_SAMPLE !== 0 ||
    dataBytes / BYTES_PER_SAMPLE > sampleRate * 30 + 1
  )
    invalidWave();
  return { sampleRate, dataOffset, dataBytes };
}

/** Preserve compatible native WAVs. Only an unsupported rate needs a replacement upload file. */
export async function normalizeDeepseekAudio(
  file: File,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  signal.throwIfAborted();
  const handle = file.open();
  let sampleRate: number;
  let pcm: Uint8Array;
  try {
    const wave = readPcmWave(handle);
    sampleRate = wave.sampleRate;
    if (ASR_SAMPLE_RATES.has(sampleRate)) return undefined;
    handle.offset = wave.dataOffset;
    pcm = await handle.readBytes(wave.dataBytes);
    signal.throwIfAborted();
    if (pcm.byteLength !== wave.dataBytes) invalidWave();
  } finally {
    handle.close();
  }

  const input = view(pcm);
  const inputSamples = pcm.byteLength / BYTES_PER_SAMPLE;
  const step = sampleRate / TARGET_SAMPLE_RATE;
  const outputSamples = Math.max(1, Math.floor(inputSamples / step));
  const outputBytes = outputSamples * BYTES_PER_SAMPLE;
  const output = new Uint8Array(WAV_HEADER_BYTES + outputBytes);
  const wav = view(output);
  wav.setUint32(0, RIFF);
  wav.setUint32(4, output.length - 8, true);
  wav.setUint32(8, WAVE);
  wav.setUint32(12, FORMAT);
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, 1, true);
  wav.setUint32(24, TARGET_SAMPLE_RATE, true);
  wav.setUint32(28, TARGET_SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  wav.setUint16(32, BYTES_PER_SAMPLE, true);
  wav.setUint16(34, 16, true);
  wav.setUint32(36, DATA);
  wav.setUint32(40, outputBytes, true);

  // Average over each output sample's source interval before downsampling to reduce aliasing.
  for (let index = 0; index < outputSamples; index += 1) {
    if (index > 0 && index % 32_768 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const start = index * step;
    const end = Math.min(inputSamples, (index + 1) * step);
    let sum = 0;
    for (let sample = Math.floor(start); sample < end; sample += 1) {
      const weight = Math.min(end, sample + 1) - Math.max(start, sample);
      sum += input.getInt16(sample * BYTES_PER_SAMPLE, true) * weight;
    }
    wav.setInt16(
      WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE,
      Math.round(sum / (end - start)),
      true,
    );
  }
  return output;
}
