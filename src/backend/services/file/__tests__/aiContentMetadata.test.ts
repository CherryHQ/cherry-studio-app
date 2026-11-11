import { File } from 'expo-file-system';

import { AiContentLabelSchema, inheritAiContent } from '@/shared/data/types/aiContent';
import { readAiContentText, writeAiContentText } from '@/shared/utils/aiContentText';

import {
  completeFileAiContent,
  createGeneratedAiContent,
  readFileAiContent,
  readSourceAiContent,
} from '../aiContentMetadata';
import { imageMetadata } from '../imageMetadata';

const mockFiles = new Map<string, Uint8Array>();
let mockId = 0;
jest.mock('uuid', () => ({ v7: () => `content-${++mockId}`, v4: () => 'unused' }));
jest.mock('expo-file-system', () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
  }
  return {
    Directory,
    FileMode: { ReadOnly: 'r', WriteOnly: 'w' },
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = uri(parts);
      }
      get size() {
        return mockFiles.get(this.uri)?.length ?? 0;
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      get parentDirectory() {
        return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/')));
      }
      create() {
        mockFiles.set(this.uri, new Uint8Array());
      }
      delete() {
        mockFiles.delete(this.uri);
      }
      writeSync(value: string) {
        mockFiles.set(this.uri, new TextEncoder().encode(value));
      }
      async text() {
        return Buffer.from(mockFiles.get(this.uri)!).toString('utf8');
      }
      async bytes() {
        return mockFiles.get(this.uri)!.slice();
      }
      async copy(destination: { uri: string }) {
        mockFiles.set(destination.uri, mockFiles.get(this.uri)!.slice());
      }
      open() {
        const path = this.uri;
        return {
          offset: 0,
          readBytesSync(length: number) {
            const value = mockFiles.get(path)!.slice(this.offset, this.offset + length);
            this.offset += value.length;
            return value;
          },
          writeBytesSync(value: Uint8Array) {
            const previous = mockFiles.get(path)!;
            const output = new Uint8Array(Math.max(previous.length, this.offset + value.length));
            output.set(previous);
            output.set(value, this.offset);
            this.offset += value.length;
            mockFiles.set(path, output);
          },
          close() {},
        };
      }
    },
  };
});

const uri = 'file:///pending/report.md';
const label = AiContentLabelSchema.parse({
  Label: '1',
  ContentProducer: 'UpstreamExample',
  ProduceID: 'upstream-1',
  ReservedCode1: '',
  ContentPropagator: 'RelayExample',
  PropagateID: 'relay-1',
  ReservedCode2: '',
});
beforeEach(() => {
  mockFiles.clear();
  mockId = 0;
});

test.each([
  ['text/markdown', '\uFEFFBody\n'],
  ['text/html', '<!DOCTYPE html><html><head></head><body>Body</body></html>'],
  ['application/json', '{"data":1}\n'],
])(
  'unknown upstream identity never blocks %s generation or invents a service identity',
  async (mediaType, text) => {
    const file = new File(uri);
    file.writeSync(text);
    const original = mockFiles.get(uri)!.slice();
    const facts = await completeFileAiContent({ uri, mediaType, aiOperation: 'generate' });
    expect(facts).toEqual({ version: 1, source: 'generated', label: null });
    expect(mockFiles.get(uri)).toEqual(original);
    expect([...mockFiles.keys()]).toEqual([uri]);
  },
);

test('a new AI edit clears old production identity without changing its historical source', async () => {
  const originalUri = 'file:///managed/original.md';
  const original = new File(originalUri);
  original.writeSync(writeAiContentText('\uFEFFBody\n', 'text/markdown', label));
  const previous = await readFileAiContent({ uri: originalUri, mediaType: 'text/markdown' });
  const file = new File(uri);
  await original.copy(file);
  file.writeSync((await file.text()).replace('Body', 'Edited'));
  const facts = await completeFileAiContent({
    uri,
    mediaType: 'text/markdown',
    aiContent: previous,
    aiOperation: 'edit',
  });
  expect(facts).toEqual({ version: 1, source: 'generated', label: null });
  expect(await file.text()).toBe('\uFEFFEdited\n');
  expect(readAiContentText(await file.text(), 'text/markdown')).toBeNull();
  expect(readAiContentText(await original.text(), 'text/markdown')).toEqual(label);
  expect((await original.text()).endsWith('Body\n')).toBe(true);
  expect([...mockFiles.keys()]).toEqual([originalUri, uri]);
});

test('copies and mechanical transformations retain independently supplied producer and propagator fields', async () => {
  const upstream = inheritAiContent(label);
  new File(uri).writeSync(writeAiContentText('Original\n', 'text/markdown', label));
  const facts = await readFileAiContent({ uri, mediaType: 'text/markdown' });
  expect(await readSourceAiContent({ uri, mediaType: 'text/markdown', aiContent: null })).toEqual(
    facts,
  );
  const original = mockFiles.get(uri)!.slice();
  await expect(
    completeFileAiContent({ uri, mediaType: 'text/markdown', aiContent: facts }),
  ).resolves.toEqual(upstream);
  expect(mockFiles.get(uri)).toEqual(original);
  const htmlUri = 'file:///pending/copy.html';
  new File(htmlUri).writeSync('<!DOCTYPE html><html><head></head><body>Original</body></html>');
  const derived = await completeFileAiContent({
    uri: htmlUri,
    mediaType: 'text/html',
    aiContent: facts,
  });
  expect(derived?.label).toEqual(label);
  expect(readAiContentText(await new File(htmlUri).text(), 'text/html')).toEqual(label);
});

test.each([null, '1', '2', '3'] as const)(
  'original model-image responses preserve upstream confidence and bytes (Label=%s)',
  async (confidence) => {
    const raw = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const upstreamLabel = confidence ? { ...label, Label: confidence } : null;
    const bytes = upstreamLabel
      ? new Uint8Array(
          Buffer.concat(
            imageMetadata(
              { size: raw.length, read: (offset, length) => raw.slice(offset, offset + length) },
              'image/png',
              upstreamLabel,
            ).parts.map((part) =>
              part instanceof Uint8Array ? part : raw.slice(part.offset, part.offset + part.length),
            ),
          ),
        )
      : raw;
    const imageUri = 'file:///pending/image.png';
    mockFiles.set(imageUri, bytes);
    const facts = await completeFileAiContent({
      uri: imageUri,
      mediaType: 'image/png',
      aiOperation: 'generate',
    });
    expect(facts).toEqual(
      upstreamLabel ? inheritAiContent(upstreamLabel) : createGeneratedAiContent(),
    );
    expect(mockFiles.get(imageUri)).toEqual(bytes);
    expect([...mockFiles.keys()]).toEqual([imageUri]);
  },
);

test.each(['generate', 'edit'] as const)(
  'a new %s image with frozen source facts clears a superseded declaration',
  async (aiOperation) => {
    const raw = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const source = {
      size: raw.length,
      read: (offset: number, length: number) => raw.slice(offset, offset + length),
    };
    const bytes = Buffer.concat(
      imageMetadata(source, 'image/png', label).parts.map((part) =>
        part instanceof Uint8Array ? part : raw.slice(part.offset, part.offset + part.length),
      ),
    );
    const imageUri = 'file:///pending/image.png';
    mockFiles.set(imageUri, new Uint8Array(bytes));
    const facts = await completeFileAiContent({
      uri: imageUri,
      mediaType: 'image/png',
      aiOperation,
      aiContent: createGeneratedAiContent(),
    });
    expect(facts).toEqual(createGeneratedAiContent());
    expect(await readFileAiContent({ uri: imageUri, mediaType: 'image/png' })).toBeNull();
    expect([...mockFiles.keys()]).toEqual([imageUri]);
  },
);

test('unknown-origin facts remain unknown after conversion instead of receiving a local producer', async () => {
  new File(uri).writeSync('<main>Converted</main>');
  const facts = createGeneratedAiContent();
  await expect(
    completeFileAiContent({ uri, mediaType: 'text/html', aiContent: facts }),
  ).resolves.toEqual(facts);
  expect(await new File(uri).text()).toBe('<main>Converted</main>');
});

test('unknown ordinary text is unchanged and a cancelled write never replaces pending content', async () => {
  new File(uri).writeSync('Ordinary user text\n');
  await expect(completeFileAiContent({ uri, mediaType: 'text/markdown' })).resolves.toBeNull();
  const controller = new AbortController();
  controller.abort();
  await expect(
    completeFileAiContent(
      { uri, mediaType: 'text/markdown', aiOperation: 'edit' },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(await new File(uri).text()).toBe('Ordinary user text\n');
});
