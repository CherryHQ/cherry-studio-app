import type { AgentLoopHooks, ErrorContext } from '../loop/types';

export function composeHooks(parts: ReadonlyArray<Partial<AgentLoopHooks>>): AgentLoopHooks {
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];

  return {
    onAbort: chainVoid(parts, 'onAbort'),
    onError: chainOnError(parts),
    onFinish: chainVoid(parts, 'onFinish'),
    onStart: chainVoid(parts, 'onStart'),
    onStepFinish: chainVoid(parts, 'onStepFinish'),
    onToolExecutionEnd: chainVoid(parts, 'onToolExecutionEnd'),
    onToolExecutionStart: chainVoid(parts, 'onToolExecutionStart'),
    prepareStep: chainPrepareStep(parts),
  };
}

type VoidHookKey =
  | 'onAbort'
  | 'onFinish'
  | 'onStart'
  | 'onStepFinish'
  | 'onToolExecutionEnd'
  | 'onToolExecutionStart';

function chainVoid<K extends VoidHookKey>(
  parts: ReadonlyArray<Partial<AgentLoopHooks>>,
  key: K,
): AgentLoopHooks[K] | undefined {
  type Hook = NonNullable<AgentLoopHooks[K]>;
  const hooks = parts.map((part) => part[key]).filter((hook): hook is Hook => Boolean(hook));
  if (hooks.length === 0) return undefined;
  if (hooks.length === 1) return hooks[0];

  return (async (...args: Parameters<Hook>) => {
    for (const hook of hooks) {
      try {
        await (hook as (...values: Parameters<Hook>) => unknown)(...args);
      } catch {}
    }
  }) as AgentLoopHooks[K];
}

function chainOnError(
  parts: ReadonlyArray<Partial<AgentLoopHooks>>,
): AgentLoopHooks['onError'] | undefined {
  const hooks = parts
    .map((part) => part.onError)
    .filter((hook): hook is NonNullable<AgentLoopHooks['onError']> => Boolean(hook));
  if (hooks.length === 0) return undefined;
  if (hooks.length === 1) return hooks[0];

  return async (context: ErrorContext) => {
    let action: 'abort' | 'retry' = 'abort';
    for (const hook of hooks) {
      try {
        if ((await hook(context)) === 'retry') action = 'retry';
      } catch {}
    }
    return action;
  };
}

function chainPrepareStep(
  parts: ReadonlyArray<Partial<AgentLoopHooks>>,
): AgentLoopHooks['prepareStep'] | undefined {
  const hooks = parts
    .map((part) => part.prepareStep)
    .filter((hook): hook is NonNullable<AgentLoopHooks['prepareStep']> => Boolean(hook));
  if (hooks.length === 0) return undefined;
  if (hooks.length === 1) return hooks[0];

  return async (options) => {
    let current = options;
    let merged: Record<string, unknown> | undefined;
    for (const hook of hooks) {
      const result = await hook(current);
      if (!result) continue;
      merged = { ...merged, ...result };
      if (result.messages) current = { ...current, messages: result.messages };
    }
    return merged as Awaited<ReturnType<NonNullable<AgentLoopHooks['prepareStep']>>>;
  };
}
