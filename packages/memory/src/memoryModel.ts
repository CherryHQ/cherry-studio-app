export interface MemoryModel {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  countTokens(text: string): number;
  /** No tools, retries or inherited conversation; the host retains provider/usage ownership. */
  generate(input: {
    instructions: string;
    text: string;
    signal: AbortSignal;
    maxOutputTokens: number;
  }): Promise<{ text: string; finishReason: string }>;
}
export class DreamingError extends Error {
  constructor(
    readonly reason: 'model' | 'budget' | 'conflict' | 'backup' | 'output' | 'unavailable',
  ) {
    super('Memory maintenance requires attention: ' + reason);
    this.name = 'DreamingError';
  }
}
