import { View } from 'react-native';

import type { MessagePartRootProps } from '../message-part.types';
import {
  MessagePartDetail,
  MessagePartReasoning,
  MessagePartSummary,
  MessagePartTool,
} from './message-part-disclosure';
import { MessagePartError } from './message-part-feedback';
import { MessagePartPending } from './message-part-pending';
import { MessagePartPlaceholder } from './message-part-placeholder';
import {
  MessagePartSectionTitle,
  MessagePartTextSection,
  MessagePartValueSection,
} from './message-part-sections';
import { MessagePartSource } from './message-part-source';
import { MessagePartStatus } from './message-part-status';
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
  Reasoning: MessagePartReasoning,
  SectionTitle: MessagePartSectionTitle,
  Source: MessagePartSource,
  Status: MessagePartStatus,
  Summary: MessagePartSummary,
  TextSection: MessagePartTextSection,
  Tool: MessagePartTool,
  Translation: MessagePartTranslation,
  Unknown: MessagePartUnknown,
  ValueSection: MessagePartValueSection,
});
