import { File } from 'expo-file-system';

import { createAiContent } from '@/shared/data/types/aiContent';
import { readAiContentText, writeAiContentText } from '@/shared/utils/aiContentText';

import {
  completeFileAiContent,
  readFileAiContent,
  readSourceAiContent,
} from '../aiContentMetadata';

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
const previousProducer = process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER;
beforeEach(() => {
  mockFiles.clear();
  mockId = 0;
  process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER = 'ProviderExample';
});
afterAll(() => {
  if (previousProducer === undefined) delete process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER;
  else process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER = previousProducer;
});

test('finishes AI writes before returning facts, and each AI edit receives a new production ID', async () => {
  const file = new File(uri);
  file.writeSync('\uFEFFBody\n');
  const generated = await completeFileAiContent({
    uri,
    mediaType: 'text/markdown',
    aiOperation: 'generate',
  });
  expect(generated?.source).toBe('generated');
  expect(readAiContentText(await file.text(), 'text/markdown')).toEqual(generated?.label);
  expect(mockFiles.get(uri)!.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  file.writeSync((await file.text()).replace('Body', 'Edited'));
  const edited = await completeFileAiContent({
    uri,
    mediaType: 'text/markdown',
    aiContent: generated,
    aiOperation: 'edit',
  });
  expect(edited?.label?.ProduceID).not.toBe(generated?.label?.ProduceID);
  expect(readAiContentText(await file.text(), 'text/markdown')).toEqual(edited?.label);
  expect((await file.text()).endsWith('Edited\n')).toBe(true);
  expect([...mockFiles.keys()]).toEqual([uri]);
});

test('copies and mechanical transformations retain production identity without needing local provider config', async () => {
  delete process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER;
  const upstream = createAiContent('UpstreamExample', 'upstream-1');
  new File(uri).writeSync(writeAiContentText('Original\n', 'text/markdown', upstream.label!));
  const facts = await readFileAiContent({ uri, mediaType: 'text/markdown' });
  expect(await readSourceAiContent({ uri, mediaType: 'text/markdown', aiContent: null })).toEqual(
    facts,
  );
  const original = mockFiles.get(uri)!.slice();
  await expect(
    completeFileAiContent({ uri, mediaType: 'text/markdown', aiContent: facts }),
  ).resolves.toEqual(facts);
  expect(mockFiles.get(uri)).toEqual(original);
  const htmlUri = 'file:///pending/copy.html';
  new File(htmlUri).writeSync('<!DOCTYPE html><html><head></head><body>Original</body></html>');
  const derived = await completeFileAiContent({
    uri: htmlUri,
    mediaType: 'text/html',
    aiContent: facts,
  });
  expect(derived?.label).toEqual(upstream.label);
  expect(readAiContentText(await new File(htmlUri).text(), 'text/html')).toEqual(upstream.label);
});

test('missing provider cannot produce a supported labeled artifact; raw formats retain exact bytes and origin facts', async () => {
  delete process.env.EXPO_PUBLIC_AI_CONTENT_PRODUCER;
  new File(uri).writeSync('Body');
  const original = mockFiles.get(uri)!.slice();
  await expect(
    completeFileAiContent({ uri, mediaType: 'text/markdown', aiOperation: 'generate' }),
  ).rejects.toThrow('producer is not configured');
  expect(mockFiles.get(uri)).toEqual(original);
  const rawUri = 'file:///pending/data.json';
  new File(rawUri).writeSync('{"data":1}\n');
  await expect(
    completeFileAiContent({ uri: rawUri, mediaType: 'application/json', aiOperation: 'generate' }),
  ).resolves.toEqual({ version: 1, source: 'generated', label: null });
  expect(await new File(rawUri).text()).toBe('{"data":1}\n');
  expect([...mockFiles.keys()]).toEqual([uri, rawUri]);
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
