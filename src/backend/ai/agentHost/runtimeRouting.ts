/**
 * Agent Runtime registry and Router (docs/references/agent/agent-runtime.md).
 *
 * Both are Host-owned orchestration, not part of the Agent Runtime contract.
 * The registry maps descriptor ids to registered implementations; the Router is
 * the single implementation-selection point and fails closed when no registered
 * Runtime satisfies the route. Neither runtime ids nor the registry are exposed
 * through the Agent Protocol.
 *
 * Version 1 policy (user-approved): the registry registers only `ai-sdk`, and
 * the `local` execution target always routes there. The "Agent tool" routing
 * criterion is deferred until the Pi Runtime lands; `agentToolIds` is accepted
 * so the route input shape is already spec-complete.
 */

import type { AgentRuntime } from '@/backend/ai/agent';

export const AI_SDK_RUNTIME_ID = 'ai-sdk';

export type RuntimeRouteInput = {
  target: { kind: 'local' };
  agentToolIds: string[];
};

export interface AgentRuntimeRouter {
  resolve(input: RuntimeRouteInput): AgentRuntime;
}

export class AgentRuntimeRegistry {
  private readonly runtimes = new Map<string, AgentRuntime>();

  register(runtime: AgentRuntime): this {
    this.runtimes.set(runtime.descriptor.id, runtime);
    return this;
  }

  get(id: string): AgentRuntime | undefined {
    return this.runtimes.get(id);
  }
}

export function createAgentRuntimeRouter(registry: AgentRuntimeRegistry): AgentRuntimeRouter {
  return {
    resolve(input: RuntimeRouteInput): AgentRuntime {
      if (input.target.kind !== 'local') {
        throw new Error(`No runtime is registered for execution target: ${input.target.kind}`);
      }
      // V1: Pi is not registered yet, so every local route resolves ai-sdk.
      // When Pi lands, a non-empty agentToolIds selects it here.
      const runtime = registry.get(AI_SDK_RUNTIME_ID);
      if (!runtime) {
        throw new Error(`No runtime is registered for route: ${AI_SDK_RUNTIME_ID}`);
      }
      return runtime;
    },
  };
}
