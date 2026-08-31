export type ManagedTextFailure = 'binary-content' | 'file-bytes' | 'invalid-utf8' | 'nul-byte';

export class ManagedTextError extends Error {
  constructor(readonly failure: ManagedTextFailure) {
    super(failure);
    this.name = 'ManagedTextError';
  }
}

export type DecodedManagedText = {
  hasBom: boolean;
  text: string;
};

/** Strict RN-safe UTF-8 decoding shared by attachment projection and file tools. */
export function decodeManagedUtf8(bytes: Uint8Array, maxBytes: number): DecodedManagedText {
  if (bytes.byteLength > maxBytes) {
    throw new ManagedTextError('file-bytes');
  }
  if (bytes.includes(0)) {
    throw new ManagedTextError('nul-byte');
  }

  const hasBom = hasUtf8Bom(bytes);
  const text = decodeUtf8Strict(bytes.subarray(hasBom ? 3 : 0));
  if (text === null) {
    throw new ManagedTextError('invalid-utf8');
  }
  if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new ManagedTextError('binary-content');
  }
  return { hasBom, text };
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/** Rejects overlong, surrogate, truncated, and out-of-range sequences. */
function decodeUtf8Strict(bytes: Uint8Array): string | null {
  const codePoints: number[] = [];
  const chunks: string[] = [];
  const flush = () => {
    if (codePoints.length > 0) {
      chunks.push(String.fromCodePoint(...codePoints));
      codePoints.length = 0;
    }
  };

  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first === undefined) return null;

    let codePoint: number;
    let width: number;
    if (first <= 0x7f) {
      codePoint = first;
      width = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      const second = bytes[index + 1];
      if (!isContinuationByte(second)) return null;
      codePoint = ((first & 0x1f) << 6) | (second & 0x3f);
      width = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      if (!isContinuationByte(second) || !isContinuationByte(third)) return null;
      if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0)) return null;
      codePoint = ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
      width = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      const fourth = bytes[index + 3];
      if (
        !isContinuationByte(second) ||
        !isContinuationByte(third) ||
        !isContinuationByte(fourth)
      ) {
        return null;
      }
      if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second >= 0x90)) return null;
      codePoint =
        ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      width = 4;
    } else {
      return null;
    }

    codePoints.push(codePoint);
    if (codePoints.length === 4_096) flush();
    index += width;
  }

  flush();
  return chunks.join('');
}

function isContinuationByte(value: number | undefined): value is number {
  return value !== undefined && value >= 0x80 && value <= 0xbf;
}
