import { View } from 'react-native';

import type { MessagePartRootProps } from '../message-part.types';
import { MessagePartReasoning, MessagePartTool } from './message-part-disclosure';
import { MessagePartError } from './message-part-feedback';
import { MessagePartPlaceholder } from './message-part-placeholder';
import {
  MessagePartSectionTitle,
  MessagePartTextSection,
  MessagePartValueSection,
} from './message-part-sections';
import { MessagePartSource } from './message-part-source';
import { MessagePartStatus, MessagePartStatusTextFloor } from './message-part-status';
import { MessagePartTranslation } from './message-part-translation';

function MessagePartRoot({ children, className, ...props }: MessagePartRootProps) {
  return (
    <View className={`gap-1.5 ${className ?? ''}`} {...props}>
      {children}
    </View>
  );
}

export const MessagePart = Object.assign(MessagePartRoot, {
  Error: MessagePartError,
  Placeholder: MessagePartPlaceholder,
  Reasoning: MessagePartReasoning,
  SectionTitle: MessagePartSectionTitle,
  Source: MessagePartSource,
  Status: MessagePartStatus,
  StatusTextFloor: MessagePartStatusTextFloor,
  TextSection: MessagePartTextSection,
  Tool: MessagePartTool,
  Translation: MessagePartTranslation,
  ValueSection: MessagePartValueSection,
});
