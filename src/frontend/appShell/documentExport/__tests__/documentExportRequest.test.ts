import type { DocumentExportSession } from '@/shared/contracts/documentExport';

import {
  createDocumentExportRequest,
  finishDocumentExportRequest,
  getDocumentExportRequest,
} from '../documentExportRequest';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));

function session(dispose = jest.fn(async () => {})) {
  return {
    document: { sections: [] },
    markdown: 'Content',
    render: jest.fn(),
    save: jest.fn(),
    dispose,
  } satisfies DocumentExportSession;
}

test('closing a preview disposes both option snapshots before admitting the next request', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((done) => {
    finish = done;
  });
  const checked = session();
  const unchecked = session(jest.fn(() => pending));
  const request = createDocumentExportRequest({
    session: checked,
    initialFormat: 'markdown',
    option: {
      label: 'Include thinking',
      uncheckedSession: unchecked,
    },
  })!;
  const closing = finishDocumentExportRequest(request.id);
  expect(checked.dispose).toHaveBeenCalledTimes(1);
  expect(unchecked.dispose).toHaveBeenCalledTimes(1);
  expect(
    createDocumentExportRequest({ session: session(), initialFormat: 'markdown' }),
  ).toBeUndefined();
  finish();
  await closing;
  await request.outcome;
  const next = createDocumentExportRequest({ session: session(), initialFormat: 'markdown' })!;
  expect(next).toBeDefined();
  await finishDocumentExportRequest(next.id);
});

test('a document-only request replaces an unsupported image default with HTML', async () => {
  const request = createDocumentExportRequest({
    session: session(),
    initialFormat: 'image',
    allowedFormats: ['html', 'markdown'],
    watermark: 'none',
  })!;
  expect(getDocumentExportRequest(request.id)).toMatchObject({
    initialFormat: 'html',
    allowedFormats: ['html', 'markdown'],
    watermark: 'none',
  });
  await finishDocumentExportRequest(request.id);
  const next = createDocumentExportRequest({ session: session(), initialFormat: 'image' })!;
  expect(getDocumentExportRequest(next.id)).toMatchObject({
    initialFormat: 'image',
    allowedFormats: ['markdown', 'html', 'image'],
    watermark: 'cherry',
  });
  await finishDocumentExportRequest(next.id);
});
