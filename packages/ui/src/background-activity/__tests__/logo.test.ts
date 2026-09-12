import { inflateSync } from 'node:zlib';

import { CHERRY_ACTIVITY_LOGO_BASE64 } from '../logo';

describe('background activity logo', () => {
  test('contains a decodable 128px RGBA PNG', () => {
    const png = Buffer.from(CHERRY_ACTIVITY_LOGO_BASE64, 'base64');
    const idatChunks: Buffer[] = [];

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
    expect(png[25]).toBe(6);

    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString('ascii');
      if (type === 'IDAT') idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }

    expect(idatChunks).not.toHaveLength(0);
    expect(() => inflateSync(Buffer.concat(idatChunks))).not.toThrow();
  });
});
