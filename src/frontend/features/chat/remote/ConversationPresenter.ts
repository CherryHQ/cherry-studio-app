import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type {
  HistoryVersion,
  RemoteConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';

/** Retains live rows until history has successfully installed the revision that removed them. */
export class ConversationPresenter {
  private readonly retained = new Map<
    string,
    { message: ConversationMessage; previousVersion?: HistoryVersion }
  >();
  private lastLive: readonly ConversationMessage[] = [];
  private previousVersion?: HistoryVersion;
  private readonly settled = new Set<string>();
  private result: readonly ConversationMessage[] = [];
  update(
    snapshot: RemoteConversationSnapshot,
    history: readonly ConversationMessage[],
    installedVersion: HistoryVersion | undefined,
    hasNewerMessages = false,
  ): readonly ConversationMessage[] {
    if (snapshot.freshness.state === 'retired') {
      this.retained.clear();
      this.lastLive = [];
      this.settled.clear();
      this.result = [];
      return this.result;
    }
    const liveKeys = new Set(snapshot.liveMessages.map((message) => message.key));
    for (const message of this.lastLive)
      if (!liveKeys.has(message.key) && !this.retained.has(message.key))
        this.retained.set(message.key, { message, previousVersion: this.previousVersion });
    const persistedKeys = new Set(history.map((message) => message.key));
    const terminalKeys = new Set(
      snapshot.executions.flatMap((execution) =>
        execution.terminal && !this.settled.has(execution.id)
          ? [execution.terminal.message.key]
          : [],
      ),
    );
    for (const [key, value] of this.retained) {
      if (
        liveKeys.has(key) ||
        (!terminalKeys.has(key) &&
          installedVersion === snapshot.historyVersion &&
          installedVersion !== undefined &&
          (persistedKeys.has(key) || installedVersion !== value.previousVersion))
      )
        this.retained.delete(key);
    }
    this.lastLive = snapshot.liveMessages;
    this.previousVersion = snapshot.historyVersion;
    if (hasNewerMessages) return history;
    const merged = new Map(history.map((message) => [message.key, message]));
    for (const { message } of this.retained.values())
      if (!merged.has(message.key)) merged.set(message.key, message);
    for (const message of snapshot.liveMessages) merged.set(message.key, message);
    const executions = new Set<string>(snapshot.executions.map((execution) => execution.id));
    for (const ref of this.settled) if (!executions.has(ref)) this.settled.delete(ref);
    for (const execution of snapshot.executions) {
      const terminal = execution.terminal;
      if (!terminal || this.settled.has(execution.id)) continue;
      const row = terminal.message;
      const persisted = history.find((message) => message.key === row.key);
      if (
        terminal.durable &&
        terminal.historyReady &&
        installedVersion === snapshot.historyVersion &&
        persisted?.state === row.state
      ) {
        this.settled.add(execution.id);
        this.retained.delete(row.key);
        merged.set(row.key, persisted);
        continue;
      }
      const existing = merged.get(row.key);
      const content =
        existing?.display.data?.parts?.flatMap((part, index) =>
          part.type === 'data-error'
            ? []
            : [{ part, key: existing.display.data?.partKeys?.[index] }],
        ) ?? [];
      merged.set(
        row.key,
        existing
          ? {
              ...existing,
              state: row.state,
              display: {
                ...existing.display,
                status: row.display.status,
                data: {
                  ...existing.display.data,
                  parts: [...content.map(({ part }) => part), ...(row.display.data?.parts ?? [])],
                  partKeys: content.every(({ key }) => key !== undefined)
                    ? [...content.map(({ key }) => key!), ...(row.display.data?.partKeys ?? [])]
                    : undefined,
                },
              },
            }
          : row,
      );
    }
    const next = [...merged.values()];
    if (
      next.length !== this.result.length ||
      next.some((message, index) => message !== this.result[index])
    )
      this.result = next;
    return this.result;
  }
}
