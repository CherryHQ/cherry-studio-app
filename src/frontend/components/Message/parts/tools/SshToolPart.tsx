import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';
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
  return (
    <MessagePart.Tool
      title={t('ssh.command.run')}
      state="complete"
      statusText={
        unknown ? t('ssh.command.outcomeUnknown') : failed ? t('chat.tool.callError') : undefined
      }
      statusTone={unknown ? 'warning' : failed ? 'danger' : 'default'}
      testID="ssh-tool-part"
    >
      {error.success ? (
        <MessageDetailText
          title={t('chat.tool.error')}
          value={sshErrorLabel(new SshError(error.data), t)}
          tone="danger"
        />
      ) : null}
      {typeof output.target === 'string' ? (
        <MessageDetailText title={t('ssh.selectTarget')} value={output.target} />
      ) : null}
      {(['stdout', 'stderr'] as const).map((stream) =>
        typeof output[stream] === 'string' && output[stream] ? (
          <MessageDetailText key={stream} title={stream} value={output[stream]} variant="code" />
        ) : null,
      )}
      {typeof input.command === 'string' ? (
        <MessageDetailText
          title={t('ssh.command.label')}
          value={input.command}
          variant="code"
          language="bash"
        />
      ) : null}
      {typeof input.cwd === 'string' ? (
        <MessageDetailText title={t('ssh.command.cwd')} value={input.cwd} variant="code" />
      ) : null}
      {typeof input.stdin === 'string' && input.stdin ? (
        <MessageDetailText title={t('ssh.command.stdin')} value={input.stdin} variant="code" />
      ) : null}
      {output.truncated ? (
        <MessageDetailText title={t('chat.tool.output')} value={t('ssh.command.truncated')} />
      ) : null}
      <MessageDetailValue
        title={t('chat.tool.result')}
        value={{
          exitCode: output.exitCode,
          stdoutBytes: output.stdoutBytes,
          stderrBytes: output.stderrBytes,
        }}
      />
    </MessagePart.Tool>
  );
}
