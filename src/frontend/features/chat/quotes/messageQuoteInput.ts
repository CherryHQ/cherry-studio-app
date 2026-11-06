import type { AgentInputPart, QuoteFields } from '@/shared/contracts/agent';

export function attachMessageQuote(parts: AgentInputPart[], fields: QuoteFields): AgentInputPart[] {
  if (!fields.quotes) return parts;
  const first = parts.findIndex((part) => part.type === 'text');
  if (first < 0) return [{ type: 'text', text: '', ...fields }, ...parts];
  return parts.map((part, index) => (index === first ? { ...part, ...fields } : part));
}
