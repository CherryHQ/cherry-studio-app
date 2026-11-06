import { View } from 'react-native';

import type { MessagePartRootProps } from '../message-part.types';
import {
  MessagePartDetail,
  MessagePartProcess,
  MessagePartReasoning,
  MessagePartSummary,
  MessagePartTool,
  MessagePartToolGroup,
} from './message-part-disclosure';
import { MessagePartError } from './message-part-feedback';
import { MessagePartPending } from './message-part-pending';
import { MessagePartPlaceholder } from './message-part-placeholder';
import {
  MessagePartSection,
  MessagePartSectionBody,
  MessagePartSectionTitle,
  MessagePartTextSection,
  MessagePartValueSection,
} from './message-part-sections';
import { MessagePartSource } from './message-part-source';
import { MessagePartStatus } from './message-part-status';
import { MessagePartTextBody } from './message-part-text-body';
import { MessagePartTranslation } from './message-part-translation';
import { MessagePartUnknown } from './message-part-unknown';

function MessagePartRoot({ children, className, ...props }: MessagePartRootProps) {
  return (
    <View className={`gap-1.5 ${className ?? ''}`} {...props}>
      {children}
    </View>
  );
}

export const MessagePart = Object.assign(MessagePartRoot, {
  Detail: MessagePartDetail,
  Error: MessagePartError,
  Pending: MessagePartPending,
  Placeholder: MessagePartPlaceholder,
  Process: MessagePartProcess,
  Reasoning: MessagePartReasoning,
  Section: MessagePartSection,
  SectionBody: MessagePartSectionBody,
  SectionTitle: MessagePartSectionTitle,
  Source: MessagePartSource,
  Status: MessagePartStatus,
  Summary: MessagePartSummary,
  TextBody: MessagePartTextBody,
  TextSection: MessagePartTextSection,
  Tool: MessagePartTool,
  ToolGroup: MessagePartToolGroup,
  Translation: MessagePartTranslation,
  Unknown: MessagePartUnknown,
  ValueSection: MessagePartValueSection,
});
