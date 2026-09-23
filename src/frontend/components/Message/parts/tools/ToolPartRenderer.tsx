import { View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { EditFileToolPart, isEditFileToolPart } from './EditFileToolPart';
import { FileToolContent } from './FileToolContent';
import { GenericToolPart } from './GenericToolPart';
import { isMcpToolPart, McpToolPart } from './McpToolPart';
import { isMetaToolPart, MetaToolPartRenderer } from './metaTool/MetaToolPartRenderer';
import { isReadFileToolPart, ReadFileToolPart } from './ReadFileToolPart';
import { SkillToolPart } from './SkillToolPart';
import { getToolName } from './toolPartState';
import {
  isProviderWebSearchToolPart,
  isWebSearchToolPart,
  type ToolMessagePart,
} from './toolPartState';
import { WebSearchToolPart } from './WebSearchToolPart';
import { isWriteFileToolPart, WriteFileToolPart } from './WriteFileToolPart';

type ToolPartRendererProps = {
  messageId?: string;
  messageParts?: readonly CherryMessagePart[];
  part: ToolMessagePart;
};

export function ToolPartRenderer({ messageId, messageParts, part }: ToolPartRendererProps) {
  if (
    ['load_skill', 'find_skills', 'prepare_skill', 'install_skill'].includes(
      getToolName(part) ?? '',
    )
  )
    return <SkillToolPart part={part} />;
  if (isProviderWebSearchToolPart(part)) {
    return null;
  }

  if (isWebSearchToolPart(part)) {
    return <WebSearchToolPart messageParts={messageParts} part={part} />;
  }

  if (isMetaToolPart(part)) {
    return <MetaToolPartRenderer part={part} />;
  }

  if (isMcpToolPart(part)) {
    return <McpToolPart part={part} />;
  }

  if (isWriteFileToolPart(part)) {
    return (
      <View className="gap-2">
        <WriteFileToolPart part={part} />
        <FileToolContent messageId={messageId} part={part} />
      </View>
    );
  }

  if (isEditFileToolPart(part)) {
    return (
      <View className="gap-2">
        <EditFileToolPart part={part} />
        <FileToolContent messageId={messageId} part={part} />
      </View>
    );
  }

  if (isReadFileToolPart(part)) {
    return <ReadFileToolPart part={part} />;
  }

  return <GenericToolPart part={part} />;
}
