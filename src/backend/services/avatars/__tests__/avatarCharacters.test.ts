import { CHARACTER_EXPRESSIONS } from '@cherrystudio/character-avatar/manifest';
import { strToU8, zipSync } from 'fflate';

import { createAvatarCharacters } from '../avatarCharacters';

const mockFiles = new Map<string, Uint8Array | string>();
let mockNextId = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockNextId).padStart(12, '0')}`,
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => ({ uri: 'file:///documents' }),
}));
jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(value: Uint8Array | string) {
      mockFiles.set(this.uri, value);
    }
    async text() {
      return mockFiles.get(this.uri) as string;
    }
    async bytes() {
      return mockFiles.get(this.uri) as Uint8Array;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return {
    File: MockFile,
    Directory: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = join(parts);
      }
      get exists() {
        return [...mockFiles.keys()].some((path) => path.startsWith(`${this.uri}/`));
      }
      create() {}
      list() {
        return [...mockFiles.keys()]
          .filter((path) => path.startsWith(`${this.uri}/`))
          .map((path) => new MockFile(path));
      }
    },
  };
});

// Fake layers carry their geometry as JSON; the Skia mock "decodes" that into pixels.
type FakeLayer = { size: number; opaque?: [number, number, number, number] };
jest.mock('@shopify/react-native-skia', () => ({
  AlphaType: { Unpremul: 'unpremul' },
  ColorType: { RGBA_8888: 'rgba' },
  Skia: {
    Data: { fromBytes: (bytes: Uint8Array) => ({ bytes, dispose: () => {} }) },
    Image: {
      MakeImageFromEncoded: ({ bytes }: { bytes: Uint8Array }) => {
        const layer = JSON.parse(new TextDecoder().decode(bytes)) as FakeLayer;
        return {
          width: () => layer.size,
          height: () => layer.size,
          dispose: () => {},
          readPixels: () => {
            const pixels = new Uint8Array(layer.size * layer.size * 4);
            const [left, top, right, bottom] = layer.opaque ?? [0, 0, -1, -1];
            for (let y = top; y <= bottom; y++)
              for (let x = left; x <= right; x++) pixels[(y * layer.size + x) * 4 + 3] = 255;
            return pixels;
          },
        };
      },
    },
  },
}));

const layer = (spec: FakeLayer) => strToU8(JSON.stringify(spec));
const head: FakeLayer = { size: 128, opaque: [20, 10, 99, 109] };
function pack(manifest: object, layers: Record<string, FakeLayer>, folder = '') {
  const entries: Record<string, Uint8Array> = {
    [`${folder}character.json`]: strToU8(JSON.stringify(manifest)),
  };
  for (const [name, spec] of Object.entries(layers)) entries[`${folder}${name}.webp`] = layer(spec);
  const uri = `file:///cache/pack-${++mockNextId}.zip`;
  mockFiles.set(uri, zipSync(entries));
  return uri;
}
const expressions = Object.fromEntries(CHARACTER_EXPRESSIONS.map((name) => [name, head]));
const manifest = {
  version: 1,
  name: 'Fixture',
  size: 128,
  rig: { tuft: { pivot: { x: 60, y: 12 } }, sways: [{ x: 30, y: 30 }] },
};

beforeEach(() => {
  mockFiles.clear();
  mockNextId = 0;
});

test('imports a pack, derives the frame and neck from the idle silhouette, and lists it', async () => {
  const characters = createAvatarCharacters();
  const id = await characters.importCharacterPack(
    pack(manifest, { ...expressions, tuft: head }, 'my-character/'),
  );
  const [character] = await characters.listCharacters();
  expect(character).toMatchObject({ id, manifest: { name: 'Fixture' } });
  expect(character!.manifest.rig.frame.center).toEqual({ x: 59.5, y: 59.5 });
  expect(character!.manifest.rig.neck.y).toBeCloseTo(109 - 99 * 0.07);
  expect(Object.keys(character!.layers).sort()).toEqual([...CHARACTER_EXPRESSIONS, 'tuft'].sort());
});

test.each([
  ['a missing layer', expressions],
  ['a layer of the wrong size', { ...expressions, tuft: { size: 64 } }],
  [
    'an opaque background',
    {
      ...expressions,
      idle: { size: 128, opaque: [0, 0, 127, 127] as [number, number, number, number] },
      tuft: head,
    },
  ],
])('rejects %s without leaving files behind', async (_, layers) => {
  const characters = createAvatarCharacters();
  const uri = pack(manifest, layers);
  await expect(characters.importCharacterPack(uri)).rejects.toThrow();
  expect([...mockFiles.keys()].filter((path) => path.includes('avatar-characters'))).toEqual([]);
});

test('removing a character deletes its record and every layer', async () => {
  const characters = createAvatarCharacters();
  const id = await characters.importCharacterPack(pack({ ...manifest, rig: {} }, expressions));
  await characters.removeCharacter(id);
  expect(await characters.listCharacters()).toEqual([]);
  expect([...mockFiles.keys()].some((path) => path.includes(id))).toBe(false);
});
