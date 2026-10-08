import {
  FILE_PREVIEW_CHUNK_BYTES,
  type HostMessage,
} from '@cherrystudio/file-preview-webview/protocol';
import type { FileHandle } from 'expo-file-system';

import { FilePreviewBridge } from '../filePreviewBridge';

function fakeFile(content: Uint8Array) {
  const state = { size: content.length, closeCount: 0, truncateReadsTo: Infinity };
  const open = (): FileHandle => {
    let offset = 0;
    return {
      get offset() {
        return offset;
      },
      set offset(value) {
        offset = value ?? 0;
      },
      get size() {
        return state.size;
      },
      readBytes(length: number) {
        const bytes = content.slice(offset, offset + Math.min(length, state.truncateReadsTo));
        offset += bytes.length;
        return bytes;
      },
      writeBytes() {
        throw new Error('read-only');
      },
      close() {
        state.closeCount++;
      },
    } as FileHandle;
  };
  return { state, open };
}

function patterned(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = (index * 7) % 251;
  return bytes;
}

function decode(messages: HostMessage[], requestId: number): Uint8Array {
  const chunks = messages
    .filter((message) => message.type === 'chunk' && message.requestId === requestId)
    .map((message) => Buffer.from((message as { data: string }).data, 'base64'));
  return new Uint8Array(Buffer.concat(chunks));
}

function setup(content: Uint8Array, resources = new Uint8Array()) {
  const file = fakeFile(content);
  const resourceFile = fakeFile(resources);
  const sent: HostMessage[] = [];
  let release: (() => void) | null = null;
  let isPaused = false;
  const bridge = new FilePreviewBridge({
    fileUri: 'file:///doc.pdf',
    revision: '42',
    pdfResources: {
      uri: 'file:///pdf-resources.bin',
      index: { 'cmap/UniGB-UCS2-H': [2, 3] },
    },
    send: (message) => sent.push(message),
    openFile: (uri) => (uri === 'file:///doc.pdf' ? file.open() : resourceFile.open()),
    yieldToEventLoop: () =>
      isPaused ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve(),
  });
  return {
    bridge,
    file,
    sent,
    pause: () => (isPaused = true),
    resume: () => {
      isPaused = false;
      release?.();
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('FilePreviewBridge', () => {
  it('opens with the file size and revision and streams exact ranges in chunks', async () => {
    const content = patterned(FILE_PREVIEW_CHUNK_BYTES * 2 + 123);
    const { bridge, sent } = setup(content);

    bridge.handle({ type: 'open', requestId: 1 });
    expect(sent[0]).toEqual({
      type: 'opened',
      requestId: 1,
      documentId: 0,
      size: content.length,
      revision: '42',
    });

    bridge.handle({ type: 'read', requestId: 2, documentId: 0, offset: 0, length: content.length });
    await flush();
    expect(sent.filter((message) => message.type === 'chunk')).toHaveLength(3);
    expect(decode(sent, 2)).toEqual(content);
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 2 });

    bridge.handle({ type: 'read', requestId: 3, documentId: 0, offset: 10, length: 5 });
    await flush();
    expect(decode(sent, 3)).toEqual(content.slice(10, 15));
  });

  it('gives every open its own handle and closes each once', async () => {
    const { bridge, file, sent } = setup(patterned(16));
    bridge.handle({ type: 'open', requestId: 1 });
    bridge.handle({ type: 'open', requestId: 2 });
    bridge.handle({ type: 'close', documentId: 0 });
    bridge.handle({ type: 'close', documentId: 0 });
    expect(file.state.closeCount).toBe(1);

    bridge.handle({ type: 'read', requestId: 3, documentId: 0, offset: 0, length: 4 });
    bridge.handle({ type: 'read', requestId: 4, documentId: 1, offset: 0, length: 4 });
    await flush();
    expect(sent).toContainEqual(expect.objectContaining({ requestId: 3, code: 'closed' }));
    expect(sent).toContainEqual({ type: 'done', requestId: 4 });

    bridge.dispose();
    expect(file.state.closeCount).toBe(2);
  });

  it('rejects short reads and out-of-range requests', async () => {
    const { bridge, file, sent } = setup(patterned(16));
    bridge.handle({ type: 'open', requestId: 1 });
    bridge.handle({ type: 'read', requestId: 2, documentId: 0, offset: 8, length: 9 });
    file.state.truncateReadsTo = 3;
    bridge.handle({ type: 'read', requestId: 3, documentId: 0, offset: 0, length: 8 });
    await flush();

    expect(sent).toContainEqual(expect.objectContaining({ requestId: 2, code: 'invalid_range' }));
    expect(sent).toContainEqual(expect.objectContaining({ requestId: 3, code: 'short_read' }));
    expect(sent).not.toContainEqual({ type: 'done', requestId: 3 });
  });

  it('fails a read when the file changes size underneath it', async () => {
    const { bridge, file, sent, pause, resume } = setup(patterned(FILE_PREVIEW_CHUNK_BYTES * 2));
    bridge.handle({ type: 'open', requestId: 1 });
    pause();
    bridge.handle({
      type: 'read',
      requestId: 2,
      documentId: 0,
      offset: 0,
      length: FILE_PREVIEW_CHUNK_BYTES * 2,
    });
    await flush();
    file.state.size += 1;
    resume();
    await flush();

    expect(sent).toContainEqual(expect.objectContaining({ requestId: 2, code: 'source_changed' }));
    expect(sent).not.toContainEqual({ type: 'done', requestId: 2 });
  });

  it('stops streaming a cancelled or closed request without answering it', async () => {
    const { bridge, sent, pause, resume } = setup(patterned(FILE_PREVIEW_CHUNK_BYTES * 3));
    bridge.handle({ type: 'open', requestId: 1 });
    pause();
    bridge.handle({
      type: 'read',
      requestId: 2,
      documentId: 0,
      offset: 0,
      length: FILE_PREVIEW_CHUNK_BYTES * 3,
    });
    await flush();
    bridge.handle({ type: 'cancel', requestId: 2 });
    resume();
    await flush();

    expect(sent.filter((message) => message.type === 'chunk')).toHaveLength(1);
    expect(
      sent.filter((message) => 'requestId' in message && message.requestId === 2),
    ).toHaveLength(1);
  });

  it('serves PDF resources from the bundled index', async () => {
    const { bridge, sent } = setup(patterned(4), Uint8Array.from([9, 9, 1, 2, 3, 9]));
    bridge.handle({ type: 'resource', requestId: 1, kind: 'cmap', name: 'UniGB-UCS2-H' });
    bridge.handle({ type: 'resource', requestId: 2, kind: 'standard_font', name: 'Missing.pfb' });
    await flush();

    expect(decode(sent, 1)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(sent).toContainEqual(expect.objectContaining({ requestId: 2, code: 'load_error' }));
  });
});
