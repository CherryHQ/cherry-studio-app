import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { parseFunctionCallToolName } from '@/ai/mcp';
import { type NormalizedMcpContent, normalizeMcpResult } from '@/ai/mcp/mcpResult';
import type { CherryMessagePart } from '@/data/types/message';
import { type CherryToolMeta, readCherryMeta, readCherryToolMetadata } from '@/data/types/uiParts';
import { ToolPartSectionTitle, ToolPartTextSection, ToolPartValueSection } from './ToolPartDetails';
import { ToolPartDisclosure } from './ToolPartDisclosure';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

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
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <ToolPartDisclosure
      isRunning={isRunning}
      statusText={statusText}
      statusTone={getMcpToolStatusTone(part)}
      testIDPrefix="mcp-tool-part"
      title={title}
    >
      <ToolPartValueSection
        maxLength={MAX_ARG_VALUE_LENGTH}
        title={t('chat.mcpTool.arguments')}
        value={part.input}
      />
      {part.state === 'output-available' ? <McpOutputSection output={part.output} /> : null}
      {readCherryMeta(part)?.settledByApp ? (
        <ToolPartTextSection
          tone="error"
          title={t('chat.mcpTool.response')}
          value={t('chat.mcpTool.unfinishedDetail')}
        />
      ) : part.state === 'output-error' ? (
        <ToolPartTextSection
          tone="error"
          title={t('chat.mcpTool.response')}
          value={part.errorText}
        />
      ) : null}
    </ToolPartDisclosure>
  );
}

function McpOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();
  const normalized = normalizeMcpResult(output);
  const images = normalized.content.filter(
    (content): content is Extract<NormalizedMcpContent, { kind: 'image' }> =>
      content.kind === 'image',
  );
  const fullText = normalized.content
    .map((content) => formatNormalizedContent(content, t))
    .filter((text): text is string => text !== undefined)
    .join('\n\n');
  const text = truncateText(
    fullText,
    MAX_OUTPUT_TEXT_LENGTH,
    t('chat.mcpTool.truncated', { count: fullText.length }),
  );

  if (!text.trim() && images.length === 0) {
    return (
      <Text className="text-default-foreground text-md italic" selectable>
        {t('chat.mcpTool.noOutput')}
      </Text>
    );
  }

  return (
    <View className="gap-1">
      {text ? (
        <ToolPartTextSection title={t('chat.mcpTool.response')} value={text} />
      ) : (
        <ToolPartSectionTitle title={t('chat.mcpTool.response')} />
      )}
      {images.map((image) => (
        <Image
          className="h-44 w-full rounded-md"
          contentFit="contain"
          key={createImageKey(image.data)}
          source={`data:${image.mimeType};base64,${image.data}`}
        />
      ))}
    </View>
  );
}

function formatNormalizedContent(
  content: NormalizedMcpContent,
  t: ReturnType<typeof useTranslation>['t'],
): string | undefined {
  switch (content.kind) {
    case 'text':
      return formatOutputText(content.text);
    case 'image':
      return undefined;
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

function getMcpToolStatusTone(part: ToolMessagePart): 'danger' | 'default' | 'warning' {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }

  return readCherryMeta(part)?.settledByApp || part.state === 'output-error' ? 'danger' : 'default';
}

function assertHandled(_part: never): void {}

function createImageKey(data: string) {
  let hash = 0;
  for (let index = 0; index < data.length; index += 1) {
    hash = (hash * 31 + data.charCodeAt(index)) | 0;
  }
  return `mcp-image-${hash}`;
}

function formatOutputText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function truncateText(text: string, maxLength: number, message: string) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... ${message}`;
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}
