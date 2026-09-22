import type { ToolInputPreviewSource } from '@/frontend/components/Message';
import type { AgentToolInputPreview } from '@/shared/contracts/agent';

type PreviewEntry = {
  listeners: Set<() => void>;
  preview?: AgentToolInputPreview;
};

/** Chat-client-owned ephemeral content; publishing does not invalidate the message list. */
export class ToolInputPreviewStore implements ToolInputPreviewSource {
  private readonly messages = new Map<string, Map<string, PreviewEntry>>();

  getSnapshot(messageId: string, toolCallId: string): AgentToolInputPreview | undefined {
    return this.messages.get(messageId)?.get(toolCallId)?.preview;
  }

  subscribe(messageId: string, toolCallId: string, listener: () => void): () => void {
    const entry = this.getEntry(messageId, toolCallId);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entry.preview === undefined) {
        const message = this.messages.get(messageId);
        message?.delete(toolCallId);
        if (message?.size === 0) this.messages.delete(messageId);
      }
    };
  }

  set(messageId: string, toolCallId: string, preview: AgentToolInputPreview | undefined): void {
    if (preview === undefined && !this.messages.get(messageId)?.has(toolCallId)) return;
    const entry = this.getEntry(messageId, toolCallId);
    if (
      entry.preview?.text === preview?.text &&
      entry.preview?.name === preview?.name &&
      entry.preview?.truncated === preview?.truncated
    )
      return;
    entry.preview = preview;
    for (const listener of entry.listeners) listener();
  }

  clearMessage(messageId: string): void {
    const message = this.messages.get(messageId);
    if (!message) return;
    for (const [toolCallId, entry] of message) {
      this.set(messageId, toolCallId, undefined);
      if (entry.listeners.size === 0) message.delete(toolCallId);
    }
    if (message.size === 0) this.messages.delete(messageId);
  }

  clear(): void {
    for (const messageId of this.messages.keys()) this.clearMessage(messageId);
  }

  private getEntry(messageId: string, toolCallId: string): PreviewEntry {
    let message = this.messages.get(messageId);
    if (!message) {
      message = new Map();
      this.messages.set(messageId, message);
    }
    let entry = message.get(toolCallId);
    if (!entry) {
      entry = { listeners: new Set() };
      message.set(toolCallId, entry);
    }
    return entry;
  }
}
