import { useTranslation } from 'react-i18next';

import { usePdfOcrState } from '@/frontend/hooks/file';

import { getToolDisplayState, getToolName, type ToolMessagePart } from './toolPartState';

/** Recognition progress of the scanned PDF a running read_file call is reading, by ID or path. */
export function useReadFileOcrStatus(part: ToolMessagePart | undefined): string | undefined {
  const { t } = useTranslation();
  const toolCallId =
    part && getToolDisplayState(part) === 'running' && getToolName(part) === 'read_file'
      ? part.toolCallId
      : undefined;
  const state = usePdfOcrState(toolCallId);
  if (!state) return undefined;
  return state.status === 'recognizing'
    ? t('chat.builtinTool.file.recognizing', {
        completed: state.completedPages,
        total: state.totalPages,
      })
    : t('chat.builtinTool.file.processingQueued');
}
