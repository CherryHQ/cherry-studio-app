import { useTranslation } from 'react-i18next';

import { useFileOcrState } from '@/frontend/hooks/file';

import { getToolDisplayState, getToolName, type ToolMessagePart } from './toolPartState';

/** Recognition progress of the file a running read_file call is reading, by ID or path. */
export function useReadFileOcrStatus(part: ToolMessagePart | undefined): string | undefined {
  const { t } = useTranslation();
  const toolCallId =
    part &&
    getToolDisplayState(part) === 'running' &&
    ['read_file', 'library_read_file'].includes(getToolName(part))
      ? part.toolCallId
      : undefined;
  const state = useFileOcrState(toolCallId);
  if (!state) return undefined;
  return state.status === 'recognizing'
    ? state.kind === 'image'
      ? t('attachments.ocr.recognizingImage')
      : t('chat.builtinTool.file.recognizing', {
          completed: state.completedPages,
          total: state.totalPages,
        })
    : t('chat.builtinTool.file.processingQueued');
}
