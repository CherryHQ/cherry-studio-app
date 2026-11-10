import { createJsSandbox, type JsSandbox } from '@/backend/services/jsSandbox';
import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';

import { officeLimits } from './generateOfficeFile';
import { officePackageRuntimeCode } from './officePackageCode';
import type { OfficeFormat } from './officeSpec';

const metadataCode = String.raw`
const filePort = globalThis.__files;
delete globalThis.__files;
const source = new Uint8Array(filePort.read(0));
const { parts } = readOfficePackage(source);
const CUSTOM = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const VT = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const customType = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
const customRelationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
const propertyPath = 'docProps/custom.xml';
const document = (path, initial) => {
  const bytes = parts[path];
  if (bytes && bytes.length > 262144) throw new Error('Oversized Office metadata part.');
  const text = bytes ? decodeOfficeXml(bytes) : initial;
  if (!text || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Invalid Office metadata XML.');
  return new xml.DOMParser({ onError: (level, message) => {
    if (level !== 'warning') throw new Error('Invalid Office metadata: ' + message);
  }}).parseFromString(text, 'application/xml');
};
const properties = document(propertyPath, '<Properties xmlns="' + CUSTOM + '" xmlns:vt="' + VT + '"/>');
if (properties.documentElement.namespaceURI !== CUSTOM)
  throw new Error('Invalid custom-properties namespace.');
const existing = Array.from(properties.getElementsByTagNameNS(CUSTOM, 'property'))
  .filter(property => property.getAttribute('name') === 'AIGC');
const labels = existing.map(property => JSON.parse(property.textContent));
if (incomingLabel === null) return { labels, size: source.length };
for (const property of existing) property.parentNode.removeChild(property);
const ids = Array.from(properties.getElementsByTagNameNS(CUSTOM, 'property'))
  .map(property => Number(property.getAttribute('pid'))).filter(Number.isFinite);
const property = properties.createElementNS(CUSTOM, 'property');
property.setAttribute('name', 'AIGC');
property.setAttribute('fmtid', '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}');
property.setAttribute('pid', String(Math.max(1, ...ids) + 1));
const value = properties.createElementNS(VT, 'vt:lpwstr');
value.appendChild(properties.createTextNode(JSON.stringify(incomingLabel)));
property.appendChild(value);
properties.documentElement.appendChild(property);
const types = document('[Content_Types].xml');
let contentType = Array.from(types.getElementsByTagNameNS(CT, 'Override'))
  .find(element => element.getAttribute('PartName') === '/' + propertyPath);
if (!contentType) {
  contentType = types.createElementNS(CT, 'Override');
  contentType.setAttribute('PartName', '/' + propertyPath);
  types.documentElement.appendChild(contentType);
}
contentType.setAttribute('ContentType', customType);
const relationships = document('_rels/.rels', '<Relationships xmlns="' + REL + '"/>');
const relations = Array.from(relationships.getElementsByTagNameNS(REL, 'Relationship'));
const custom = relations.filter(element => element.getAttribute('Type') === customRelationship);
if (custom.length > 1 || custom.some(element =>
  ![propertyPath, '/' + propertyPath].includes(element.getAttribute('Target'))
  || element.getAttribute('TargetMode') === 'External'))
  throw new Error('Unsupported custom-properties relationship.');
if (!custom.length) {
  const relationship = relationships.createElementNS(REL, 'Relationship');
  let index = 1;
  while (relations.some(element => element.getAttribute('Id') === 'rIdAigc' + index)) index++;
  relationship.setAttribute('Id', 'rIdAigc' + index);
  relationship.setAttribute('Type', customRelationship);
  relationship.setAttribute('Target', propertyPath);
  relationships.documentElement.appendChild(relationship);
}
const serializer = new xml.XMLSerializer();
for (const [path, doc] of [[propertyPath, properties], ['[Content_Types].xml', types], ['_rels/.rels', relationships]]) {
  parts[path] = new TextEncoder().encode(serializer.serializeToString(doc));
  if (parts[path].length > 262144) throw new Error('Oversized Office metadata part.');
}
const bytes = zip.zipSync(parts);
if (bytes.length > 128 * 1024 * 1024) throw new Error('Oversized labeled Office file.');
assertOfficePackage(bytes, format, source);
const size = filePort.write(bytes);
return { labels: [incomingLabel], size };
`;

/** Metadata stays in the existing native compute pool and never crosses Hermes as a ZIP blob. */
export async function processOfficeMetadata(input: {
  uri: string;
  size: number;
  format: OfficeFormat;
  output?: string;
  label?: AiContentLabel;
  signal?: AbortSignal;
  sandbox?: JsSandbox | null;
}): Promise<{ label: AiContentLabel | null; size: number }> {
  const sandbox = input.sandbox === undefined ? createJsSandbox() : input.sandbox;
  if (!sandbox?.files) throw new Error('Office metadata requires the native file sandbox');
  if (input.size > 128 * 1024 * 1024) throw new Error('Oversized Office metadata source');
  const signal = input.signal ?? new AbortController().signal;
  const label = input.label ? AiContentLabelSchema.parse(input.label) : null;
  if (label && !input.output) throw new Error('Office metadata needs an output file');
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  try {
    const outcome = await sandbox.run({
      code:
        officePackageRuntimeCode +
        '\nconst incomingLabel = ' +
        JSON.stringify(label) +
        ';\nconst format = ' +
        JSON.stringify(input.format) +
        ';\n' +
        metadataCode,
      files: { inputs: [input.uri], ...(input.output ? { output: input.output } : {}) },
      signal,
      onSettled: settle,
      limits: { ...officeLimits(input.size, 256 * 1024), memoryBytes: 512 * 1024 * 1024 },
    });
    signal.throwIfAborted();
    if (outcome.status !== 'ok' || !outcome.result || outcome.resultTruncated)
      throw new Error(
        outcome.status === 'error' ? outcome.message : 'Invalid Office metadata result',
      );
    const result = JSON.parse(outcome.result) as { labels: unknown[]; size: number };
    const labels = result.labels.map((value) => AiContentLabelSchema.parse(value));
    if (labels.some((value) => JSON.stringify(value) !== JSON.stringify(labels[0])))
      throw new Error('Conflicting Office AIGC metadata');
    if (!Number.isSafeInteger(result.size) || result.size <= 0)
      throw new Error('Invalid labeled Office file size');
    return { label: labels[0] ?? null, size: result.size };
  } finally {
    // A cancellation result can precede native cleanup; input/output files must stay alive.
    await settled;
  }
}
