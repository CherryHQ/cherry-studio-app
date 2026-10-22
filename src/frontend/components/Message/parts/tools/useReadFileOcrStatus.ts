import { useTranslation } from 'react-i18next';

import { usePdfOcrState } from '@/frontend/hooks/file';

import { getToolDisplayState, getToolName, isRecord, type ToolMessagePart } from './toolPartState';

/** Recognition progress of the scanned PDF a running read_file call is reading by entry ID. */
export function useReadFileOcrStatus(part: ToolMessagePart | undefined): string | undefined {
  const { t } = useTranslation();
  const fileEntryId =
    part &&
    getToolDisplayState(part) === 'running' &&
    getToolName(part) === 'read_file' &&
    isRecord(part.input) &&
    typeof part.input.file_entry_id === 'string'
      ? part.input.file_entry_id
      : undefined;
  const state = usePdfOcrState(fileEntryId);
  if (!state) return undefined;
  return state.status === 'recognizing'
    ? t('chat.builtinTool.file.recognizing', {
        completed: state.completedPages,
        total: state.totalPages,
      })
    : t('chat.builtinTool.file.recognitionQueued');
}
