import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import { createAiContent } from '@/shared/data/types/aiContent';

import { createOfficeCode } from '../createOfficeCode';
import { processOfficeMetadata } from '../officeMetadata';
import type { OfficeRequest } from '../officeSpec';
import { runOfficeJob, runOfficeJobSync } from './_officeJob';

const label = createAiContent('ProviderExample', 'content-1').label!;
const edited = createAiContent('ProviderExample', 'content-2').label!;

function sandboxFor(source: Uint8Array) {
  let output: Uint8Array | undefined;
  const sandbox: JsSandbox = {
    files: true,
    async run({ code, onSettled }) {
      try {
        const result = runOfficeJobSync(code, [source]);
        output = result.output;
        return {
          status: 'ok',
          result: JSON.stringify(result.value),
          durationMs: 0,
          logs: '',
          logsTruncated: false,
        };
      } finally {
        onSettled?.();
      }
    },
  };
  return { sandbox, output: () => output! };
}
const requests: OfficeRequest[] = [
  {
    format: 'docx',
    filename: 'report.docx',
    spec: { version: 1, blocks: [{ type: 'paragraph', text: '原文 😀' }] },
  },
  {
    format: 'xlsx',
    filename: 'data.xlsx',
    spec: { version: 1, sheets: [{ name: 'Data', rows: [['原文 😀', 7]] }] },
  },
  {
    format: 'pptx',
    filename: 'deck.pptx',
    spec: { version: 1, slides: [{ type: 'title', title: '原文 😀' }] },
  },
];

test.each(requests)(
  'writes a discoverable $format custom property while preserving all content parts',
  async (request) => {
    const generated = (await runOfficeJob(createOfficeCode(request, {}))).output!;
    const original = unzipSync(generated);
    // Keep an unrelated custom property as well as the original app/core properties and content.
    const CUSTOM = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
    const VT = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
    original['docProps/custom.xml'] = strToU8(
      `<Properties xmlns="${CUSTOM}" xmlns:vt="${VT}"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="9" name="Authored"><vt:lpwstr>keep</vt:lpwstr></property></Properties>`,
    );
    const input = zipSync(original);
    const worker = sandboxFor(input);
    await expect(
      processOfficeMetadata({
        uri: 'file:///input',
        size: input.length,
        format: request.format,
        output: 'file:///output',
        label,
        sandbox: worker.sandbox,
      }),
    ).resolves.toEqual({ label, size: expect.any(Number) });
    const stored = worker.output();
    const parts = unzipSync(stored);
    for (const [path, bytes] of Object.entries(original)) {
      if (!['docProps/custom.xml', '[Content_Types].xml', '_rels/.rels'].includes(path))
        expect(parts[path]).toEqual(bytes);
    }
    const custom = strFromU8(parts['docProps/custom.xml']);
    expect(custom).toContain('name="Authored"');
    expect(custom).toContain('name="AIGC"');
    expect(custom).toContain('pid="10"');
    expect(custom).toContain('content-1');
    expect(strFromU8(parts['[Content_Types].xml'])).toContain('/docProps/custom.xml');
    expect(strFromU8(parts['_rels/.rels'])).toContain('relationships/custom-properties');
    const reader = sandboxFor(stored);
    await expect(
      processOfficeMetadata({
        uri: 'file:///stored',
        size: stored.length,
        format: request.format,
        sandbox: reader.sandbox,
      }),
    ).resolves.toMatchObject({ label });
    expect(reader.output()).toBeUndefined();
    const writer = sandboxFor(stored);
    await processOfficeMetadata({
      uri: 'file:///stored',
      size: stored.length,
      format: request.format,
      output: 'file:///updated',
      label: edited,
      sandbox: writer.sandbox,
    });
    const replaced = strFromU8(unzipSync(writer.output())['docProps/custom.xml']);
    expect(replaced.match(/name="AIGC"/g)).toHaveLength(1);
    expect(replaced).not.toContain('content-1');
    expect(replaced).toContain('content-2');
  },
);

test('retains file lifetime until a cancelled native metadata job has actually settled', async () => {
  let finish!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const controller = new AbortController();
  const sandbox: JsSandbox = {
    files: true,
    async run({ onSettled }) {
      finish = () => onSettled?.();
      started();
      controller.abort();
      return {
        status: 'error',
        kind: 'cancelled',
        message: 'Cancelled',
        durationMs: 0,
        logs: '',
        logsTruncated: false,
      };
    },
  };
  let completed = false;
  const pending = processOfficeMetadata({
    uri: 'file:///input',
    size: 1,
    format: 'docx',
    sandbox,
    signal: controller.signal,
  }).finally(() => {
    completed = true;
  });
  await ready;
  await Promise.resolve();
  expect(completed).toBe(false);
  finish();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
