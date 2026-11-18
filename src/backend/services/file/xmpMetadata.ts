import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';

export const AI_CONTENT_XMP_NAMESPACE = 'http://www.tc260.org.cn/ns/AIGC/1.0/';
export const MAX_AI_METADATA_BYTES = 256 * 1024;
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XMLNS = 'http://www.w3.org/2000/xmlns/';

function parseXmp(text: string) {
  if (text.length > MAX_AI_METADATA_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('Invalid or oversized XMP metadata');
  return new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error('Invalid XMP metadata: ' + message);
    },
  }).parseFromString(text, 'application/xml');
}

export function readAiContentXmp(text: string): AiContentLabel | null {
  const document = parseXmp(text);
  const values: string[] = [];
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.namespaceURI === AI_CONTENT_XMP_NAMESPACE && element.localName === 'AIGC')
      values.push(element.textContent ?? '');
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === AI_CONTENT_XMP_NAMESPACE && attribute.localName === 'AIGC')
        values.push(attribute.value);
    }
  }
  const labels = values.map((value) => AiContentLabelSchema.parse(JSON.parse(value)));
  if (labels.some((label) => JSON.stringify(label) !== JSON.stringify(labels[0])))
    throw new Error('Conflicting AIGC XMP metadata');
  return labels[0] ?? null;
}

/** Update only this namespace's AIGC property, retaining all unrelated XMP properties. */
export function writeAiContentXmp(text: string | undefined, label: AiContentLabel | null): string {
  const document = parseXmp(
    text ??
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="' +
        RDF +
        '"><rdf:Description rdf:about=""/></rdf:RDF></x:xmpmeta>',
  );
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.namespaceURI === AI_CONTENT_XMP_NAMESPACE && element.localName === 'AIGC') {
      element.parentNode?.removeChild(element);
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === AI_CONTENT_XMP_NAMESPACE && attribute.localName === 'AIGC')
        element.removeAttributeNode(attribute);
    }
  }
  if (label) {
    const rdf = document.getElementsByTagNameNS(RDF, 'RDF')[0];
    if (!rdf) throw new Error('XMP metadata has no RDF container');
    let description = document.getElementsByTagNameNS(RDF, 'Description')[0];
    if (!description) {
      description = document.createElementNS(RDF, 'rdf:Description');
      rdf.appendChild(description);
    }
    const property = document.createElementNS(AI_CONTENT_XMP_NAMESPACE, 'TC260:AIGC');
    property.setAttributeNS(XMLNS, 'xmlns:TC260', AI_CONTENT_XMP_NAMESPACE);
    property.appendChild(
      document.createTextNode(JSON.stringify(AiContentLabelSchema.parse(label))),
    );
    description.appendChild(property);
  }
  const output = new XMLSerializer().serializeToString(document);
  if (output.length > MAX_AI_METADATA_BYTES) throw new Error('Oversized XMP metadata');
  return output;
}
