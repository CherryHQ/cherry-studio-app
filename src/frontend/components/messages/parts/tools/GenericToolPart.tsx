import { hasMessagePartValue, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';
import {
  getToolDisplayState,
  getToolName,
  getToolStatusTone,
  type ToolMessagePart,
} from './toolPartState';

type GenericToolPartProps = {
  part: ToolMessagePart;
};

export function GenericToolPart({ part }: GenericToolPartProps) {
  const { t } = useTranslation();
  const toolDisplay = getBuiltInToolDisplay(getToolName(part));
  const title = getToolLabel(part, toolDisplay?.titleKey, t);
  const statusText = getToolStatusText(part, t);

  return (
    <MessagePart.Tool
      icon={toolDisplay?.icon}
      imageSource={toolDisplay?.imageSource}
      state={getToolDisplayState(part)}
      statusText={statusText}
      statusTone={getToolStatusTone(part)}
      testID="tool-part"
      title={title}
    >
      {part.state === 'output-available' ? <ToolOutputSection output={part.output} /> : null}
      {part.state === 'output-error' ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.tool.error')}
          value={part.errorText}
        />
      ) : null}
      {shouldShowNoDetails(part) ? (
        <Text className="text-foreground text-base italic" selectable>
          {t('chat.tool.noOutput')}
        </Text>
      ) : null}
      <MessagePart.ValueSection title={t('chat.tool.arguments')} value={part.input} />
    </MessagePart.Tool>
  );
}

function ToolOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();

  if (!hasMessagePartValue(output)) {
    return (
      <Text className="text-foreground text-base italic" selectable>
        {t('chat.tool.noOutput')}
      </Text>
    );
  }

  return <MessagePart.ValueSection title={t('chat.tool.output')} value={output} />;
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

function shouldShowNoDetails(part: ToolMessagePart) {
  return (
    part.state !== 'output-error' &&
    part.state !== 'output-available' &&
    !hasMessagePartValue(part.input)
  );
}
