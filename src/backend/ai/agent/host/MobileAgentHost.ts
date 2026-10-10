import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { BackgroundReplyLifecycle } from '@/backend/services/backgroundReply';
import type { AgentEvent, AgentProtocol } from '@/shared/contracts/agent';
import type { SkillsModule } from '@/shared/contracts/skills';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { AgentRuntime } from '../runtime';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import type { MobileAgentHostPorts } from './agentHostTypes';
import { DurableAgentHost } from './DurableAgentHost';

export type { MobileAgentHostNaming, MobileAgentHostPorts } from './agentHostTypes';

const logger = loggerService.withContext('MobileAgentHost');

/** App lifetime and composition over business intents. The only production loop belongs to Pi. */
@Injectable('MobileAgentHost')
@ServicePhase(Phase.PostReady)
@DependsOn(['AgentSessionStore', 'AgentHostDependencies', 'BackgroundReplyRuntime', 'AgentRuntime'])
@AppStatePolicy('continue')
export class MobileAgentHost extends BaseService implements AgentProtocol {
  private readonly host: DurableAgentHost;

  constructor(
    store: AgentSessionStore,
    ports: MobileAgentHostPorts,
    background: BackgroundReplyLifecycle,
    runtime: AgentRuntime,
  ) {
    super();
    if (!runtime.conversations) throw new Error('The local Agent requires a persistent runtime.');
    this.host = new DurableAgentHost(store, ports, background, runtime, runtime.conversations);
  }

  protected override async onInit() {
    await this.host.initialize();
    this.registerAppStateListener((state) => {
      if (state === 'active')
        void this.host
          .resumeSuspended()
          .catch((error: unknown) =>
            logger.error('Failed to resume durable Agent work', error as Error),
          );
    });
  }

  protected override async onStop() {
    await this.host.close();
  }

  /** Bootstrap supplies the same workflow used by the library UI before accepting turns. */
  configureSkills(workflow: SkillsModule): void {
    this.host.configureSkills(workflow);
  }

  hasPendingStorageWork() {
    return this.host.hasPendingStorageWork();
  }

  quiesce() {
    return this.host.quiesce();
  }

  getSessionStatus = (sessionId: string) => this.host.getSessionStatus(sessionId);
  subscribeSessionStatus = (sessionId: string, listener: () => void) =>
    this.host.subscribeSessionStatus(sessionId, listener);
  startSession: AgentProtocol['startSession'] = (input) => this.host.startSession(input);
  submitMessage: AgentProtocol['submitMessage'] = (input) => this.host.submitMessage(input);
  forkSession: AgentProtocol['forkSession'] = (input) => this.host.forkSession(input);
  retryMessage: AgentProtocol['retryMessage'] = (input) => this.host.retryMessage(input);
  deleteTurn: AgentProtocol['deleteTurn'] = (input) => this.host.deleteTurn(input);
  deleteSession: AgentProtocol['deleteSession'] = (input) => this.host.deleteSession(input);
  renameSession: AgentProtocol['renameSession'] = (input) => this.host.renameSession(input);
  cancelTurn: AgentProtocol['cancelTurn'] = (input) => this.host.cancelTurn(input);
  cancelSubmission: AgentProtocol['cancelSubmission'] = (input) =>
    this.host.cancelSubmission(input);
  respondApproval: AgentProtocol['respondApproval'] = (input) => this.host.respondApproval(input);
  respondQuestion: AgentProtocol['respondQuestion'] = (input) => this.host.respondQuestion(input);
  observeSession = (sessionId: string, listener: (event: AgentEvent) => void) =>
    this.host.observeSession(sessionId, listener);
}
