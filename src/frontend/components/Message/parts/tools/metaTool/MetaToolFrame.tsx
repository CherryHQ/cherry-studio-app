import { MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getToolDisplayState, getToolStatusTone, type ToolMessagePart } from '../toolPartState';
import { getMetaToolStatusText, META_TOOL_TITLE_KEYS, type MetaToolName } from './metaToolState';

type MetaToolFrameProps = {
  children: ReactNode;
  part: ToolMessagePart;
  toolName: MetaToolName;
};

export function MetaToolFrame({ children, part, toolName }: MetaToolFrameProps) {
  const { t } = useTranslation();

  return (
    <MessagePart.Tool
      state={getToolDisplayState(part)}
      statusText={getMetaToolStatusText(part, toolName, t)}
      statusTone={getToolStatusTone(part)}
      testID="meta-tool-part"
      title={t(META_TOOL_TITLE_KEYS[toolName])}
    >
      {children}
    </MessagePart.Tool>
  );
}
