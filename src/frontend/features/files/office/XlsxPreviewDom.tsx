'use dom';

import { OfficeDocumentContent } from './browser/OfficeDocumentContent';
import { SpreadsheetDocument } from './browser/SpreadsheetDocument';
import type { OfficeDocumentProps } from './officePreview';

export default function XlsxPreviewDom(props: OfficeDocumentProps) {
  return <OfficeDocumentContent {...props} type="xlsx" Renderer={SpreadsheetDocument} />;
}
