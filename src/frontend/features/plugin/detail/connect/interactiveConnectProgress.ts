import type { PluginAuthorizationState, PluginErrorReason } from '@/shared/contracts/plugins';

export type InteractiveConnectOperation = 'starting' | 'receiving' | 'confirming' | 'cancelling';

/** Background polling is deliberately absent: only user work and finalization change the UI. */
export function getInteractiveConnectProgress({
  state,
  connected,
  operation,
  checking,
  error,
}: {
  state: PluginAuthorizationState | null;
  connected: boolean;
  operation: InteractiveConnectOperation | null;
  checking: boolean;
  error: PluginErrorReason | null;
}) {
  if (connected) return 'connected';
  if (operation) return operation === 'confirming' ? 'finishing' : operation;
  if (checking) return 'checking';
  if (error) return null;
  if (!state) return 'loading';
  return state.status === 'ready' ? 'finishing' : null;
}
