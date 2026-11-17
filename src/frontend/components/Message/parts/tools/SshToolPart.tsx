import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import { sshErrorLabel } from '@/frontend/hooks/ssh';
import { SshError, SshErrorCodeSchema } from '@/shared/data/types/ssh';

import { GenericToolPart } from './GenericToolPart';
import { isRecord, type ToolMessagePart } from './toolPartState';

/** Uses the shared summary row and detail sheet, while preserving literal shell input/output. */
export function SshToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  if (part.state !== 'output-available' || !isRecord(part.output))
    return <GenericToolPart part={part} />;
  const output = part.output;
  const input = isRecord(part.input) ? part.input : {};
  const error = SshErrorCodeSchema.safeParse(output.error);
  const failed =
    output.state === 'not-started' ||
    Boolean(output.error) ||
    (typeof output.exitCode === 'number' && output.exitCode !== 0);
  const unknown = output.state === 'unknown';
  const outputText = [
    error.success ? sshErrorLabel(new SshError(error.data), t) : '',
    typeof output.stdout === 'string' ? output.stdout : '',
    typeof output.stderr === 'string' && output.stderr ? `stderr:\n${output.stderr}` : '',
    output.truncated ? t('ssh.command.truncated') : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <MessagePart.Tool
      title={t('ssh.command.run')}
      state="complete"
      statusText={
        unknown
          ? t('ssh.command.outcomeUnknown')
          : typeof output.exitCode === 'number'
            ? t('ssh.command.exit', { code: output.exitCode })
            : failed
              ? t('chat.tool.callError')
              : undefined
      }
      statusTone={unknown ? 'warning' : failed ? 'danger' : 'default'}
      testID="ssh-tool-part"
    >
      <MessageDetailText
        title={t('chat.tool.output')}
        value={outputText || t('ssh.approval.empty')}
        variant="code"
      />
      {typeof input.command === 'string' ? (
        <MessageDetailText
          title={t('ssh.command.label')}
          value={input.command}
          variant="code"
          language="bash"
        />
      ) : null}
    </MessagePart.Tool>
  );
}
