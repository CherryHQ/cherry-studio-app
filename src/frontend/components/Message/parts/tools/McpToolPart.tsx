import { MessagePart } from '@cherrystudio/ui/components';
import {
  type NormalizedMcpContent,
  type NormalizedMcpResult,
  normalizeMcpResult,
} from '@cherrystudio/universal/ai/tools/mcpResult';
import { parseFunctionCallToolName } from '@cherrystudio/universal/ai/tools/mcpToolName';
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
import { textToolResultContent, type ToolResultContent } from './toolResultContent';
import { ToolResultContentRenderer } from './ToolResultContentRenderer';

type McpToolPartProps = {
  part: ToolMessagePart;
};

const MAX_ARG_VALUE_LENGTH = 1200;

export function McpToolPart({ part }: McpToolPartProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part);
  const toolMetadata = readCherryToolMetadata(part)?.tool;
  const title = getMcpToolTitle(part, toolName, toolMetadata);
  const normalizedOutput =
    part.state === 'output-available' ? normalizeMcpResult(part.output) : undefined;
  const isRemoteError = normalizedOutput?.isError === true;
  const statusText = getMcpToolStatusText(part, isRemoteError, t);

  return (
    <MessagePart.Tool
      state={getToolDisplayState(part)}
      statusText={statusText}
      statusTone={getToolStatusTone(
        part,
        readCherryMeta(part)?.settledByApp || part.state === 'output-error' || isRemoteError,
      )}
      testID="mcp-tool-part"
      title={title}
    >
      {normalizedOutput ? <McpOutputSection normalized={normalizedOutput} /> : null}
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

function McpOutputSection({ normalized }: { normalized: NormalizedMcpResult }) {
  const { t } = useTranslation();
  const visibleContent = normalized.content.flatMap((content) => toToolResultContent(content, t));

  if (visibleContent.length === 0) {
    return (
      <Text className="text-foreground text-base italic" selectable>
        {t('chat.mcpTool.noOutput')}
      </Text>
    );
  }

  return (
    <View className="gap-1">
      <MessagePart.SectionTitle title={t('chat.mcpTool.response')} />
      <ToolResultContentRenderer
        contents={visibleContent}
        imageAccessibilityLabel={t('chat.attachments.image')}
      />
    </View>
  );
}

function toToolResultContent(
  content: NormalizedMcpContent,
  t: ReturnType<typeof useTranslation>['t'],
): ToolResultContent[] {
  switch (content.kind) {
    case 'audio':
      return [
        {
          fallbackText: t('chat.mcpTool.audioUnavailable', { mimeType: content.mimeType }),
          kind: 'audio',
        },
      ];
    case 'image':
      return [content];
    case 'json':
      return [content];
    case 'resource': {
      if (content.text !== undefined) {
        if (!content.text.trim()) return [];
        return [textToolResultContent(content.text, codeLanguageForMimeType(content.mimeType))];
      }
      return [
        {
          fallbackText: t('chat.mcpTool.resourceUnavailable', {
            mimeType: content.mimeType,
            uri: content.uri,
          }),
          kind: 'resource',
        },
      ];
    }
    case 'resource-link':
      return [
        {
          kind: 'resource-link',
          label: t('chat.mcpTool.resourceLink', {
            mimeType: content.mimeType,
            uri: content.uri,
          }),
          uri: content.uri,
        },
      ];
    case 'text':
      return content.text.trim() ? [textToolResultContent(content.text)] : [];
  }
}

const CODE_LANGUAGE_BY_MIME_TYPE = new Map<string, string>([
  ['application/javascript', 'javascript'],
  ['application/json', 'json'],
  ['application/typescript', 'typescript'],
  ['application/x-sh', 'bash'],
  ['application/x-shellscript', 'bash'],
  ['application/yaml', 'yaml'],
  ['text/css', 'css'],
  ['text/html', 'html'],
  ['text/markdown', 'markdown'],
  ['text/x-c', 'c'],
  ['text/x-go', 'go'],
  ['text/x-java', 'java'],
  ['text/x-python', 'python'],
  ['text/x-rust', 'rust'],
  ['text/x-tsx', 'tsx'],
  ['text/yaml', 'yaml'],
]);

function codeLanguageForMimeType(mimeType: string) {
  return CODE_LANGUAGE_BY_MIME_TYPE.get(mimeType.split(';')[0]?.trim().toLowerCase() ?? '');
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

function getMcpToolStatusText(
  part: ToolMessagePart,
  isRemoteError: boolean,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'input-streaming') return t('chat.mcpTool.preparingInput');
  if (part.state === 'input-available') return t('chat.mcpTool.inputReady');
  if (part.state === 'approval-requested') return t('chat.mcpTool.approvalRequested');
  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.mcpTool.approved') : t('chat.mcpTool.runDenied');
  }
  if (part.state === 'output-available') {
    return isRemoteError ? t('chat.mcpTool.callError') : undefined;
  }
  if (readCherryMeta(part)?.settledByApp) return t('chat.mcpTool.unfinished');
  if (part.state === 'output-error') return t('chat.mcpTool.callError');
  if (part.state === 'output-denied') return t('chat.mcpTool.runDenied');

  assertHandled(part);
  return '';
}

function assertHandled(_part: never): void {}
