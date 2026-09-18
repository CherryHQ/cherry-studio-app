import { AppState } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnectionRuntime } from '@/backend/services/desktopConnections/DesktopConnectionRuntime';
import type { AgentController, AgentControllerModule } from '@/shared/contracts/agent/controller';

import { RemoteAgentAdapter } from './RemoteAgentAdapter';

@Injectable('RemoteAgentRuntime')
@DependsOn(['DesktopConnectionRuntime', 'DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('foreground-refresh')
export class RemoteAgentRuntime extends BaseService implements AgentControllerModule {
  private credentials?: DesktopConnectionRuntime;
  private files?: Pick<FileEntryService, 'create'>;
  private journal?: RemoteAgentCommandJournal;
  private readonly sources = new Map<string, { adapter: RemoteAgentAdapter; users: number }>();
  private readonly drains = new Set<Promise<void>>();
  private stopped = false;
  configure(credentials: DesktopConnectionRuntime, files: Pick<FileEntryService, 'create'>) {
    this.credentials = credentials;
    this.files = files;
  }
  protected onInit() {
    this.journal = new RemoteAgentCommandJournal();
    this.registerDisposable(
      this.credentials!.subscribeCredentials((id) => {
        const source = this.sources.get(id);
        if (source) {
          this.sources.delete(id);
          this.close(source.adapter);
        }
        this.journal!.removeConnection(id);
      }),
    );
    this.registerAppStateListener((state) => {
      for (const { adapter, users } of this.sources.values())
        adapter.setForeground(state === 'active' && users > 0);
    });
  }
  async open(id: string): Promise<AgentController> {
    if (this.stopped || !this.journal || !this.credentials || !this.files)
      throw new Error('REMOTE_AGENT_NOT_READY');
    let source = this.sources.get(id);
    if (!source) {
      const adapter = new RemoteAgentAdapter(id, this.credentials, this.journal, this.files);
      source = { adapter, users: 0 };
      this.sources.set(id, source);
      if (AppState.currentState !== 'active') adapter.setForeground(false);
    }
    source.users++;
    if (source.users === 1) source.adapter.setForeground(AppState.currentState === 'active');
    const retained = source;
    const { adapter } = retained;
    let disposed = false;
    const subscriptions = new Set<() => void>();
    const retain = (unsubscribe: () => void) => {
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    };
    return {
      version: 2,
      getConnection: adapter.getConnection,
      subscribeConnection: (listener) => retain(adapter.subscribeConnection(listener)),
      reconnect: adapter.reconnect,
      getActions: adapter.getActions,
      subscribeActions: (listener) => retain(adapter.subscribeActions(listener)),
      listAgents: adapter.listAgents.bind(adapter),
      listWorkspaces: adapter.listWorkspaces.bind(adapter),
      listSessions: adapter.listSessions.bind(adapter),
      history: adapter.history.bind(adapter),
      observe: (sessionId, listener) => retain(adapter.observe(sessionId, listener)),
      createSession: adapter.createSession.bind(adapter),
      sendMessage: adapter.sendMessage.bind(adapter),
      cancel: adapter.cancel.bind(adapter),
      respond: adapter.respond.bind(adapter),
      retryAction: adapter.retryAction.bind(adapter),
      dismissAction: adapter.dismissAction.bind(adapter),
      interaction: adapter.interaction.bind(adapter),
      details: adapter.details.bind(adapter),
      readDetail: adapter.readDetail.bind(adapter),
      download: adapter.download.bind(adapter),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        subscriptions.clear();
        if (this.sources.get(id) !== retained || --retained.users > 0) return;
        adapter.setForeground(false);
      },
    };
  }
  private close(adapter: RemoteAgentAdapter) {
    adapter.dispose();
    const drain = adapter.drain();
    this.drains.add(drain);
    void drain.finally(() => this.drains.delete(drain));
  }
  protected async onStop() {
    this.stopped = true;
    for (const source of this.sources.values()) this.close(source.adapter);
    this.sources.clear();
    await Promise.allSettled([...this.drains]);
  }
}
