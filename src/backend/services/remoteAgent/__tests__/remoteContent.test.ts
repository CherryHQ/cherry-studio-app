import { fromByteArray } from 'base64-js';

import { decodeContent, integrity, readContent, type AgentRequest } from '../remoteContent';

function fixture(change?: (value: any) => void) {
  const bytes = new TextEncoder().encode('你好🙂');
  const ref = {
    contentId: 'content',
    revision: '4',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'text/plain',
  };
  const request = jest.fn(async (_method, params) => {
    const offset = Number(params.offset);
    const chunk = bytes.slice(offset, offset + 2);
    const page = {
      contentId: 'content',
      revision: '4',
      offset: params.offset,
      nextOffset: String(offset + chunk.length),
      dataBase64: fromByteArray(chunk),
      sha256: ref.sha256,
      eof: offset + chunk.length === bytes.length,
    };
    change?.(page);
    return page;
  });
  return { ref, request: request as unknown as AgentRequest };
}
it('decodes split multibyte text only after validating all pages', async () => {
  const { ref, request } = fixture();
  expect(decodeContent(await readContent(request, 's', ref))).toBe('你好🙂');
});
it.each(['offset', 'revision', 'sha256', 'nextOffset'])('rejects mismatched %s', async (field) => {
  const { ref, request } = fixture((page) => {
    page[field] = 'invalid';
  });
  await expect(readContent(request, 's', ref)).rejects.toThrow('PROTOCOL_ERROR');
});
it('does not read after cancellation', async () => {
  const { ref, request } = fixture();
  const abort = new AbortController();
  abort.abort();
  await expect(readContent(request, 's', ref, abort.signal)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
