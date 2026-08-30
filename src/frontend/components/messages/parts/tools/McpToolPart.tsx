import { MessagePart } from '@cherrystudio/ui/components';
import {
  type NormalizedMcpContent,
  normalizeMcpResult,
} from '@cherrystudio/universal/ai/tools/mcpResult';
import { parseFunctionCallToolName } from '@cherrystudio/universal/ai/tools/mcpToolName';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  type CherryToolMeta,
  readCherryMeta,
  readCherryToolMetadata,
} from '@/shared/data/types/uiParts';

import {
  getToolDisplayState,
  getToolName,
  getToolStatusTone,
  type ToolMessagePart,
} from './toolPartState';

type McpToolPartProps = {
  part: ToolMessagePart;
};

const MAX_ARG_VALUE_LENGTH = 1200;
const MAX_OUTPUT_TEXT_LENGTH = 4000;

export function McpToolPart({ part }: McpToolPartProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part);
  const toolMetadata = readCherryToolMetadata(part)?.tool;
  const title = getMcpToolTitle(part, toolName, toolMetadata);
  const statusText = getMcpToolStatusText(part, t);

  return (
    <MessagePart.Tool
      state={getToolDisplayState(part)}
      statusText={statusText}
      statusTone={getToolStatusTone(
        part,
        readCherryMeta(part)?.settledByApp || part.state === 'output-error',
      )}
      testID="mcp-tool-part"
      title={title}
    >
      {part.state === 'output-available' ? <McpOutputSection output={part.output} /> : null}
      {readCherryMeta(part)?.settledByApp ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.mcpTool.response')}
          value={t('chat.mcpTool.unfinishedDetail')}
        />
      ) : part.state === 'output-error' ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.mcpTool.response')}
          value={part.errorText}
        />
      ) : null}
      <MessagePart.ValueSection
        maxLength={MAX_ARG_VALUE_LENGTH}
        title={t('chat.mcpTool.arguments')}
        value={part.input}
      />
    </MessagePart.Tool>
  );
}

function McpOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();
  const normalized = normalizeMcpResult(output);
  const visibleContent = normalized.content.filter(
    (content) => content.kind !== 'text' || content.text.trim().length > 0,
  );

  if (visibleContent.length === 0) {
    return (
      <Text className="text-foreground text-base italic" selectable>
        {t('chat.mcpTool.noOutput')}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      <MessagePart.SectionTitle title={t('chat.mcpTool.response')} />
      {visibleContent.map((content, index) => (
        <McpContentItem content={content} key={createContentKey(content, index)} t={t} />
      ))}
    </View>
  );
}

function McpContentItem({
  content,
  t,
}: {
  content: NormalizedMcpContent;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (content.kind === 'image') {
    return (
      <Image
        className="h-44 w-full rounded-md"
        contentFit="contain"
        source={`data:${content.mimeType};base64,${content.data}`}
      />
    );
  }

  const text = formatNormalizedContent(content, t);
  const value = truncateText(
    text,
    MAX_OUTPUT_TEXT_LENGTH,
    t('chat.mcpTool.truncated', { count: text.length }),
  );

  return (
    <Text
      className={
        content.kind === 'text' && isJsonText(content.text)
          ? 'font-mono text-foreground text-sm'
          : 'text-base text-foreground'
      }
      selectable
    >
      {value}
    </Text>
  );
}

function formatNormalizedContent(
  content: Exclude<NormalizedMcpContent, { kind: 'image' }>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (content.kind) {
    case 'text':
      return formatOutputText(content.text);
    case 'audio':
      return t('chat.mcpTool.audioUnavailable', { mimeType: content.mimeType });
    case 'resource':
      return t('chat.mcpTool.resourceUnavailable', {
        mimeType: content.mimeType,
        uri: content.uri,
      });
    case 'resource-link':
      return t('chat.mcpTool.resourceLink', { mimeType: content.mimeType, uri: content.uri });
  }
}

export function isMcpToolPart(part: ToolMessagePart) {
  return (
    readCherryToolMetadata(part)?.tool?.type === 'mcp' ||
    parseFunctionCallToolName(getToolName(part)) !== null
  );
}

function getMcpToolTitle(
  part: ToolMessagePart,
  toolName: string,
  toolMetadata: CherryToolMeta['tool'],
) {
  const parsed = parseFunctionCallToolName(toolName);
  const serverName = toolMetadata?.serverName?.trim();
  if (serverName) return `${serverName}: ${parsed?.toolPart ?? toolName}`;
  if (parsed) return `${parsed.serverPart}: ${parsed.toolPart}`;

  const title = part.title?.trim();
  return title || toolName;
}

function getMcpToolStatusText(part: ToolMessagePart, t: ReturnType<typeof useTranslation>['t']) {
  if (part.state === 'input-streaming') return t('chat.mcpTool.preparingInput');
  if (part.state === 'input-available') return t('chat.mcpTool.inputReady');
  if (part.state === 'approval-requested') return t('chat.mcpTool.approvalRequested');
  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.mcpTool.approved') : t('chat.mcpTool.runDenied');
  }
  if (part.state === 'output-available') return undefined;
  if (readCherryMeta(part)?.settledByApp) return t('chat.mcpTool.unfinished');
  if (part.state === 'output-error') return t('chat.mcpTool.callError');
  if (part.state === 'output-denied') return t('chat.mcpTool.runDenied');

  assertHandled(part);
  return '';
}

function assertHandled(_part: never): void {}

function createContentKey(content: NormalizedMcpContent, index: number) {
  const value = content.kind === 'image' ? content.data : formatContentKeyValue(content);
  let hash = 0;
  for (let characterIndex = 0; characterIndex < value.length; characterIndex += 1) {
    hash = (hash * 31 + value.charCodeAt(characterIndex)) | 0;
  }
  return `mcp-content-${index}-${hash}`;
}

function formatContentKeyValue(content: Exclude<NormalizedMcpContent, { kind: 'image' }>) {
  if (content.kind === 'text') return content.text;
  if (content.kind === 'audio') return content.mimeType;
  return `${content.mimeType}-${content.uri}`;
}

function formatOutputText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function isJsonText(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function truncateText(text: string, maxLength: number, message: string) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... ${message}`;
}
