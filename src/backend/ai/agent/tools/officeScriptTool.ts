import * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';
import {
  OfficeGenerationError,
  OFFICE_MAX_FILE_BYTES,
  OFFICE_MAX_IMAGES,
  OFFICE_MAX_INPUT_BYTES,
  OFFICE_MEDIA_TYPES,
  OFFICE_SCRIPT_MAX_INPUT_BYTES,
  runOfficeScript,
  type OfficeFormat,
  type OfficeScriptInput,
} from '@/backend/services/office';
import { FileEntryIdSchema, filenameExtension, SafeNameSchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../runtime';
import {
  mebibytes,
  officeFailure as invalid,
  prepareOfficeImages,
  startOfficeOperation,
  type OfficeFiles,
} from './officeToolResources';
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
    .max(OFFICE_MAX_IMAGES)
    .optional()
    .describe(
      'Managed file ids from conversation attachments, generated images or the selected workspace, exposed as inputs[id].',
    ),
  against_file_entry_id: FileEntryIdSchema.optional().describe(
    'Untouched original of the same format when editing. It is included in inputs automatically; output validation rejects newly introduced package errors.',
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
    description: `Run JavaScript with pinned Office libraries to read, analyze or produce .docx, .xlsx and .pptx files: parse whole inputs in one run (XLSX.read(inputs[id].bytes, { type: 'array' }) for every sheet and row), then return nothing to get console.log output, or return a NEW file. Use it for large workbooks, for adding pictures to existing files, and for layouts and operations the create_* and edit_* tools cannot express; prefer those tools for small edits.
Globals by output extension: docx = the docx 9.11 module (Document, Paragraph, TextRun, Table, ImageRun, Packer, patchDocument, ...); PptxGenJS = pptxgenjs 4.0 constructor; XLSX = SheetJS CE 0.20.3 mini (cell objects take f for formulas). Nothing calculates formulas, so also store each computed result: v beside f in SheetJS, or <v> after <f> in sheet XML; otherwise previews show blank cells. Always: zip = fflate 0.8 (unzipSync, zipSync, strFromU8, strToU8; zipSync stores already-compressed media), xml = @xmldom/xmldom 0.9 (DOMParser, XMLSerializer), atob, btoa, and inputs[id] = { name, mediaType, size, bytes, base64 } for each id listed in inputs; bytes and base64 are read on first use. There is no DOM, Node API, network, timer, fetch or file path.
Return the file as a Uint8Array, ArrayBuffer or base64 string, or return nothing to only inspect inputs (console.log output comes back as logs and no file is saved): return docx.Packer.toArrayBuffer(doc); return pres.write({ outputType: 'uint8array' }); return XLSX.write(book, { bookType: 'xlsx', type: 'array' }); return zip.zipSync(parts). Images: new docx.ImageRun({ type: inputs[id].mediaType === 'image/png' ? 'png' : 'jpg', data: inputs[id].bytes, transformation: { width, height } }); slide.addImage({ data: 'data:' + inputs[id].mediaType + ';base64,' + inputs[id].base64, x, y, w, h }).
Image inputs are existing files (attachments, generated images, workspace files): never regenerate an image to place it. Any image format is accepted; large or non-PNG/JPEG images arrive as a compressed JPEG copy, so read inputs[id].mediaType. To add a picture to an existing file, unzip it, add the media part, its relationship, a content type and the picture XML, then zip it again.
To change an existing file without losing untouched parts, pass its id as against_file_entry_id, unzip inputs[id].bytes, edit its XML parts with xml.DOMParser and XMLSerializer and zip it again, or use docx.patchDocument({ outputType: 'uint8array', data: inputs[id].bytes, patches }) for {{key}} placeholders. Never splice XML strings. Output package checks reject new XML, content-type, relationship and id errors before publication; inspect_office_file kind "check" returns the findings. SheetJS read/write drops styles, images and charts, and PptxGenJS cannot open files.
Up to ${OFFICE_MAX_IMAGES} inputs, together ${mebibytes(OFFICE_SCRIPT_MAX_INPUT_BYTES)} after image compression; the output is limited to ${mebibytes(OFFICE_MAX_FILE_BYTES)}. Memory grows with the files a run reads: avoid extra copies of large inputs. Saves in the selected workspace, or at the library root without a workspace, and never overwrites a source. Success is status "created" with fileEntryId and any console.log output (16 KiB) as logs, or status "read" with logs when nothing was returned. A failed run returns the script error to fix before retrying; in Code Mode it throws. A size or memory failure is not fixed by rewriting the same work: split it across runs.`,
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
      const againstId = parsed.data.against_file_entry_id;
      const ids = [...new Set([...(parsed.data.inputs ?? []), ...(againstId ? [againstId] : [])])];
      if (ids.length > OFFICE_MAX_IMAGES) return invalid('Use at most 50 distinct inputs.');
      // Authorize every input before reading any bytes.
      for (const id of ids) {
        signal.throwIfAborted();
        await access.resolveRead({ file_entry_id: id });
      }

      const operation = await startOfficeOperation(files, signal);
      try {
        const facts = await files.resolveAvailable(ids);
        signal.throwIfAborted();
        if (againstId && facts.get(againstId)?.mediaType !== OFFICE_MEDIA_TYPES[format])
          return invalid('The comparison must be an available Office file of the output format.');
        const images = await prepareOfficeImages(
          ids.filter((id) => facts.get(id)?.mediaType.startsWith('image/')),
          files,
          operation,
          signal,
        );
        const inputs: Record<string, OfficeScriptInput> = {};
        let total = 0;
        for (const id of ids) {
          const fact = facts.get(id);
          const image = images[id];
          const uri = image?.uri ?? (fact && files.localUri(fact));
          const size = image?.size ?? (uri ? files.size(uri) : undefined);
          if (!fact || !uri || !size) return invalid(`Input ${id} is unavailable.`);
          total += size;
          inputs[id] = {
            name: fact.name,
            mediaType: image?.mediaType ?? fact.mediaType,
            uri,
            size,
          };
        }
        if (total > OFFICE_SCRIPT_MAX_INPUT_BYTES)
          return invalid(
            `The inputs total ${mebibytes(total)}, over the ${mebibytes(OFFICE_SCRIPT_MAX_INPUT_BYTES)} one run can read. Use fewer files per run.`,
          );
        const output = operation.output(format);
        const { size, logs } = await runOfficeScript({
          format,
          script: parsed.data.code,
          inputs,
          againstId,
          output,
          sandbox,
          signal,
          onSettled: operation.job(),
        });
        signal.throwIfAborted();
        if (size === null) return { value: { status: 'read', logs }, artifacts: [] };
        const entry = await files.createFileEntry(
          {
            uri: output,
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
        operation.finish();
      }
    },
  };
}
