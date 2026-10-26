export const DEFAULT_PI_OUTPUT_RESERVATION_TOKENS = 65_536;

/** Window-sized capabilities need a bounded default reservation, not a smaller model capability. */
export function resolvePiOutputReservation(
  ceiling: number,
  contextWindow: number | undefined,
  explicitMaxTokens?: number,
): number {
  if (explicitMaxTokens !== undefined) return explicitMaxTokens;
  if (
    Number.isInteger(ceiling) &&
    ceiling > 0 &&
    contextWindow !== undefined &&
    Number.isInteger(contextWindow) &&
    contextWindow > 0 &&
    ceiling >= contextWindow
  ) {
    return Math.min(ceiling, DEFAULT_PI_OUTPUT_RESERVATION_TOKENS);
  }
  return ceiling;
}
