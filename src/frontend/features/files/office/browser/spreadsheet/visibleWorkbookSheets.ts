import type { SheetRenderModel } from './renderModel';

/** Match desktop: malformed all-hidden workbooks still expose their first sheet. */
export function visibleWorkbookSheets(sheets: SheetRenderModel[]) {
  const visible = sheets.filter((sheet) => !sheet.hidden);
  return visible.length ? visible : sheets.slice(0, 1);
}
