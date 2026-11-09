import type { DocumentExportSession } from '@/shared/contracts/documentExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import {
  createDocumentShareRequest,
  createFileShareRequest,
  finishShareRequest,
  getShareRequest,
  retainShareOperation,
  registerShareCleanup,
} from '../shareRequest';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));

test('keeps library file shares on their frozen originals while other callers retain conversion', async () => {
  const entry = FileEntrySchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    filename: 'report.html',
    mediaType: 'text/html',
    provenance: 'generated',
    size: 1024,
    createdAt: 1,
    updatedAt: 2,
  });
  const files = [{ entry, uri: 'file:///library/report.html' }];
  const libraryRequest = createFileShareRequest(files, 'cherry', false)!;
  entry.filename = 'renamed.html';
  expect(getShareRequest(libraryRequest.id)).toMatchObject({
    kind: 'files',
    allowConversion: false,
    files: [{ uri: 'file:///library/report.html', entry: { filename: 'report.html' } }],
  });
  await finishShareRequest(libraryRequest.id);
  const viewerRequest = createFileShareRequest(files, 'cherry')!;
  expect(getShareRequest(viewerRequest.id)).toMatchObject({ allowConversion: true });
  await finishShareRequest(viewerRequest.id);
});

function session(dispose = jest.fn(async () => {})) {
  return {
    document: { sections: [] },
    markdown: 'Content',
    previewDocument: () => '<p>Content</p>',
    previewMarkdown: () => '<p>Content</p>',
    render: jest.fn(),
    save: jest.fn(),
    dispose,
  } satisfies DocumentExportSession;
}

test('closing waits for physical delivery and disposal before admitting the next request', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((done) => {
    finish = done;
  });
  let started!: () => void;
  const disposing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const checked = session(
    jest.fn(() => {
      started();
      return pending;
    }),
  );
  let finishCopy!: () => void;
  const copy = new Promise<void>((resolve) => {
    finishCopy = resolve;
  });
  const request = createDocumentShareRequest({
    session: checked,
    initialFormat: 'markdown',
  })!;
  retainShareOperation(request.id, copy);
  const closing = finishShareRequest(request.id);
  expect(checked.dispose).not.toHaveBeenCalled();
  expect(
    createDocumentShareRequest({ session: session(), initialFormat: 'markdown' }),
  ).toBeUndefined();
  finishCopy();
  await copy;
  await disposing;
  expect(checked.dispose).toHaveBeenCalledTimes(1);
  finish();
  await closing;
  await request.outcome;
  const next = createDocumentShareRequest({ session: session(), initialFormat: 'markdown' })!;
  expect(next).toBeDefined();
  await finishShareRequest(next.id);
});

test('temporary source cleanups finish before the request resolves', async () => {
  let release!: () => void;
  let started!: () => void;
  const cleaning = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cleanup = jest.fn(() => {
    started();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const request = createDocumentShareRequest({ session: session(), initialFormat: 'image' })!;
  registerShareCleanup(request.id, cleanup);
  const closing = finishShareRequest(request.id);
  await cleaning;
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(
    createDocumentShareRequest({ session: session(), initialFormat: 'image' }),
  ).toBeUndefined();
  release();
  await closing;
});

test('a document-only request replaces an unsupported image default with HTML', async () => {
  const request = createDocumentShareRequest({
    session: session(),
    initialFormat: 'image',
    allowedFormats: ['html', 'markdown'],
    watermark: 'none',
  })!;
  expect(getShareRequest(request.id)).toMatchObject({
    initialFormat: 'html',
    allowedFormats: ['html', 'markdown'],
    watermark: 'none',
  });
  await finishShareRequest(request.id);
  const next = createDocumentShareRequest({ session: session(), initialFormat: 'image' })!;
  expect(getShareRequest(next.id)).toMatchObject({
    initialFormat: 'image',
    allowedFormats: ['markdown', 'html', 'image'],
    watermark: 'cherry',
  });
  await finishShareRequest(next.id);
});
