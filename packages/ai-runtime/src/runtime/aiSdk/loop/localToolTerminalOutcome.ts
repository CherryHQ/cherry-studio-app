export interface TerminalToolFailure {
  error: string;
  i18nKey?: string;
  userMessage?: string;
}

const trustedTerminalFailures = new WeakSet<object>();

type TerminalFailureOutput = {
  error: string;
  i18nKey?: unknown;
  retryable: false;
  terminal: true;
  userMessage?: unknown;
};

function isTerminalFailureOutput(output: unknown): output is TerminalFailureOutput {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return false;
  const candidate = output as Record<string, unknown>;
  return (
    candidate.terminal === true &&
    candidate.retryable === false &&
    typeof candidate.error === 'string'
  );
}

export function markTrustedLocalToolTerminalFailure<T>(output: T): T {
  if (isTerminalFailureOutput(output)) trustedTerminalFailures.add(output);
  return output;
}

export function getTrustedLocalToolTerminalFailure(
  output: unknown,
): TerminalToolFailure | undefined {
  if (!isTerminalFailureOutput(output) || !trustedTerminalFailures.has(output)) return undefined;

  return {
    error: output.error,
    ...(typeof output.i18nKey === 'string' ? { i18nKey: output.i18nKey } : {}),
    ...(typeof output.userMessage === 'string' ? { userMessage: output.userMessage } : {}),
  };
}
