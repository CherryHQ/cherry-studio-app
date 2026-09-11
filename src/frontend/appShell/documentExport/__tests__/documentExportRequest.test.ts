import type { DocumentExportSession } from '@/shared/contracts/documentExport';

import { createDocumentExportRequest, finishDocumentExportRequest } from '../documentExportRequest';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'request' }));

function session(dispose = jest.fn(async () => {})) {
  return {
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
  const request = createDocumentExportRequest(checked, 'markdown', {
    label: 'Include thinking',
    uncheckedSession: unchecked,
  })!;
  const closing = finishDocumentExportRequest(request.id);
  expect(checked.dispose).toHaveBeenCalledTimes(1);
  expect(unchecked.dispose).toHaveBeenCalledTimes(1);
  expect(createDocumentExportRequest(session(), 'markdown')).toBeUndefined();
  finish();
  await closing;
  await request.outcome;
  const next = createDocumentExportRequest(session(), 'markdown')!;
  expect(next).toBeDefined();
  await finishDocumentExportRequest(next.id);
});
