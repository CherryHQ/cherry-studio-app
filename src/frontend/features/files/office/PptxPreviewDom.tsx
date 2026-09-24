'use dom';

import { OfficeDocumentContent } from './browser/OfficeDocumentContent';
import { PptxDocument } from './browser/PptxDocument';
import type { OfficeDocumentProps } from './officePreview';

export default function PptxPreviewDom(props: OfficeDocumentProps) {
  return <OfficeDocumentContent {...props} type="pptx" Renderer={PptxDocument} />;
}
