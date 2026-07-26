import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { parseFunctionCallToolName } from '@/ai/mcp';
import type { CherryMessagePart } from '@/data/types/message';
import { type CherryToolMeta, readCherryMeta, readCherryToolMetadata } from '@/data/types/uiParts';
import { ToolPartSheet, ToolPartTrigger } from './ToolPartSheet';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type McpToolPartProps = {
  part: ToolMessagePart;
};

type ExtractedMcpOutput = {
  images: { data: string; id: string; mimeType: string }[];
  text: string;
};

const MAX_ARG_VALUE_LENGTH = 1200;
const MAX_OUTPUT_TEXT_LENGTH = 4000;

export function McpToolPart({ part }: McpToolPartProps) {
  const { t } = useTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const toolName = getToolName(part);
  const toolMetadata = readCherryToolMetadata(part)?.tool;
  const title = getMcpToolTitle(part, toolName, toolMetadata);
  const statusText = getMcpToolStatusText(part, t);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <View className="gap-1.5">
      <ToolPartTrigger
        isRunning={isRunning}
        onPress={() => setIsSheetOpen(true)}
        statusText={statusText}
        statusTone={getMcpToolStatusTone(part)}
        testID="mcp-tool-part-trigger"
        title={title}
      />
      {isSheetOpen ? (
        <ToolPartSheet
          onClose={() => setIsSheetOpen(false)}
          testID="mcp-tool-part-detail"
          title={title}
        >
          <ToolValueSection title={t('chat.mcpTool.arguments')} value={part.input} />
          {part.state === 'output-available' ? <McpOutputSection output={part.output} /> : null}
          {readCherryMeta(part)?.settledByApp ? (
            <ToolTextSection
              tone="error"
              title={t('chat.mcpTool.response')}
              value={t('chat.mcpTool.unfinishedDetail')}
            />
          ) : part.state === 'output-error' ? (
            <ToolTextSection
              tone="error"
              title={t('chat.mcpTool.response')}
              value={part.errorText}
            />
          ) : null}
        </ToolPartSheet>
      ) : null}
    </View>
  );
}

function ToolValueSection({ title, value }: { title: string; value: unknown }) {
  const entries = getValueEntries(value);

  if (entries.length === 0) return null;

  return (
    <View className="gap-1">
      <SectionTitle title={title} />
      <View className="gap-1">
        {entries.map(([key, entryValue]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-default-foreground text-md" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-default-foreground text-md" selectable>
              {formatArgValue(entryValue)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function McpOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();
  const extractedOutput = extractMcpOutput(output);
  const text = truncateText(
    extractedOutput.text,
    MAX_OUTPUT_TEXT_LENGTH,
    t('chat.mcpTool.truncated', { count: extractedOutput.text.length }),
  );
  const hasText = Boolean(text.trim());
  const hasImages = extractedOutput.images.length > 0;

  if (!hasText && !hasImages) {
    return (
      <Text className="text-default-foreground text-md italic" selectable>
        {t('chat.mcpTool.noOutput')}
      </Text>
    );
  }

  return (
    <View className="gap-1">
      <SectionTitle title={t('chat.mcpTool.response')} />
      {hasText ? (
        <Text className="font-mono text-default-foreground text-md leading-5" selectable>
          {text}
        </Text>
      ) : null}
      {extractedOutput.images.map((image) => (
        <Image
          className="h-44 w-full rounded-md"
          contentFit="contain"
          key={image.id}
          source={`data:${image.mimeType};base64,${image.data}`}
        />
      ))}
    </View>
  );
}

function ToolTextSection({ title, tone, value }: { title: string; tone?: 'error'; value: string }) {
  return (
    <View className="gap-1">
      <SectionTitle title={title} />
      <Text
        className={
          tone === 'error'
            ? 'font-mono text-danger text-md leading-5'
            : 'font-mono text-default-foreground text-md leading-5'
        }
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-default-foreground text-md" selectable>
      {title}
    </Text>
  );
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
  // Metadata-less fallback: recover `server: tool` from the minted
  // `mcp__{server}__{tool}` key (mirrors desktop toolResponse.ts).
  const parsed = parseFunctionCallToolName(toolName);

  const serverName = toolMetadata?.serverName?.trim();
  if (serverName) return `${serverName}: ${parsed?.toolPart ?? toolName}`;

  if (parsed) return `${parsed.serverPart}: ${parsed.toolPart}`;

  const title = part.title?.trim();
  if (title) return title;

  return toolName;
}

function getMcpToolStatusText(part: ToolMessagePart, t: ReturnType<typeof useTranslation>['t']) {
  if (part.state === 'input-streaming') {
    return t('chat.mcpTool.preparingInput');
  }

  if (part.state === 'input-available') {
    return t('chat.mcpTool.inputReady');
  }

  if (part.state === 'approval-requested') {
    return t('chat.mcpTool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.mcpTool.approved') : t('chat.mcpTool.runDenied');
  }

  if (part.state === 'output-available') {
    return undefined;
  }

  // Whatever the app wrote to close out an abandoned call is addressed to the
  // model, in English: report what happened instead of quoting it.
  if (readCherryMeta(part)?.settledByApp) {
    return t('chat.mcpTool.unfinished');
  }

  if (part.state === 'output-error') {
    return t('chat.mcpTool.callError');
  }

  if (part.state === 'output-denied') {
    return t('chat.mcpTool.runDenied');
  }

  // An `ai` upgrade added a state. Falling through to "denied" would put words
  // in the user's mouth, so say nothing until this switch is taught about it.
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

/** Compile-time canary: a new tool part state makes this call a type error. */
function assertHandled(_part: never): void {}

function getValueEntries(value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return [['arguments', value]];
  if (isRecord(value)) return Object.entries(value);
  return [['arguments', value]];
}

function formatArgValue(value: unknown) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return truncateText(value, MAX_ARG_VALUE_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();

  try {
    return truncateText(JSON.stringify(value), MAX_ARG_VALUE_LENGTH);
  } catch {
    return truncateText(String(value), MAX_ARG_VALUE_LENGTH);
  }
}

function extractMcpOutput(output: unknown): ExtractedMcpOutput {
  if (output === undefined || output === null) {
    return { images: [], text: '' };
  }

  if (isRecord(output) && Array.isArray(output.content)) {
    return extractCallToolResultContent(output.content);
  }

  if (isRecord(output) && typeof output.content === 'string') {
    return { images: [], text: output.content };
  }

  if (typeof output === 'string') {
    return { images: [], text: formatOutputText(output) };
  }

  return { images: [], text: stringifyOutput(output) };
}

function extractCallToolResultContent(content: unknown[]): ExtractedMcpOutput {
  const textParts: string[] = [];
  const images: ExtractedMcpOutput['images'] = [];

  for (const item of content) {
    if (!isRecord(item)) continue;

    if (item.type === 'text' && typeof item.text === 'string') {
      textParts.push(formatOutputText(item.text));
      continue;
    }

    if (item.type === 'image' && typeof item.data === 'string') {
      images.push({
        data: item.data,
        id: createImageKey(item.data),
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : 'image/png',
      });
      continue;
    }

    if (item.type === 'resource' && isRecord(item.resource)) {
      const uri = typeof item.resource.uri === 'string' ? item.resource.uri : 'unknown';
      textParts.push(`[Resource: ${uri}]`);
    }
  }

  return { images, text: textParts.join('\n\n') };
}

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

function stringifyOutput(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(text: string, maxLength: number, message?: string) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... ${message ?? 'truncated'}`;
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
