export type ChatRuntime = 'ai-sdk' | 'pi';

export function getChatRuntime(): ChatRuntime {
  const configured = process.env.EXPO_PUBLIC_CHAT_RUNTIME?.trim();
  if (configured === 'pi' || configured === 'ai-sdk') return configured;
  if (configured) {
    throw new Error(`Invalid EXPO_PUBLIC_CHAT_RUNTIME "${configured}"; expected "pi" or "ai-sdk"`);
  }

  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'pi' : 'ai-sdk';
}
