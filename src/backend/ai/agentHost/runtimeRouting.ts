/**
 * Agent Runtime registry and Router (docs/references/agent/agent-runtime.md).
 *
 * Both are Host-owned orchestration, not part of the Agent Runtime contract.
 * The registry maps descriptor ids to registered implementations; the Router is
 * the single implementation-selection point and fails closed when no registered
 * Runtime satisfies the route. Neither runtime ids nor the registry are exposed
 * through the Agent Protocol.
 *
 * Version 1 registers only `ai-sdk`, and the `local` execution target always
 * routes there. Future routing inputs and policy ownership are deliberately
 * unspecified; they may belong to Agent, Session, connection, or application
 * policy and are added only after that design is decided.
 */

import type { AgentRuntime } from '@/backend/ai/agent';

export const AI_SDK_RUNTIME_ID = 'ai-sdk';

export type RuntimeRouteInput = {
  target: { kind: 'local' };
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
      // V1: every supported local route resolves to the sole registered Runtime.
      const runtime = registry.get(AI_SDK_RUNTIME_ID);
      if (!runtime) {
        throw new Error(`No runtime is registered for route: ${AI_SDK_RUNTIME_ID}`);
      }
      return runtime;
    },
  };
}
