import type { ConvertResult } from 'react-native-anydoc';

export const ANYDOC_PARSER_VERSION = '0.4.1';

/** Lazy native loading leaves the built-in parser usable in older development clients. */
export async function parseAnydocDocument(bytes: Uint8Array): Promise<ConvertResult> {
  const { convertDocumentToIr } = await import('react-native-anydoc');
  return convertDocumentToIr(bytes);
}
