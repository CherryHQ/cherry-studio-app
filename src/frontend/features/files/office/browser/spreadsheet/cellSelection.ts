import { OFFICE_CELL_TEXT_LIMIT, type OfficeCellSelection } from '../../officePreview';
import type { SelectedCellInfo } from './XlsxGrid';

/** Keep cell detail messages bounded independently of the workbook and render status. */
export function toOfficeCellSelection(info: SelectedCellInfo | null): OfficeCellSelection | null {
  if (!info) return null;
  const text = info.cell?.text ?? '';
  const formula = info.cell?.formula ?? null;
  return {
    address: info.address,
    text: text.slice(0, OFFICE_CELL_TEXT_LIMIT),
    formula: formula?.slice(0, OFFICE_CELL_TEXT_LIMIT) ?? null,
    formulaState: info.cell?.formulaState ?? null,
    truncated:
      text.length > OFFICE_CELL_TEXT_LIMIT || (formula?.length ?? 0) > OFFICE_CELL_TEXT_LIMIT,
  };
}
