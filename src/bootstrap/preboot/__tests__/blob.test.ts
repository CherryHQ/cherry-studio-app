import { Blob as BufferBlob } from 'node:buffer';

// Exercise the real Expo FormData encoder and React Native form, with a byte-capable Blob.
// Native Expo Blob storage still needs device acceptance; Node's File/FormData are not used here.
jest.mock('expo-blob', () => ({ Blob: jest.requireActual('node:buffer').Blob }));

const original = { Blob: globalThis.Blob, File: globalThis.File, FormData: globalThis.FormData };
let encode: (form: FormData, boundary: string) => Promise<{ body: Uint8Array }>;

function install() {
  jest.isolateModules(() => jest.requireActual('../blob'));
}

beforeEach(() => {
  jest.isolateModules(() => {
    const nativeForm = jest.requireActual('react-native/Libraries/Network/FormData').default;
    const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
    globalThis.Blob = BufferBlob as unknown as typeof globalThis.Blob;
    globalThis.FormData = installFormDataPatch(nativeForm);
    encode = jest.requireActual('expo/src/winter/fetch/convertFormData').convertFormDataAsync;
  });
  install();
});

afterEach(() => Object.assign(globalThis, original));

test.each([
  ['audio/wav', 'audio.wav', [82, 73, 70, 70, 0, 255, 87, 65, 86, 69]],
  ['audio/mp4', 'audio.mp4', [0, 0, 0, 32, 102, 116, 121, 112, 77, 52, 65, 32]],
] as const)(
  'preserves %s bytes and the SDK multipart filename override',
  async (type, name, values) => {
    const bytes = new Uint8Array(values);
    const file = new File([new Blob([bytes])], 'audio', { type, lastModified: 123 });
    const form = new FormData();
    form.append('file', file, name);
    form.append('model', 'whisper-1');
    const uploaded = form.get('file') as File;

    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(bytes.length);
    expect(file.name).toBe('audio');
    expect(uploaded.name).toBe(name);
    expect(uploaded.type).toBe(type);
    expect(uploaded.lastModified).toBe(123);
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(bytes);
    const { body } = await encode(form, 'voice-boundary');
    const encoded = Buffer.from(body);
    expect(encoded.includes(Buffer.from(bytes))).toBe(true);
    expect(encoded.toString()).toContain(`filename="${name}"`);
    expect(encoded.toString()).toContain(`content-type: ${type}`);
    expect(encoded.toString()).not.toContain('[object Blob]');
  },
);

test('keeps filenames independent when one Blob is appended more than once or replaced', async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', blob, 'first.wav');
  form.append('file', blob, 'second.wav');
  expect(form.getAll('file').map((entry) => (entry as File).name)).toEqual([
    'first.wav',
    'second.wav',
  ]);
  expect('name' in blob).toBe(false);
  form.set('file', blob, 'replacement.wav');
  expect(form.getAll('file')).toHaveLength(1);
  expect((form.get('file') as File).name).toBe('replacement.wav');
  expect(new Uint8Array(await (form.get('file') as File).arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
});

test('retains named files and their byte slices across repeated setup', async () => {
  const file = new File(['hello'], 'memo.txt', { type: 'text/plain' });
  expect(await file.slice(1, 4).text()).toBe('ell');
  const form = new FormData();
  form.append('file', file);
  expect(form.get('file')).toBe(file);
  install();
  form.append('another', file, 'copy.txt');
  expect((form.get('another') as File).name).toBe('copy.txt');
  expect(await (form.get('another') as File).text()).toBe('hello');
  expect(() => Reflect.set(file, 'name', 'changed.txt')).not.toThrow();
  expect(file.name).toBe('memo.txt');
});
