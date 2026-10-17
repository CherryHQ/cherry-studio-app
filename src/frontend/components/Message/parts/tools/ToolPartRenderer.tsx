import type { ParamValues } from '@cherrystudio/provider-registry';
import { View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';
import { imageParamsAspectRatio } from '@/shared/utils/imageGenerationParams';

import { PendingImagePart } from '../PendingImagePart';
import { AgentManagementToolPart } from './AgentManagementToolPart';
import { EditFileToolPart, isEditFileToolPart } from './EditFileToolPart';
import { FileToolContent } from './FileToolContent';
import { GenericToolPart } from './GenericToolPart';
import { isMcpToolPart, McpToolPart } from './McpToolPart';
import { isMetaToolPart, MetaToolPartRenderer } from './metaTool/MetaToolPartRenderer';
import { isReadFileToolPart, ReadFileToolPart } from './ReadFileToolPart';
import { isRunJsToolPart, RunJsToolPart } from './RunJsToolPart';
import { SkillToolPart } from './SkillToolPart';
import {
  getToolName,
  isAgentMutationToolPart,
  isGeneratingImageToolPart,
  isProviderWebSearchToolPart,
  isUserQuestionToolPart,
  isRecord,
  isWebSearchToolPart,
  type ToolMessagePart,
} from './toolPartState';
import { useToolRenderer } from './ToolRendererContext';
import { UserQuestionPart } from './UserQuestionPart';
import { WebSearchToolPart } from './WebSearchToolPart';
import { isWriteFileToolPart, WriteFileToolPart } from './WriteFileToolPart';

type ToolPartRendererProps = {
  messageId?: string;
  messageParts?: readonly CherryMessagePart[];
  part: ToolMessagePart;
};

export function ToolPartRenderer({ messageId, messageParts, part }: ToolPartRendererProps) {
  const renderTool = useToolRenderer();
  if (renderTool) return renderTool(part);

  if (
    ['load_skill', 'find_skills', 'install_skill', 'adapt_skill'].includes(getToolName(part) ?? '')
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

  if (isRunJsToolPart(part)) {
    return <RunJsToolPart part={part} />;
  }

  if (isGeneratingImageToolPart(part)) {
    // Tool input carries the canonical painting params, so it names the shape.
    const params = isRecord(part.input) ? (part.input as ParamValues) : undefined;
    return (
      <PendingImagePart
        aspectRatio={imageParamsAspectRatio(params)}
        testID="chat-image-tool-loader"
      />
    );
  }

  if (isUserQuestionToolPart(part)) {
    return <UserQuestionPart part={part} />;
  }

  if (isAgentMutationToolPart(part)) {
    return <AgentManagementToolPart part={part} />;
  }

  return <GenericToolPart part={part} />;
}
