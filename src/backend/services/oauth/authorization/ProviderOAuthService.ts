import { randomUUID } from 'expo-crypto';

import type { OAuthModule, StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { describeOAuthError, OAuthServiceError } from '@/shared/oauth';
import type {
  OAuthFlowCompletionInput,
  OAuthFlowCompletionResult,
  OAuthFlowPresentation,
  OAuthProviderContext,
  OAuthProviderStatus,
} from '@/shared/oauth';

import type { OAuthFlowRegistry } from './OAuthFlowRegistry';
import type { ActiveOAuthFlow, OAuthFlowAdapter } from './types';
import { toCompletionPayload } from './types';

const logger = loggerService.withContext('ProviderOAuthService');
const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 10 * 60 * 1000;

export class ProviderOAuthService implements OAuthModule {
  private readonly activeFlows = new Map<string, ActiveOAuthFlow>();
  private readonly pendingStarts = new Map<string, AbortController>();

  constructor(private readonly registry: OAuthFlowRegistry) {}

  dispose(): void {
    for (const controller of this.pendingStarts.values()) {
      controller.abort(new Error('OAuth service disposed'));
    }
    this.pendingStarts.clear();

    for (const flow of this.activeFlows.values()) {
      this.deleteFlow(flow);
      flow.controller.abort(new Error('OAuth service disposed'));
    }
  }

  async startAuthorization(input: StartOAuthAuthorizationInput): Promise<OAuthFlowPresentation> {
    const adapter = this.getAdapter(input.providerId);
    this.cancelProviderFlows(input.providerId, 'OAuth authorization superseded');

    const previousPending = this.pendingStarts.get(input.providerId);
    previousPending?.abort(new Error('OAuth authorization superseded'));

    const controller = new AbortController();
    this.pendingStarts.set(input.providerId, controller);

    try {
      const session = await adapter.start(input, controller.signal);
      if (controller.signal.aborted || this.pendingStarts.get(input.providerId) !== controller) {
        throw controller.signal.reason ?? new Error('OAuth authorization superseded');
      }

      this.pendingStarts.delete(input.providerId);
      return this.registerFlow(adapter, session, controller);
    } catch (error) {
      if (this.pendingStarts.get(input.providerId) === controller) {
        this.pendingStarts.delete(input.providerId);
      }
      throw error;
    }
  }

  async getAuthorization(flowId: string): Promise<OAuthFlowPresentation> {
    return this.getActiveFlow(flowId).presentation;
  }

  async cancelAuthorization(flowId: string): Promise<void> {
    const flow = this.activeFlows.get(flowId);
    if (!flow) return;
    this.deleteFlow(flow);
    flow.controller.abort(new Error('OAuth authorization cancelled'));
  }

  async getStatus(providerId: string): Promise<OAuthProviderStatus> {
    const adapter = this.getAdapter(providerId);
    return {
      ...(await adapter.getStatus()),
      flowType: adapter.flowType,
      providerId,
    };
  }

  async completeAuthorization(input: OAuthFlowCompletionInput): Promise<OAuthFlowCompletionResult> {
    const flow = this.getActiveFlow(input.flowId);
    if (flow.presentation.type !== input.type) {
      throw new OAuthServiceError(
        `OAuth completion type does not match flow ${input.flowId}`,
        undefined,
        'OAuthFlowTypeMismatch',
      );
    }
    if (flow.completing) {
      throw new OAuthServiceError(
        `OAuth flow ${input.flowId} is already completing`,
        undefined,
        'OAuthFlowAlreadyCompleting',
      );
    }

    flow.completing = true;
    try {
      const result = await flow.session.complete(
        toCompletionPayload(input),
        flow.controller.signal,
      );
      if (result.status === 'completed') {
        this.deleteFlow(flow);
        logger.info(`${flow.adapter.providerId} OAuth flow completed`);
      } else {
        flow.completing = false;
      }
      return result;
    } catch (error) {
      this.deleteFlow(flow);
      logger.error(`${flow.adapter.providerId} OAuth flow failed`, describeOAuthError(error));
      throw error instanceof OAuthServiceError
        ? error
        : new OAuthServiceError(`${flow.adapter.providerId} OAuth flow failed`, error);
    }
  }

  async logout(providerId: string, context: OAuthProviderContext = {}): Promise<void> {
    this.cancelProviderFlows(providerId, 'OAuth authorization cancelled by logout');
    await this.getAdapter(providerId).logout(context);
  }

  private registerFlow(
    adapter: OAuthFlowAdapter,
    session: Awaited<ReturnType<OAuthFlowAdapter['start']>>,
    controller: AbortController,
  ): OAuthFlowPresentation {
    const flowId = randomUUID();
    const expiresAt = Date.now() + (session.expiresInMs ?? DEFAULT_AUTHORIZATION_TIMEOUT_MS);
    const presentation = {
      ...session.presentation,
      expiresAt,
      flowId,
      providerId: adapter.providerId,
    } as OAuthFlowPresentation;
    const flow = {
      adapter,
      completing: false,
      controller,
      expiresAt,
      flowId,
      presentation,
      session,
      timeout: setTimeout(() => {
        const current = this.activeFlows.get(flowId);
        if (current) {
          this.deleteFlow(current);
          current.controller.abort(new Error('OAuth authorization expired'));
        }
      }, session.expiresInMs ?? DEFAULT_AUTHORIZATION_TIMEOUT_MS),
    } satisfies ActiveOAuthFlow;

    this.activeFlows.set(flowId, flow);
    return presentation;
  }

  private getActiveFlow(flowId: string): ActiveOAuthFlow {
    const flow = this.activeFlows.get(flowId);
    if (!flow || Date.now() >= flow.expiresAt) {
      if (flow) {
        this.deleteFlow(flow);
        flow.controller.abort(new Error('OAuth authorization expired'));
      }
      throw new OAuthServiceError(
        `OAuth flow ${flowId} is missing or expired`,
        undefined,
        'OAuthFlowExpired',
      );
    }
    return flow;
  }

  private getAdapter(providerId: string): OAuthFlowAdapter {
    const adapter = this.registry.get(providerId);
    if (!adapter) {
      throw new OAuthServiceError(
        `No OAuth provider is registered for ${providerId}`,
        undefined,
        'UnknownOAuthProvider',
      );
    }
    return adapter;
  }

  private cancelProviderFlows(providerId: string, reason: string): void {
    for (const flow of this.activeFlows.values()) {
      if (flow.adapter.providerId === providerId) {
        this.deleteFlow(flow);
        flow.controller.abort(new Error(reason));
      }
    }
  }

  private deleteFlow(flow: ActiveOAuthFlow): void {
    clearTimeout(flow.timeout);
    this.activeFlows.delete(flow.flowId);
  }
}
