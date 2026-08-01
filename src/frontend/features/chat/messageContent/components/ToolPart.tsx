import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { getBuiltInToolPresentation } from '../../utils/builtInToolPresentation';
import { hasToolPartValue, ToolPartTextSection, ToolPartValueSection } from './ToolPartDetails';
import { ToolPartDisclosure } from './ToolPartDisclosure';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type ToolPartProps = {
  part: ToolMessagePart;
};

export function ToolPart({ part }: ToolPartProps) {
  const { t } = useTranslation();
  const toolPresentation = getBuiltInToolPresentation(getToolName(part));
  const title = getToolLabel(part, toolPresentation?.titleKey, t);
  const statusText = getToolStatusText(part, t);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <ToolPartDisclosure
      icon={Platform.OS === 'android' ? toolPresentation?.androidIcon : undefined}
      imageSource={Platform.OS === 'ios' ? toolPresentation?.iosImageSource : undefined}
      isRunning={isRunning}
      statusText={statusText}
      statusTone={getToolStatusTone(part)}
      testIDPrefix="tool-part"
      title={title}
    >
      <ToolPartValueSection title={t('chat.tool.arguments')} value={part.input} />
      {part.state === 'output-available' ? <ToolOutputSection output={part.output} /> : null}
      {part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
      {shouldShowNoDetails(part) ? (
        <Text className="text-default-foreground text-md italic" selectable>
          {t('chat.tool.noOutput')}
        </Text>
      ) : null}
    </ToolPartDisclosure>
  );
}

function ToolOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();

  if (!hasToolPartValue(output)) {
    return (
      <Text className="text-default-foreground text-md italic" selectable>
        {t('chat.tool.noOutput')}
      </Text>
    );
  }

  return <ToolPartValueSection title={t('chat.tool.output')} value={output} />;
}

function getToolLabel(
  part: ToolMessagePart,
  builtInTitleKey: string | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (builtInTitleKey) {
    return t(builtInTitleKey);
  }

  const title = part.title?.trim();
  if (title) return title;

  return getToolName(part);
}

function getToolStatusText(part: ToolMessagePart, t: ReturnType<typeof useTranslation>['t']) {
  if (part.state === 'input-streaming') {
    return t('chat.tool.preparingInput');
  }

  if (part.state === 'input-available') {
    return t('chat.tool.inputReady');
  }

  if (part.state === 'approval-requested') {
    return t('chat.tool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.runDenied');
  }

  if (part.state === 'output-available') {
    return undefined;
  }

  if (part.state === 'output-error') {
    return t('chat.tool.callError');
  }

  return t('chat.tool.runDenied');
}

function getToolStatusTone(part: ToolMessagePart): 'danger' | 'default' | 'warning' {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }

  return part.state === 'output-error' ? 'danger' : 'default';
}

function shouldShowNoDetails(part: ToolMessagePart) {
  return (
    part.state !== 'output-error' &&
    part.state !== 'output-available' &&
    !hasToolPartValue(part.input)
  );
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}
