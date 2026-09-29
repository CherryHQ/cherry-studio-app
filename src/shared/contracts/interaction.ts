/** Product interaction values; source adapters own wire and runtime translation. */
export type InteractionResponse =
  | { kind: 'approve' }
  | { kind: 'deny'; reason?: string }
  | { kind: 'answer'; answers: Record<string, string> };
export type InteractionQuestion = {
  question: string;
  header?: string;
  multiple: boolean;
  options: readonly { label: string; description?: string }[];
};
