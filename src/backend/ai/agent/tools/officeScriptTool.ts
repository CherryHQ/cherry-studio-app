import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  OfficeGenerationError,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  OFFICE_SCRIPT_MAX_INPUT_BYTES,
  runOfficeScript,
  type OfficeFormat,
  type OfficeScriptInput,
} from '@/backend/services/office';
import { FileEntryIdSchema, filenameExtension, SafeNameSchema } from '@/shared/data/types/file';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { officeOperationSlots, type OfficeFiles } from './officeToolResources';
import { officeToolOutputSchemas } from './officeToolResults';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export const RUN_OFFICE_SCRIPT_TOOL_NAME = 'run_office_script';

const schema = z.strictObject({
  filename: SafeNameSchema.describe(
    'Plain filename ending in .docx, .xlsx or .pptx; the extension selects the library and names any output.',
  ),
  code: z
    .string()
    .min(1)
    .describe('Body of an async JavaScript function that returns the finished file.'),
  inputs: z
    .array(FileEntryIdSchema)
    .max(8)
    .optional()
    .describe(
      'Managed file ids from conversation attachments or the selected workspace, exposed as inputs[id].',
    ),
});

const formats = Object.keys(OFFICE_MEDIA_TYPES) as OfficeFormat[];

export function createOfficeScriptTool(
  sandbox: JsSandbox,
  files: OfficeFiles,
  access: Pick<WorkspaceFileAccess, 'resolveRead' | 'folderId'>,
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: RUN_OFFICE_SCRIPT_TOOL_NAME },
    providerName: RUN_OFFICE_SCRIPT_TOOL_NAME,
    displayName: 'Run Office script',
    description: `Write JavaScript against pinned Office libraries to produce a NEW .docx, .xlsx or .pptx file, for layouts and operations the create_* and edit_* tools cannot express. Prefer those tools when they suffice.
Globals by output extension: docx = the docx 9.11 module (Document, Paragraph, TextRun, Table, ImageRun, Packer, patchDocument, ...); PptxGenJS = pptxgenjs 4.0 constructor; XLSX = SheetJS CE 0.20.3 mini (cell objects take f for formulas). Nothing calculates formulas, so also store each computed result: v beside f in SheetJS, or <v> after <f> in sheet XML; otherwise previews show blank cells. Always: zip = fflate 0.8 (unzipSync, zipSync, strFromU8, strToU8), xml = @xmldom/xmldom 0.9 (DOMParser, XMLSerializer), atob, btoa, and inputs[id] = { name, mediaType, base64, bytes } for each id listed in inputs. There is no DOM, Node API, network, timer, fetch or file path.
Return the file as a base64 string, Uint8Array or ArrayBuffer, or return nothing to only inspect inputs (console.log output comes back as logs and no file is saved): return docx.Packer.toBase64String(doc); return pres.write({ outputType: 'base64' }); return XLSX.write(book, { bookType: 'xlsx', type: 'base64' }); return zip.zipSync(parts). Images: new docx.ImageRun({ type: 'png', data: inputs[id].bytes, transformation: { width, height } }); slide.addImage({ data: 'data:image/png;base64,' + inputs[id].base64, x, y, w, h }).
To change an existing file without losing untouched parts, unzip inputs[id].bytes, edit its XML parts and zip it again, or use docx.patchDocument({ outputType: 'base64', data: inputs[id].bytes, patches }) for {{key}} placeholders. SheetJS read/write drops styles, images and charts, and PptxGenJS cannot open files.
Inputs together must fit 6 MiB and the output 4 MiB; a run gets 30 seconds and 64 MiB. Saves in the selected workspace, or at the library root without a workspace, and never overwrites a source. Success is status "created" with fileEntryId and any console.log output (16 KiB) as logs, or status "read" with logs when nothing was returned; status "error" carries the script error to fix before retrying.`,
    inputSchema: toRuntimeInputSchema(schema),
    outputSchema: officeToolOutputSchemas[RUN_OFFICE_SCRIPT_TOOL_NAME],
    approval: 'auto',
    deferred: true,
    async execute({ input, signal }) {
      signal.throwIfAborted();
      if (new TextEncoder().encode(JSON.stringify(input)).length > OFFICE_MAX_INPUT_BYTES)
        return invalid('Input exceeds 128 KiB. Shorten the script.');
      const parsed = schema.safeParse(input);
      if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      const format = formats.find((format) => format === filenameExtension(parsed.data.filename));
      if (!format) return invalid('Use a plain filename ending in .docx, .xlsx or .pptx.');
      const ids = [...new Set(parsed.data.inputs ?? [])];
      // Authorize every input before reading any bytes.
      for (const id of ids) {
        signal.throwIfAborted();
        await access.resolveRead({ file_entry_id: id });
      }

      const release = await officeOperationSlots.acquire(signal);
      let nativeSettled = true;
      let finished = false;
      try {
        const facts = await files.resolveAvailable(ids);
        signal.throwIfAborted();
        let total = 0;
        for (const id of ids) {
          const size = facts.get(id)?.size ?? 0;
          if (!Number.isSafeInteger(size) || size <= 0)
            return invalid(`Input ${id} is unavailable.`);
          total += size;
        }
        if (total > OFFICE_SCRIPT_MAX_INPUT_BYTES)
          return invalid('Inputs exceed 6 MiB. Use fewer or smaller files.');
        const inputs: Record<string, OfficeScriptInput> = {};
        for (const id of ids) {
          const fact = facts.get(id)!;
          const data = await files.readAsBytes(fact, signal);
          signal.throwIfAborted();
          if (!data || data.length !== fact.size)
            return invalid(`Input ${id} changed or is unavailable.`);
          inputs[id] = { name: fact.name, mediaType: fact.mediaType, data };
        }
        nativeSettled = false;
        const { data, logs } = await runOfficeScript({
          format,
          script: parsed.data.code,
          inputs,
          sandbox,
          signal,
          onSettled: () => {
            nativeSettled = true;
            if (finished) release();
          },
        });
        signal.throwIfAborted();
        if (!data) return { value: { status: 'read', logs }, artifacts: [] };
        const entry = await files.createBytesEntry(
          {
            data,
            name: parsed.data.filename,
            mediaType: OFFICE_MEDIA_TYPES[format],
            provenance: 'generated',
            folderId: access.folderId,
            workspaceFolderId: access.folderId,
          },
          signal,
        );
        return {
          value: {
            status: 'created',
            fileEntryId: entry.id,
            filename: entry.filename,
            mediaType: entry.mediaType,
            size: entry.size,
            ...(logs ? { logs } : {}),
          },
          artifacts: [
            {
              ref: { kind: 'managed-file', fileEntryId: entry.id },
              mediaType: entry.mediaType,
              name: entry.filename,
              kind: 'created',
            },
          ],
        };
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof OfficeGenerationError) return invalid(error.message);
        throw error;
      } finally {
        finished = true;
        if (nativeSettled) release();
      }
    },
  };
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
