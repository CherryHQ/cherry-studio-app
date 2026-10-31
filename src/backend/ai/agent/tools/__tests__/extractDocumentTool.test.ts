import type { DocumentExtractionResult } from '@/shared/contracts/documentExtraction';

import type { RuntimeJsonValue, RuntimeTool } from '../../runtime';
import { createExtractDocumentTool } from '../extractDocumentTool';
import type { WorkspaceFileAccess } from '../workspaceFileAccess';

jest.mock('@/backend/services/file/fileTextExtraction', () => ({ linkFileOcr: () => () => {} }));

const ID = '00000000-0000-7000-8000-000000000001';
const source: DocumentExtractionResult = {
  source: { fileEntryId: ID, revision: 1, filename: 'receipt.png', sha256: 'source-hash' },
  task: 'fields',
  version: 'v1',
  status: 'complete',
  warnings: [],
  units: [
    {
      engine: 'xiaomi',
      status: 'complete',
      location: {},
      text: 'unrequested text',
      raw: 'unrequested raw',
      fields: { number: '0012', amount: '12.00' },
      tables: [],
      formulas: [],
    },
  ],
};
const input = { file_entry_id: ID, task: 'fields', fields: ['number', 'amount'] };

function setup(result = source) {
  const resolveRead = jest.fn(async () => ID);
  const resolveAvailable = jest.fn(
    async () =>
      new Map([
        [
          ID,
          {
            fileEntryId: ID,
            revision: 1,
            name: 'receipt.png',
            mediaType: 'image/png',
            size: 12,
          },
        ],
      ]),
  );
  const extractDocument = jest.fn(async () => result);
  const tool = createExtractDocumentTool({ resolveAvailable, extractDocument }, {
    resolveRead,
  } as unknown as WorkspaceFileAccess);
  return { tool, resolveRead, resolveAvailable, extractDocument };
}
function execute(tool: RuntimeTool, input: RuntimeJsonValue) {
  return tool.execute({
    input,
    signal: new AbortController().signal,
    toolCallId: 'call',
    turnId: 'turn',
  });
}

test('checks live authorization before accessing a source, including cached continuations', async () => {
  const { tool, resolveRead, resolveAvailable, extractDocument } = setup();
  await execute(tool, input);
  resolveAvailable.mockClear();
  extractDocument.mockClear();
  resolveRead.mockRejectedValueOnce(new Error('not authorized'));
  expect(await execute(tool, { ...input, offset: 1 })).toMatchObject({
    value: { status: 'error' },
  });
  expect(resolveAvailable).not.toHaveBeenCalled();
  expect(extractDocument).not.toHaveBeenCalled();
});

test('projects only requested fields and returns no image pixels or created files', async () => {
  const { tool } = setup();
  const result = await execute(tool, input);
  expect(result).toEqual({
    value: {
      status: 'ok',
      format: 'json',
      complete: true,
      data: {
        ...source,
        units: [
          {
            engine: 'xiaomi',
            status: 'complete',
            location: {},
            fields: { number: '0012', amount: '12.00' },
          },
        ],
      },
    },
    artifacts: [],
  });
});

test('large raw results round-trip through bounded Unicode JSON fragments without rerunning extraction', async () => {
  const raw = '中文🍒\\"\n'.repeat(20_000);
  const { tool, extractDocument } = setup({ ...source, units: [{ ...source.units[0]!, raw }] });
  const parts: string[] = [];
  for (let offset: number | null = 0; offset !== null;) {
    const result = await execute(tool, { ...input, include_raw: true, offset });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(50 * 1024);
    expect(result.value).toMatchObject({ status: 'ok', format: 'json-fragment' });
    const value = result.value as { text: string; nextOffset: number | null };
    parts.push(value.text);
    offset = value.nextOffset;
  }
  expect(JSON.parse(parts.join('')).units[0].raw).toBe(raw);
  expect(extractDocument).toHaveBeenCalledTimes(1);
});

test('rejects invalid task combinations before file access', async () => {
  const { tool, resolveRead } = setup();
  expect(await execute(tool, { file_entry_id: ID, task: 'question' })).toMatchObject({
    value: { status: 'error' },
  });
  expect(resolveRead).not.toHaveBeenCalled();
});
