import type { LanguageServingSupport } from '@/backend/ai/provider/systemModelSupport';
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeDescriptor,
  RuntimeModel,
  RuntimeModelPreflight,
} from '../types';
import { supportsPiLanguageModel } from './piLanguageBinding';
import { createPiModelResolver } from './piModelResolver';
import { listPiOAuthModels } from './piOAuthModels';
import { PiProviderAccountAdapter } from './PiProviderAccountAdapter';
import { PiRuntime } from './PiRuntime';

/**
 * The composition-root binding of the Agent Runtime contract to Pi.
 *
 * This service is the only place that names a concrete Runtime. Replacing the
 * Runtime means adding an implementation directory and re-pointing the
 * `AgentRuntime` registration; consumers depend on the `AgentRuntime` contract
 * and never construct a Runtime themselves. It also answers language serving
 * support, so system model support swaps together with the Runtime.
 */
@Injectable('AgentRuntime')
@DependsOn(['ProviderAccountRuntime'])
@ServicePhase(Phase.PostReady)
export class PiRuntimeService extends BaseService implements AgentRuntime, LanguageServingSupport {
  private readonly runtime: AgentRuntime;
  readonly providerAccounts = new PiProviderAccountAdapter();

  constructor() {
    super();
    this.runtime = new PiRuntime(
      createPiModelResolver({
        resolveAuth: (provider, signal) => this.providerAccounts.resolveAuth(provider, signal),
        resolveCopilotAuto: (provider, sessionId, request, signal) =>
          this.providerAccounts.resolveCopilotAuto(provider, sessionId, request, signal),
      }),
    );
  }

  async listAuthenticatedModels(provider: Provider, signal: AbortSignal) {
    const auth = await this.providerAccounts.resolveAuth(provider, signal);
    return auth ? listPiOAuthModels(provider, auth, signal) : undefined;
  }

  get descriptor(): RuntimeDescriptor {
    return this.runtime.descriptor;
  }

  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight> {
    return this.runtime.preflightModel(model);
  }

  open(): Promise<AgentRuntimeSession> {
    return this.runtime.open();
  }

  supportsLanguageModel(provider: Provider, model: Model): boolean {
    return supportsPiLanguageModel(provider, model);
  }
}
