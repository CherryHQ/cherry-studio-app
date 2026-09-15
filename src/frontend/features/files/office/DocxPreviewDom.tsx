'use dom';

import { DocxDocument } from './browser/DocxDocument';
import { OfficeDocumentContent } from './browser/OfficeDocumentContent';
import type { OfficeDocumentProps } from './officePreview';

export default function DocxPreviewDom(props: OfficeDocumentProps) {
  return <OfficeDocumentContent {...props} type="docx" Renderer={DocxDocument} />;
}
