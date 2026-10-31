import { useTranslation } from 'react-i18next';

import { useFileOcrState } from '@/frontend/hooks/file';

import { getToolDisplayState, getToolName, type ToolMessagePart } from './toolPartState';

/** Recognition progress for the file owned by a running read or extraction call. */
export function useReadFileOcrStatus(part: ToolMessagePart | undefined): string | undefined {
  const { t } = useTranslation();
  const toolCallId =
    part &&
    getToolDisplayState(part) === 'running' &&
    ['read_file', 'library_read_file', 'extract_document'].includes(getToolName(part))
      ? part.toolCallId
      : undefined;
  const state = useFileOcrState(toolCallId);
  if (!state) return undefined;
  if (part && getToolName(part) === 'extract_document') {
    return state.status === 'recognizing'
      ? state.kind === 'image'
        ? t('chat.tool.running')
        : t('chat.builtinTool.file.extractionPages', {
            completed: state.completedPages,
            total: state.totalPages,
          })
      : t('chat.builtinTool.file.extractionQueued');
  }
  return state.status === 'recognizing'
    ? state.kind === 'image'
      ? t('attachments.ocr.recognizingImage')
      : t('chat.builtinTool.file.recognizing', {
          completed: state.completedPages,
          total: state.totalPages,
        })
    : t('chat.builtinTool.file.processingQueued');
}
