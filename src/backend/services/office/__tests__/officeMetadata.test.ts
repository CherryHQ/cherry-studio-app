import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import { AiContentLabelSchema } from '@/shared/data/types/aiContent';

import { createOfficeCode } from '../createOfficeCode';
import { processOfficeMetadata } from '../officeMetadata';
import type { OfficeRequest } from '../officeSpec';
import { runOfficeJob, runOfficeJobSync } from './_officeJob';

const label = AiContentLabelSchema.parse({
  Label: '1',
  ContentProducer: 'ProviderExample',
  ProduceID: 'content-1',
  ReservedCode1: '',
  ContentPropagator: 'RelayExample',
  PropagateID: 'relay-1',
  ReservedCode2: '',
});
const edited = { ...label, ProduceID: 'content-2', PropagateID: 'relay-2' };

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
    const clearer = sandboxFor(stored);
    await processOfficeMetadata({
      uri: 'file:///stored',
      size: stored.length,
      format: request.format,
      output: 'file:///cleared',
      label: null,
      sandbox: clearer.sandbox,
    });
    const cleared = unzipSync(clearer.output());
    expect(strFromU8(cleared['docProps/custom.xml'])).toContain('name="Authored"');
    expect(strFromU8(cleared['docProps/custom.xml'])).not.toContain('name="AIGC"');
    for (const [path, bytes] of Object.entries(parts))
      if (path !== 'docProps/custom.xml') expect(cleared[path]).toEqual(bytes);
    const unlabelled = sandboxFor(input);
    await processOfficeMetadata({
      uri: 'file:///input',
      size: input.length,
      format: request.format,
      output: 'file:///copy',
      label: null,
      sandbox: unlabelled.sandbox,
    });
    expect(unlabelled.output()).toEqual(input);
  },
);

test.each([true, false])(
  'normalizes UTF-16 metadata XML with littleEndian=%s to matching UTF-8',
  async (little) => {
    const request = requests[0];
    const generated = (await runOfficeJob(createOfficeCode(request, {}))).output!;
    const parts = unzipSync(generated);
    parts['docProps/custom.xml'] = strToU8(
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="9" name="Authored"><vt:lpwstr>原文 😀</vt:lpwstr></property></Properties>',
    );
    const source = zipSync(parts);
    const initial = sandboxFor(source);
    await processOfficeMetadata({
      uri: 'file:///source',
      size: source.length,
      format: request.format,
      output: 'file:///labeled',
      label,
      sandbox: initial.sandbox,
    });
    const labeled = unzipSync(initial.output());
    const metadataParts = ['docProps/custom.xml', '[Content_Types].xml', '_rels/.rels'];
    for (const path of metadataParts) {
      const text =
        '<?xml version="1.0" encoding="UTF-16" standalone="yes"?>\n' +
        strFromU8(labeled[path]).replace(/^<\?xml[^?]*\?>\s*/, '');
      const bytes = Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, 'utf16le')]);
      if (!little) bytes.swap16();
      labeled[path] = new Uint8Array(bytes);
    }
    const input = zipSync(labeled);
    for (const next of [edited, null]) {
      const worker = sandboxFor(input);
      await processOfficeMetadata({
        uri: 'file:///utf16',
        size: input.length,
        format: request.format,
        output: 'file:///updated',
        label: next,
        sandbox: worker.sandbox,
      });
      const output = worker.output();
      const updated = unzipSync(output);
      for (const path of next ? metadataParts : ['docProps/custom.xml']) {
        const xml = strFromU8(updated[path]);
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true);
        expect(updated[path].includes(0)).toBe(false);
        expect(xml).not.toContain('encoding="UTF-16"');
      }
      expect(strFromU8(updated['docProps/custom.xml'])).toContain('原文 😀');
      const reader = sandboxFor(output);
      expect(
        await processOfficeMetadata({
          uri: 'file:///updated',
          size: output.length,
          format: request.format,
          sandbox: reader.sandbox,
        }),
      ).toMatchObject({ label: next });
    }
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
