import { createTextPreview } from '@/shared/utils/textPreview';

import type { RuntimeTool, RuntimeToolInputPreview } from '../types';

const PREVIEW_INTERVAL_MS = 150;

/** Coalesces provider updates before copying or serializing any growing file body. */
export class PiToolInputPreviewBuffer {
  private readonly pending = new Map<string, { text: string; name?: string }>();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly publish: (toolCallId: string, preview: RuntimeToolInputPreview) => void,
  ) {}

  update(
    toolCallId: string,
    fields: NonNullable<RuntimeTool['inputPreview']>,
    input: unknown,
  ): void {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return;
    const values = input as Record<string, unknown>;
    const text = values[fields.textField];
    if (typeof text !== 'string') return;
    const name = fields.nameField ? values[fields.nameField] : undefined;
    this.pending.set(toolCallId, {
      text,
      ...(typeof name === 'string' ? { name: name.slice(0, 255) } : {}),
    });
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      for (const id of this.pending.keys()) this.flush(id);
    }, PREVIEW_INTERVAL_MS);
  }

  flush(toolCallId: string): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) return;
    this.pending.delete(toolCallId);
    this.publish(toolCallId, {
      ...createTextPreview(pending.text),
      ...(pending.name !== undefined ? { name: pending.name } : {}),
    });
    if (this.pending.size === 0 && this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}
