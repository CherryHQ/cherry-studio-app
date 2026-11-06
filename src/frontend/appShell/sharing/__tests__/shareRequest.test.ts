import type { DocumentExportSession } from '@/shared/contracts/documentExport';

import {
  createDocumentShareRequest,
  finishShareRequest,
  getShareRequest,
  retainShareOperation,
  registerShareCleanup,
} from '../shareRequest';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));

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
