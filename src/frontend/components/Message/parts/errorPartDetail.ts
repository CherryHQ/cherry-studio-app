import type { CherryMessagePart } from '@/shared/data/types/message';

type ErrorPartData = Extract<CherryMessagePart, { type: 'data-error' }>['data'];

export type ErrorPartFact = {
  /** Translation key for the row label; the renderer owns the copy. */
  labelKey: string;
  value: string | number;
};

export type ErrorPartDetail = {
  facts: readonly ErrorPartFact[];
  message?: string;
  responseBody?: string;
};

/**
 * Diagnostic detail for the error sheet, read from the persisted failure
 * snapshot. Only facts that exist become rows, in a fixed reading order.
 */
export function readErrorPartDetail(data: ErrorPartData): ErrorPartDetail {
  const source = readRecord(data.source);
  const context = readRecord(data.context);
  const layer = readText(source?.layer);
  const sourceCode = readText(source?.code);
  const message = readText(data.message);
  const responseBody = readText(context?.responseBody);

  const facts: ErrorPartFact[] = [];
  const addFact = (labelKey: string, value: string | number | undefined) => {
    if (value !== undefined) facts.push({ labelKey, value });
  };
  addFact('chat.errorPart.detail.reason', readText(data.reasonCode));
  addFact(
    'chat.errorPart.detail.source',
    layer && sourceCode ? `${layer} \u00B7 ${sourceCode}` : (layer ?? sourceCode),
  );
  addFact('chat.errorPart.detail.name', readText(source?.name) ?? readText(data.name));
  addFact('chat.errorPart.detail.status', readInteger(context?.statusCode));
  addFact('chat.errorPart.detail.provider', readText(context?.providerId));
  addFact('chat.errorPart.detail.model', readText(context?.modelId));
  addFact('chat.errorPart.detail.finishReason', readText(context?.finishReason));

  return {
    facts,
    ...(message !== undefined ? { message } : {}),
    ...(responseBody !== undefined ? { responseBody } : {}),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
