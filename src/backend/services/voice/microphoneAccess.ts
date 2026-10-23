import { VoiceError } from '@/shared/contracts/voice';

type Permission = { granted: boolean; canAskAgain: boolean };

export type SystemPromptQueue = {
  runWithSystemPrompt<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
};

/** Asks only when the system still allows it, through the shared system-prompt queue. */
export async function requireAccess(
  queue: SystemPromptQueue,
  permission: { get(): Promise<Permission>; request(): Promise<Permission> },
  signal: AbortSignal,
): Promise<void> {
  const result = await queue.runWithSystemPrompt(async () => {
    const current = await permission.get();
    return !current.granted && current.canAskAgain ? permission.request() : current;
  }, signal);
  if (result.granted) return;
  throw new VoiceError(
    result.canAskAgain ? 'permission-denied' : 'permission-blocked',
    'Microphone access was not granted.',
  );
}
